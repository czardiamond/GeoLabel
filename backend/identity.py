"""Local invitation-based identity and organization membership APIs.

SSO, LDAP and MFA are intentionally not emulated here; those require a chosen
identity provider and deployment-level secrets/configuration.
"""
import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import (
    AuditEvent,
    AuthThrottle,
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
    UserAccount,
    UserNotification,
    UserSession,
    utcnow_naive,
)

router = APIRouter(tags=["identity and organizations"])
OrgRole = Literal["owner", "admin", "annotator", "reviewer", "analyst"]
PASSWORD_ITERATIONS = 310_000


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    owner_email: EmailStr
    owner_name: str = Field(min_length=2, max_length=160)


class InvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["admin", "annotator", "reviewer", "analyst"] = "annotator"


class InvitationAccept(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    display_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=12, max_length=256)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class MembershipRoleUpdate(BaseModel):
    role: Literal["admin", "annotator", "reviewer", "analyst"]


class NotificationRead(BaseModel):
    read: bool = True


class MemberContext(BaseModel):
    user_id: str
    email: str
    display_name: str


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${derived.hex()}"


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(derived.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _issue_session(db: Session, user: UserAccount) -> dict:
    raw = secrets.token_urlsafe(48)
    session = UserSession(
        user_id=user.id,
        token_hash=_hash_token(raw),
        expires_at=utcnow_naive() + timedelta(hours=max(1, min(settings.USER_SESSION_HOURS, 168))),
    )
    db.add(session)
    return {"access_token": raw, "token_type": "bearer", "expires_at": session.expires_at}


def require_member(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> MemberContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in with an organization account to continue.", headers={"WWW-Authenticate": "Bearer"})
    raw = authorization[7:].strip()
    if not raw:
        raise HTTPException(status_code=401, detail="The session token is missing.")
    session = db.query(UserSession).filter(
        UserSession.token_hash == _hash_token(raw),
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > utcnow_naive(),
    ).first()
    if not session:
        raise HTTPException(status_code=401, detail="The session is invalid or expired.", headers={"WWW-Authenticate": "Bearer"})
    user = db.query(UserAccount).filter(UserAccount.id == session.user_id, UserAccount.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="The account is unavailable.")
    return MemberContext(user_id=user.id, email=user.email, display_name=user.display_name)


def membership_for(db: Session, user_id: str, organization_id: str) -> OrganizationMembership:
    membership = db.query(OrganizationMembership).filter_by(user_id=user_id, organization_id=organization_id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="This account is not a member of that organization.")
    return membership


def require_roles(membership: OrganizationMembership, *roles: str) -> None:
    if membership.role not in roles:
        raise HTTPException(status_code=403, detail=f"This action requires one of these organization roles: {', '.join(roles)}.")


def audit(db: Session, organization_id: str | None, user_id: str | None, action: str, resource_type: str, resource_id: str, details: dict | None = None) -> None:
    item = AuditEvent(
        organization_id=organization_id,
        actor_user_id=user_id,
        actor_kind="user" if user_id else "service",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    item.details = details or {}
    db.add(item)


def notify(db: Session, user_id: str, title: str, message: str, resource_type: str, resource_id: str) -> None:
    db.add(UserNotification(
        user_id=user_id,
        title=title[:200],
        message=message[:4000],
        resource_type=resource_type,
        resource_id=resource_id,
    ))


def _require_service_key(authorization: str | None) -> None:
    configured = settings.API_KEY
    if not configured or len(configured) < 32:
        raise HTTPException(status_code=503, detail="Service-key authentication is not configured safely.")
    provided = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else ""
    if not provided or not secrets.compare_digest(provided, configured):
        raise HTTPException(status_code=401, detail="A valid service API key is required.", headers={"WWW-Authenticate": "Bearer"})


def _memberships(db: Session, user_id: str) -> list[dict]:
    rows = db.query(OrganizationMembership, Organization).join(
        Organization, Organization.id == OrganizationMembership.organization_id
    ).filter(OrganizationMembership.user_id == user_id).all()
    return [{"organization_id": membership.organization_id, "organization_name": org.name, "role": membership.role} for membership, org in rows]


@router.post("/organizations", status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """Bootstrap an organization using the deployment owner key; invite token is returned once for delivery."""
    _require_service_key(authorization)
    email = _normalize_email(str(payload.owner_email))
    user = db.query(UserAccount).filter(UserAccount.email == email).first()
    if not user:
        user = UserAccount(email=email, display_name=payload.owner_name.strip())
        db.add(user)
        db.flush()
    org = Organization(name=payload.name.strip())
    db.add(org)
    db.flush()
    db.add(OrganizationMembership(organization_id=org.id, user_id=user.id, role="owner"))
    raw = secrets.token_urlsafe(40)
    invitation = OrganizationInvitation(
        organization_id=org.id,
        email=email,
        role="owner",
        token_hash=_hash_token(raw),
        expires_at=utcnow_naive() + timedelta(days=7),
    )
    db.add(invitation)
    audit(db, org.id, None, "organization.created", "organization", org.id, {"name": org.name})
    db.commit()
    return {
        "id": org.id,
        "name": org.name,
        "owner_email": email,
        "invitation_token": raw,
        "invitation_expires_at": invitation.expires_at,
        "delivery": "manual",
    }


@router.post("/auth/invitations/accept")
def accept_invitation(payload: InvitationAccept, db: Session = Depends(get_db)):
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.token_hash == _hash_token(payload.token),
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.expires_at > utcnow_naive(),
    ).first()
    if not invitation:
        raise HTTPException(status_code=400, detail="This invitation is invalid, expired, or already used.")
    email = _normalize_email(invitation.email)
    user = db.query(UserAccount).filter(UserAccount.email == email).first()
    if not user:
        user = UserAccount(email=email, display_name=payload.display_name.strip(), password_hash=_hash_password(payload.password))
        db.add(user)
        db.flush()
    else:
        user.display_name = payload.display_name.strip()
        if not user.password_hash:
            user.password_hash = _hash_password(payload.password)
        user.is_active = True
    existing = db.query(OrganizationMembership).filter_by(organization_id=invitation.organization_id, user_id=user.id).first()
    if not existing:
        db.add(OrganizationMembership(organization_id=invitation.organization_id, user_id=user.id, role=invitation.role))
    invitation.accepted_at = utcnow_naive()
    access = _issue_session(db, user)
    audit(db, invitation.organization_id, user.id, "invitation.accepted", "invitation", invitation.id, {"role": invitation.role})
    db.commit()
    return {**access, "user": {"id": user.id, "email": user.email, "display_name": user.display_name}, "organizations": _memberships(db, user.id)}


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = _normalize_email(str(payload.email))
    client_ip = request.client.host if request.client else "unknown"
    subject_hash = _hash_token(f"login\0{email}\0{client_ip}")
    now = utcnow_naive()
    window_seconds = max(60, min(int(settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS), 86400))
    max_failures = max(3, min(int(settings.LOGIN_RATE_LIMIT_ATTEMPTS), 100))
    throttle = db.query(AuthThrottle).filter(AuthThrottle.subject_hash == subject_hash).with_for_update().first()
    if throttle and throttle.blocked_until and throttle.blocked_until > now:
        retry_after = max(1, int((throttle.blocked_until - now).total_seconds()))
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.", headers={"Retry-After": str(retry_after)})
    if throttle and (now - throttle.window_started_at).total_seconds() >= window_seconds:
        throttle.window_started_at = now
        throttle.failed_count = 0
        throttle.blocked_until = None
    user = db.query(UserAccount).filter(UserAccount.email == email, UserAccount.is_active.is_(True)).first()
    if not user or not _verify_password(payload.password, user.password_hash):
        if not throttle:
            throttle = AuthThrottle(subject_hash=subject_hash, window_started_at=now, failed_count=0)
            db.add(throttle)
        throttle.failed_count += 1
        throttle.updated_at = now
        if throttle.failed_count >= max_failures:
            throttle.blocked_until = now + timedelta(seconds=max(60, min(int(settings.LOGIN_RATE_LIMIT_BLOCK_SECONDS), 86400)))
        db.commit()
        if throttle.blocked_until and throttle.blocked_until > now:
            retry_after = max(1, int((throttle.blocked_until - now).total_seconds()))
            raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.", headers={"Retry-After": str(retry_after)})
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if throttle:
        db.delete(throttle)
    user.last_login_at = now
    access = _issue_session(db, user)
    db.commit()
    return {**access, "user": {"id": user.id, "email": user.email, "display_name": user.display_name}, "organizations": _memberships(db, user.id)}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    raw = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else ""
    if raw:
        session = db.query(UserSession).filter(UserSession.token_hash == _hash_token(raw), UserSession.revoked_at.is_(None)).first()
        if session:
            session.revoked_at = utcnow_naive()
            db.commit()
    return None


@router.get("/auth/me")
def who_am_i(member: MemberContext = Depends(require_member), db: Session = Depends(get_db)):
    return {"id": member.user_id, "email": member.email, "display_name": member.display_name, "organizations": _memberships(db, member.user_id)}


@router.get("/organizations/{organization_id}/members")
def list_members(
    organization_id: str,
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    membership = membership_for(db, member.user_id, organization_id)
    require_roles(membership, "owner", "admin", "reviewer")
    rows = db.query(OrganizationMembership, UserAccount).join(UserAccount, UserAccount.id == OrganizationMembership.user_id).filter(
        OrganizationMembership.organization_id == organization_id
    ).order_by(UserAccount.email.asc()).all()
    return [{"user_id": m.user_id, "email": u.email, "display_name": u.display_name, "role": m.role, "joined_at": m.created_at} for m, u in rows]


@router.post("/organizations/{organization_id}/invitations", status_code=status.HTTP_201_CREATED)
def invite_member(
    organization_id: str,
    payload: InvitationCreate,
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    membership = membership_for(db, member.user_id, organization_id)
    require_roles(membership, "owner", "admin")
    email = _normalize_email(str(payload.email))
    active = db.query(OrganizationMembership).join(UserAccount, UserAccount.id == OrganizationMembership.user_id).filter(
        OrganizationMembership.organization_id == organization_id, UserAccount.email == email
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="That email is already a member of this organization.")
    raw = secrets.token_urlsafe(40)
    invitation = OrganizationInvitation(
        organization_id=organization_id,
        email=email,
        role=payload.role,
        token_hash=_hash_token(raw),
        expires_at=utcnow_naive() + timedelta(days=7),
        created_by_user_id=member.user_id,
    )
    db.add(invitation)
    db.flush()
    audit(db, organization_id, member.user_id, "invitation.created", "invitation", invitation.id, {"email": email, "role": payload.role})
    db.commit()
    return {"id": invitation.id, "email": email, "role": invitation.role, "token": raw, "expires_at": invitation.expires_at, "delivery": "manual"}


@router.patch("/organizations/{organization_id}/members/{user_id}")
def update_member_role(
    organization_id: str,
    user_id: str,
    payload: MembershipRoleUpdate,
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    actor = membership_for(db, member.user_id, organization_id)
    require_roles(actor, "owner", "admin")
    target = membership_for(db, user_id, organization_id)
    if target.role == "owner":
        raise HTTPException(status_code=409, detail="Transfer or bootstrap ownership through an explicit administrator workflow; owner role cannot be changed here.")
    if actor.role != "owner" and payload.role in {"admin"}:
        raise HTTPException(status_code=403, detail="Only an owner may grant administrator access.")
    previous = target.role
    target.role = payload.role
    audit(db, organization_id, member.user_id, "member.role_changed", "membership", target.id, {"user_id": user_id, "from": previous, "to": payload.role})
    db.commit()
    return {"user_id": user_id, "role": target.role}


@router.get("/organizations/{organization_id}/audit")
def list_audit_events(
    organization_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    membership = membership_for(db, member.user_id, organization_id)
    require_roles(membership, "owner", "admin")
    rows = db.query(AuditEvent).filter(AuditEvent.organization_id == organization_id).order_by(
        AuditEvent.created_at.desc()
    ).offset(offset).limit(limit).all()
    return [{"id": x.id, "actor_user_id": x.actor_user_id, "action": x.action, "resource_type": x.resource_type,
             "resource_id": x.resource_id, "details": x.details, "created_at": x.created_at} for x in rows]


@router.get("/auth/notifications")
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    query = db.query(UserNotification).filter(UserNotification.user_id == member.user_id)
    if unread_only:
        query = query.filter(UserNotification.read_at.is_(None))
    rows = query.order_by(UserNotification.created_at.desc()).limit(limit).all()
    return [{"id": n.id, "title": n.title, "message": n.message, "resource_type": n.resource_type,
             "resource_id": n.resource_id, "read_at": n.read_at, "created_at": n.created_at} for n in rows]


@router.post("/auth/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: str,
    member: MemberContext = Depends(require_member),
    db: Session = Depends(get_db),
):
    notification = db.query(UserNotification).filter_by(id=notification_id, user_id=member.user_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notification.read_at = utcnow_naive()
    db.commit()
    return None

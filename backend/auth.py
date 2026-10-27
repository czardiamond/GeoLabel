import hashlib
import secrets
import uuid
from typing import Optional, Tuple

from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth import exceptions as google_auth_exceptions
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import AnnotatorApiKey

security_bearer = HTTPBearer(auto_error=False)


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_annotator_credentials() -> Tuple[str, str, str]:
    annotator_id = f"ann_{uuid.uuid4().hex[:12]}"
    raw_api_key = f"gl_ann_{secrets.token_hex(16)}"
    return annotator_id, raw_api_key, hash_api_key(raw_api_key)


def _bearer(credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    if not credentials or not credentials.credentials.strip():
        raise HTTPException(status_code=401, detail="Firebase ID token required", headers={"WWW-Authenticate": "Bearer"})
    return credentials.credentials.strip()


def verify_firebase_token(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> dict:
    if not settings.FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=503, detail="Firebase authentication is not configured")
    try:
        decoded = id_token.verify_firebase_token(
            _bearer(credentials), google_requests.Request(), audience=settings.FIREBASE_PROJECT_ID
        )
    except (ValueError, google_auth_exceptions.GoogleAuthError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired Firebase ID token", headers={"WWW-Authenticate": "Bearer"}) from exc
    uid = decoded.get("sub")
    issuer = decoded.get("iss")
    if not uid or issuer != f"https://securetoken.google.com/{settings.FIREBASE_PROJECT_ID}":
        raise HTTPException(status_code=401, detail="Invalid Firebase token claims")
    return decoded


def require_user(decoded: dict = Depends(verify_firebase_token)) -> dict:
    if decoded.get("firebase", {}).get("sign_in_provider") == "anonymous":
        raise HTTPException(status_code=403, detail="Anonymous Firebase identities cannot access persistent data")
    return decoded


def require_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    decoded: dict = Depends(verify_firebase_token),
    x_admin_secret: Optional[str] = Header(None, alias="X-GeoLabel-Admin-Secret"),
) -> dict:
    role = decoded.get("admin") is True or decoded.get("role") == "admin" or decoded.get("roles", []) and "admin" in decoded["roles"]
    configured_secret = bool(settings.GEOLABEL_ADMIN_SECRET)
    secret_ok = configured_secret and secrets.compare_digest(x_admin_secret or "", settings.GEOLABEL_ADMIN_SECRET or "")
    if not (role or secret_ok):
        raise HTTPException(status_code=403, detail="Admin authorization required")
    return decoded


def get_current_annotator(
    x_annotator_api_key: Optional[str] = Header(None, alias="X-Annotator-API-Key"),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    db: Session = Depends(get_db),
) -> str:
    raw_key = (x_annotator_api_key or (credentials.credentials if credentials else "")).strip()
    if not raw_key:
        raise HTTPException(status_code=401, detail="Annotator API key required", headers={"WWW-Authenticate": "Bearer"})
    record = db.query(AnnotatorApiKey).filter(AnnotatorApiKey.api_key_hash == hash_api_key(raw_key)).first()
    if not record:
        raise HTTPException(status_code=401, detail="Invalid annotator API key", headers={"WWW-Authenticate": "Bearer"})
    return record.annotator_id

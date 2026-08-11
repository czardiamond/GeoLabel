import hashlib
import secrets
from typing import Optional, Tuple
from fastapi import Depends, HTTPException, Header, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AnnotatorApiKey

security_bearer = HTTPBearer(auto_error=False)


def hash_api_key(raw_key: str) -> str:
    """
    Computes SHA-256 hash of raw API key for secure storage and comparison.
    """
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_annotator_credentials() -> Tuple[str, str, str]:
    """
    Generates a new annotator_id, a raw API key, and its SHA-256 hash.
    """
    import uuid
    annotator_id = f"ann_{uuid.uuid4().hex[:12]}"
    raw_api_key = f"gl_ann_{secrets.token_hex(16)}"
    api_key_hash = hash_api_key(raw_api_key)
    return annotator_id, raw_api_key, api_key_hash


def get_current_annotator(
    x_annotator_api_key: Optional[str] = Header(None, alias="X-Annotator-API-Key"),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    db: Session = Depends(get_db)
) -> str:
    """
    FastAPI dependency that extracts and validates the annotator's API key
    from 'X-Annotator-API-Key' header or 'Authorization: Bearer <key>' header.
    Returns the authenticated annotator_id.
    """
    raw_key = None
    if x_annotator_api_key:
        raw_key = x_annotator_api_key.strip()
    elif credentials and credentials.credentials:
        raw_key = credentials.credentials.strip()

    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing annotator API key. Provide key in 'X-Annotator-API-Key' header or Bearer token.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    key_hash = hash_api_key(raw_key)
    key_record = db.query(AnnotatorApiKey).filter(AnnotatorApiKey.api_key_hash == key_hash).first()

    if not key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid annotator API key.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return key_record.annotator_id

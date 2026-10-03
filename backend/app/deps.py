from typing import Annotated, Any

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import Connection

from app.config import get_settings
from app.db import fetch_one, get_db

_jwks_client: jwt.PyJWKClient | None = None


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_client


def verify_token(token: str) -> dict[str, Any]:
    """Verify a Supabase access token (asymmetric ES256/RS256 keys via JWKS)."""
    try:
        key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{get_settings().supabase_url}/auth/v1",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc


# scope="function": commit before the response is sent, so clients never read stale data.
DB = Annotated[Connection, Depends(get_db, scope="function")]


def current_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    claims = verify_token(authorization.split(" ", 1)[1])
    user = fetch_one(
        db,
        "select id, email, name, role, backup_lead_id, is_absent from public.users where id = :id",
        id=claims["sub"],
    )
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No KTasks profile for this account")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(current_user)]


def require_lead(user: CurrentUser) -> dict[str, Any]:
    if user["role"] != "lead":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Lead role required")
    return user


LeadUser = Annotated[dict[str, Any], Depends(require_lead)]

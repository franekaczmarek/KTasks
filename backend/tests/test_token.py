"""JWT verification edge cases with a locally generated ES256 key (no network)."""
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app import deps
from app.config import get_settings

KEY = ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    fake = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=KEY.public_key()))
    monkeypatch.setattr(deps, "_jwks", lambda: fake)


def token(**overrides):
    now = int(time.time())
    claims = {"sub": "u1", "aud": "authenticated", "iss": f"{get_settings().supabase_url}/auth/v1",
              "iat": now, "exp": now + 3600, **overrides}
    return jwt.encode(claims, KEY, algorithm="ES256")


def test_valid_token():
    assert deps.verify_token(token())["sub"] == "u1"


def test_small_clock_skew_tolerated():
    # Auth server clock slightly ahead of ours: iat a few seconds in the future.
    assert deps.verify_token(token(iat=int(time.time()) + 5))["sub"] == "u1"


@pytest.mark.parametrize("claims", [
    {"iat": int(time.time()) + 600},                 # far-future iat
    {"exp": int(time.time()) - 120},                 # expired beyond leeway
    {"aud": "anon"},                                 # wrong audience
    {"iss": "https://evil.example.com/auth/v1"},     # wrong issuer
])
def test_rejected_tokens(claims):
    with pytest.raises(HTTPException) as exc:
        deps.verify_token(token(**claims))
    assert exc.value.status_code == 401

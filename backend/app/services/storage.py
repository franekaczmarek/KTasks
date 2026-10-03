"""Supabase Storage (private bucket) via the Storage REST API using the secret key."""
import httpx

from app.config import get_settings


def _base() -> tuple[str, dict[str, str], str]:
    s = get_settings()
    headers = {"apikey": s.supabase_secret_key, "Authorization": f"Bearer {s.supabase_secret_key}"}
    return f"{s.supabase_url}/storage/v1", headers, s.storage_bucket


def upload(path: str, data: bytes, content_type: str | None) -> None:
    base, headers, bucket = _base()
    r = httpx.post(
        f"{base}/object/{bucket}/{path}",
        headers={**headers, "Content-Type": content_type or "application/octet-stream"},
        content=data,
        timeout=60,
    )
    r.raise_for_status()


def signed_urls(paths: list[str], expires_in: int = 3600) -> dict[str, str]:
    if not paths:
        return {}
    base, headers, bucket = _base()
    r = httpx.post(f"{base}/object/sign/{bucket}", headers=headers,
                   json={"expiresIn": expires_in, "paths": paths}, timeout=20)
    r.raise_for_status()
    return {item["path"]: f"{base}{item['signedURL']}" for item in r.json() if item.get("signedURL")}


def remove(paths: list[str]) -> None:
    if not paths:
        return
    base, headers, bucket = _base()
    httpx.request("DELETE", f"{base}/object/{bucket}", headers=headers, json={"prefixes": paths}, timeout=20)

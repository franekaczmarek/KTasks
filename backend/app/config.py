from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    database_url: str
    storage_bucket: str = "issue-attachments"

    resend_api_key: str = ""
    sender_email: str = "onboarding@resend.dev"
    email_override_to: str = ""

    app_timezone: str = "Europe/Warsaw"
    frontend_url: str = "http://localhost:3000"
    seed_password: str = ""

    # SLA targets in business days, per priority.
    sla_targets: dict[str, int] = {"Critical": 2, "High": 5, "Medium": 10, "Low": 20}
    sla_at_risk_ratio: float = 0.75
    auto_close_business_days: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()

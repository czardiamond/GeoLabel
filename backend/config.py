from functools import cached_property
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "GeoLabel Annotation API"
    VERSION: str = "1.1.0"
    DATABASE_URL: str = "sqlite:///./geolabel.db"
    # No built-in/default key: protected endpoints fail closed until configured.
    API_KEY: Optional[str] = Field(default=None, validation_alias="GEOLABEL_API_KEY")
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    WEBHOOK_ALLOWED_HOSTS: str = ""
    IMAGERY_ALLOWED_HOSTS: str = ""
    ASSET_STORAGE_DIR: str = "./geolabel-assets"
    MAX_ASSET_UPLOAD_MB: int = 512
    MAX_ORGANIZATION_EXPORT_MB: int = 2048
    MAX_ANNOTATION_DRAFT_BYTES: int = 5_000_000
    USER_SESSION_HOURS: int = 12
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 10
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 900
    LOGIN_RATE_LIMIT_BLOCK_SECONDS: int = 900
    # Provider-backed inference remains inert until all explicit deployment gates are configured.
    INFERENCE_ENABLED: bool = False
    INFERENCE_PROVIDER_BASE_URL: str = ""
    INFERENCE_ALLOWED_HOSTS: str = ""
    INFERENCE_MODEL: str = ""
    INFERENCE_API_KEY: str = ""
    INFERENCE_DATA_TRANSFER_APPROVED: bool = False
    INFERENCE_SPEND_APPROVED: bool = False
    INFERENCE_REQUEST_TIMEOUT_SECONDS: int = 45
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def select_postgresql_driver(cls, value):
        # SQLAlchemy's default PostgreSQL driver can change across releases.
        # Keep standard provider URLs bound to the driver in requirements.txt.
        if isinstance(value, str):
            for prefix in ("postgres://", "postgresql://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg2://" + value[len(prefix):]
        return value

    @cached_property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @cached_property
    def webhook_allowed_host_list(self) -> set[str]:
        return {host.strip().lower().rstrip(".") for host in self.WEBHOOK_ALLOWED_HOSTS.split(",") if host.strip()}

    @cached_property
    def imagery_allowed_host_list(self) -> set[str]:
        return {host.strip().lower().rstrip(".") for host in self.IMAGERY_ALLOWED_HOSTS.split(",") if host.strip()}


settings = Settings()

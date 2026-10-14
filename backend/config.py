from functools import cached_property
from typing import Optional

from pydantic import Field
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
    USER_SESSION_HOURS: int = 12
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

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

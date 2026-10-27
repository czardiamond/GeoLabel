import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "GeoLabel Task Management API"
    VERSION: str = "1.0.0"
    DATABASE_URL: str | None = None
    FIREBASE_PROJECT_ID: str | None = None
    GEOLABEL_ADMIN_SECRET: str | None = None
    APP_ENV: str = "production"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_local_or_test(self) -> bool:
        return self.APP_ENV.lower() in {"local", "dev", "development", "test"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()]


settings = Settings()

import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "GeoLabel Task Management API"
    VERSION: str = "1.0.0"
    
    # Database: Default to SQLite file database, easily overridden by postgresql://...
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./geolabel.db")
    
    # Basic API Key Authentication (Bearer token or X-API-Key header)
    API_KEY: str = os.getenv("GEOLABEL_API_KEY", "gl_live_secret_key_12345")
    
    # Server settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

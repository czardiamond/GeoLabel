from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.config import settings

if not settings.DATABASE_URL:
    if settings.is_local_or_test:
        raise RuntimeError("DATABASE_URL is required even for local/test runs; set an explicit SQLite URL.")
    raise RuntimeError("DATABASE_URL is required. Production must use a durable PostgreSQL database.")

if settings.DATABASE_URL.startswith("sqlite") and not settings.is_local_or_test:
    raise RuntimeError("SQLite is allowed only when APP_ENV is local, development, or test.")

engine_kwargs = {}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(pool_size=5, max_overflow=10, pool_pre_ping=True)

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

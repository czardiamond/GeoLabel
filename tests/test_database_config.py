import pytest
from sqlalchemy.engine import make_url
from backend.config import Settings


@pytest.mark.parametrize('source,expected', [
    ('postgres://test:example@db.example/test?sslmode=require', 'postgresql+psycopg2'),
    ('postgresql://test:example@db.example/test?sslmode=require', 'postgresql+psycopg2'),
    ('postgresql+psycopg2://test:example@db.example/test', 'postgresql+psycopg2'),
    ('sqlite:///:memory:', 'sqlite'),
])
def test_database_driver_is_explicit_for_standard_postgresql_urls(source, expected):
    settings = Settings(DATABASE_URL=source, _env_file=None)
    parsed = make_url(settings.DATABASE_URL)
    assert parsed.drivername == expected
    if expected == 'postgresql+psycopg2':
        assert parsed.get_dialect().driver == 'psycopg2'
        assert parsed.password == 'example'

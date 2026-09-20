"""Tests for the schema-version bootstrap / v1 -> v2 migration."""

import os
import tempfile

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app import models


def _v1_database(path):
    """Build a minimal v1 database: urls table WITHOUT owner_id, version row 1."""
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE urls ("
                "id INTEGER PRIMARY KEY, original_url TEXT NOT NULL, "
                "short_code VARCHAR(20) NOT NULL UNIQUE, custom_alias VARCHAR(50) UNIQUE, "
                "created_at DATETIME, expires_at DATETIME, max_clicks INTEGER, "
                "tag VARCHAR(50), click_count INTEGER)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE schema_version ("
                "id INTEGER PRIMARY KEY, version INTEGER NOT NULL, upgraded_at DATETIME)"
            )
        )
        conn.execute(
            text("INSERT INTO schema_version (id, version) VALUES (1, 1)")
        )
        conn.execute(
            text(
                "INSERT INTO urls (id, original_url, short_code, click_count) "
                "VALUES (1, 'https://example.com/legacy', 'legacy1', 3)"
            )
        )
    engine.dispose()


@pytest.fixture
def v1_db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(path)
    _v1_database(path)
    yield path
    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(path + suffix)
        except OSError:
            pass


class TestSchemaMigration:
    def test_v1_gains_owner_id_and_keeps_rows(self, v1_db_path):
        """Opening a v1 database adds urls.owner_id, stamps v2, keeps data."""
        engine = create_engine(f"sqlite:///{v1_db_path}")
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            models.ensure_schema_version(session)

            cols = {c["name"] for c in inspect(engine).get_columns("urls")}
            assert "owner_id" in cols
            assert session.get(models.SchemaVersion, 1).version == 2

            # The pre-ownership row survives and is ownerless (admin-managed).
            row = session.query(models.URL).filter_by(short_code="legacy1").one()
            assert row.original_url == "https://example.com/legacy"
            assert row.click_count == 3
            assert row.owner_id is None
        finally:
            session.close()
            engine.dispose()

    def test_migration_is_idempotent(self, v1_db_path):
        """Running the bootstrap twice must not fail (column already exists)."""
        engine = create_engine(f"sqlite:///{v1_db_path}")
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            models.ensure_schema_version(session)
            models.ensure_schema_version(session)  # second run is a no-op
            assert session.get(models.SchemaVersion, 1).version == 2
        finally:
            session.close()
            engine.dispose()

    def test_unknown_future_version_fails_loudly(self, v1_db_path):
        """A database newer than this build must refuse to start."""
        engine = create_engine(f"sqlite:///{v1_db_path}")
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            models.ensure_schema_version(session)
            row = session.get(models.SchemaVersion, 1)
            row.version = models.CURRENT_SCHEMA_VERSION + 1
            session.commit()
            with pytest.raises(RuntimeError, match="Unsupported database schema version"):
                models.ensure_schema_version(session)
        finally:
            session.close()
            engine.dispose()


def _legacy_database(path, *, with_version_row=True, with_owner_id=False):
    """Build a database in a chosen pre-migration state."""
    cols = [
        "id INTEGER PRIMARY KEY",
        "original_url TEXT NOT NULL",
        "short_code VARCHAR(20) NOT NULL UNIQUE",
        "custom_alias VARCHAR(50) UNIQUE",
        "created_at DATETIME",
        "expires_at DATETIME",
        "max_clicks INTEGER",
        "tag VARCHAR(50)",
        "click_count INTEGER",
    ]
    if with_owner_id:
        cols.append("owner_id VARCHAR(255)")
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.execute(text(f"CREATE TABLE urls ({', '.join(cols)})"))
        conn.execute(
            text(
                "CREATE TABLE schema_version ("
                "id INTEGER PRIMARY KEY, version INTEGER NOT NULL, upgraded_at DATETIME)"
            )
        )
        if with_version_row:
            conn.execute(text("INSERT INTO schema_version (id, version) VALUES (1, 1)"))
        conn.execute(
            text(
                "INSERT INTO urls (id, original_url, short_code, click_count) "
                "VALUES (1, 'https://example.com/legacy', 'legacy1', 3)"
            )
        )
    engine.dispose()
    return path


class TestPostgresMigrationPath:
    """The dialect-specific DDL that makes Neon/serverless upgrades safe."""

    def test_postgres_uses_if_not_exists_forms(self):
        """Postgres supports ADD COLUMN IF NOT EXISTS — used to survive
        concurrent serverless cold starts racing the same migration."""
        add_column, create_index = models.add_owner_id_statements("postgresql")
        assert "IF NOT EXISTS" in add_column
        assert "IF NOT EXISTS" in create_index
        assert "owner_id" in add_column and models.OWNER_ID_INDEX in create_index

    def test_sqlite_avoids_unsupported_add_column_if_not_exists(self):
        """SQLite rejects ADD COLUMN IF NOT EXISTS, so its form must not use it."""
        add_column, create_index = models.add_owner_id_statements("sqlite")
        assert "IF NOT EXISTS" not in add_column
        assert "IF NOT EXISTS" in create_index  # CREATE INDEX does support it

    def test_statements_compile_for_the_postgres_dialect(self):
        """Both statements must be valid compiled PostgreSQL DDL."""
        from sqlalchemy.dialects import postgresql

        add_column, create_index = models.add_owner_id_statements("postgresql")
        for ddl in (add_column, create_index):
            compiled = str(text(ddl).compile(dialect=postgresql.dialect()))
            assert "owner_id" in compiled


class TestSelfHealingBootstrap:
    """The recorded version must never overstate the actual schema."""

    def test_missing_version_row_still_adds_the_column(self, tmp_path):
        """A database whose version row was never written (no row, column
        missing) must gain the column AND the v2 stamp, not just the stamp."""
        path = str(tmp_path / "norow.db")
        _legacy_database(path, with_version_row=False, with_owner_id=False)

        engine = create_engine(f"sqlite:///{path}")
        session = sessionmaker(bind=engine)()
        try:
            models.ensure_schema_version(session)
            cols = {c["name"] for c in inspect(engine).get_columns("urls")}
            assert "owner_id" in cols
            assert session.get(models.SchemaVersion, 1).version == models.CURRENT_SCHEMA_VERSION
        finally:
            session.close()
            engine.dispose()

    def test_existing_column_is_not_re_added(self, tmp_path):
        """A v1-stamped database that already has the column (e.g. created by
        create_all at v2) simply gets stamped, with no duplicate-column error."""
        path = str(tmp_path / "haskcol.db")
        _legacy_database(path, with_version_row=True, with_owner_id=True)

        engine = create_engine(f"sqlite:///{path}")
        session = sessionmaker(bind=engine)()
        try:
            models.ensure_schema_version(session)
            assert session.get(models.SchemaVersion, 1).version == models.CURRENT_SCHEMA_VERSION
            assert session.query(models.URL).one().owner_id is None
        finally:
            session.close()
            engine.dispose()

    def test_empty_database_gets_tables_and_version(self, tmp_path):
        """Pointing at a brand-new file creates the schema and stamps v2."""
        path = str(tmp_path / "empty.db")
        engine = create_engine(f"sqlite:///{path}")
        session = sessionmaker(bind=engine)()
        try:
            models.ensure_schema_version(session)
            tables = set(inspect(engine).get_table_names())
            assert {"urls", "click_events", "schema_version"} <= tables
            assert session.get(models.SchemaVersion, 1).version == models.CURRENT_SCHEMA_VERSION
        finally:
            session.close()
            engine.dispose()


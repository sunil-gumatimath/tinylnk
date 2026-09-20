"""Migrate and verify a tinylnk database — SQLite or PostgreSQL/Neon.

Runs the same bootstrap the application uses at startup
(``create_all`` + ``ensure_schema_version``) and then prints a verification
report. Useful for:

* applying the v1 -> v2 ownership migration to a hosted PostgreSQL/Neon
  database *without* waiting for a deploy, and
* confirming afterwards that the column, index, version row and data survived.

Neither mode takes a destructive action: the migration only ever adds the
``urls.owner_id`` column/index and advances the version row.

    # Report only — connects, inspects, changes nothing
    python scripts/migrate_db.py --check

    # Apply the migration, then verify
    python scripts/migrate_db.py

    # Point at a specific database instead of $DATABASE_URL
    python scripts/migrate_db.py --database-url "postgresql://..."

Environment
-----------
``DATABASE_URL``
    PostgreSQL connection URL. When unset, ``SQLITE_DB_PATH`` (or the local
    default ``./data/urlshortener.db``) is used instead.

Exit codes: 0 = success/healthy, 1 = failure or still needing a migration.
"""

import argparse
import os
import sys
from urllib.parse import urlsplit, urlunsplit

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_backend = os.path.join(_ROOT, "backend")
if _backend not in sys.path:
    sys.path.insert(0, _backend)

from sqlalchemy import inspect, text  # noqa: E402

from app import models  # noqa: E402
from app.database import DATABASE_URL, Base, SessionLocal, engine  # noqa: E402


def _mask(url: str) -> str:
    """Hide the password (and any query params) when printing a DSN."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    if parts.username:
        userinfo = f"{parts.username}:***@" if parts.password else f"{parts.username}@"
    else:
        userinfo = ""
    return urlunsplit((parts.scheme, f"{userinfo}{host}", parts.path, "", ""))


def _report(conn, dialect: str) -> dict:
    """Inspect the database and return a summary dict."""
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    summary = {
        "dialect": dialect,
        "tables": sorted(tables),
        "indexes": [],
        "has_owner_id": False,
        "version": None,
        "url_count": None,
        "owned_count": None,
        "ownerless_count": None,
    }

    if "urls" in tables:
        summary["has_owner_id"] = "owner_id" in {
            c["name"] for c in inspector.get_columns("urls")
        }
        summary["indexes"] = [i["name"] for i in inspector.get_indexes("urls")]

    if "schema_version" in tables:
        row = conn.execute(text("SELECT version FROM schema_version WHERE id = 1")).first()
        summary["version"] = row[0] if row else None

    if summary["has_owner_id"]:
        summary["url_count"] = conn.execute(text("SELECT count(*) FROM urls")).scalar()
        summary["owned_count"] = conn.execute(
            text("SELECT count(*) FROM urls WHERE owner_id IS NOT NULL")
        ).scalar()
        summary["ownerless_count"] = summary["url_count"] - summary["owned_count"]

    return summary


def _print_report(summary: dict) -> None:
    print(f"  dialect         : {summary['dialect']}")
    print(f"  tables          : {', '.join(summary['tables']) or '(none)'}")
    print(f"  schema version  : {summary['version']}")
    print(f"  urls.owner_id   : {'yes' if summary['has_owner_id'] else 'NO'}")
    print(f"  urls indexes    : {', '.join(summary['indexes']) or '(none)'}")
    if summary["url_count"] is not None:
        print(f"  links           : {summary['url_count']} total")
        print(f"                    {summary['owned_count']} owned")
        print(
            f"                    {summary['ownerless_count']} ownerless "
            "(admin-only; see TINYLNK_ADMIN_USER_IDS)"
        )


def _is_healthy(summary: dict) -> bool:
    """True when the database matches the schema this build expects."""
    return (
        summary["version"] == models.CURRENT_SCHEMA_VERSION
        and summary["has_owner_id"]
        and "urls" in summary["tables"]
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Inspect and report only; never migrate",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override the target database (defaults to $DATABASE_URL or SQLite)",
    )
    args = parser.parse_args()

    target = args.database_url or DATABASE_URL
    print(f"Database: {_mask(target)}")
    print(f"Mode    : {'check only' if args.check else 'migrate + verify'}\n")

    db_engine = engine
    if args.database_url:
        from sqlalchemy import create_engine

        url = args.database_url
        if url.startswith(("postgres://", "postgresql://")):
            url = "postgresql+psycopg://" + url.split("://", 1)[1]
        db_engine = create_engine(url, connect_args={"connect_timeout": 10})

    db = SessionLocal(bind=db_engine)
    try:
        if args.check:
            with db_engine.connect() as conn:
                current = _report(conn, db_engine.dialect.name)
            print("Current state:")
            _print_report(current)
            if _is_healthy(current):
                print(
                    f"\nOK — already at schema version {models.CURRENT_SCHEMA_VERSION}; "
                    "nothing to do."
                )
                return 0
            print("\nNEEDS MIGRATION — re-run without --check to upgrade.")
            return 1

        # Same bootstrap order as app startup: create tables, then migrate.
        Base.metadata.create_all(bind=db_engine)
        models.ensure_schema_version(db)
        db.close()

        # Read back through a fresh connection so the report reflects what is
        # actually committed (not the session's identity map).
        with db_engine.connect() as conn:
            after = _report(conn, db_engine.dialect.name)

        print("Post-migration state:")
        _print_report(after)

        if not _is_healthy(after):
            print("\nFAILED — database does not match the expected schema.")
            return 1

        print(
            f"\nOK — schema version {after['version']}; urls.owner_id present "
            f"({after['owned_count']} owned / {after['ownerless_count']} ownerless)."
        )
        if after["ownerless_count"]:
            print(
                "Note: ownerless links (created before ownership existed, or while\n"
                "signed out) are manageable only by TINYLNK_ADMIN_USER_IDS members."
            )
        return 0
    except Exception as exc:
        print(f"\nFAILED — {type(exc).__name__}: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())


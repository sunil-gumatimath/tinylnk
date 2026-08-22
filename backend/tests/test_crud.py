"""Direct unit tests for CRUD functions in ``app.crud``.

These tests call the database-layer functions directly (without going through
the HTTP layer) so they can exercise edge cases that are harder to reach via
the API.
"""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import crud, models, schemas

# ---------------------------------------------------------------------------
# create_short_url
# ---------------------------------------------------------------------------

class TestCreateShortUrl:
    """Tests for ``crud.create_short_url``."""

    def test_generates_unique_short_code(self, db_session: Session):
        """A new short URL gets a unique short_code assigned."""
        url_data = schemas.URLCreate(url="https://example.com/test")
        url = crud.create_short_url(db_session, url_data)
        assert url.short_code is not None
        assert len(url.short_code) > 0

    def test_persists_url_data(self, db_session: Session):
        """The URL is written to the database with all fields intact."""
        url_data = schemas.URLCreate(
            url="https://example.com/persist",
            tag="sanity",
            max_clicks=10,
        )
        url = crud.create_short_url(db_session, url_data)
        assert url.original_url == "https://example.com/persist"
        assert url.tag == "sanity"
        assert url.max_clicks == 10
        assert url.click_count == 0
        assert url.expires_at is None

    def test_expires_at_computed(self, db_session: Session):
        """Providing expires_in_hours=24 should set expires_at ~24h in the
        future."""
        url_data = schemas.URLCreate(
            url="https://example.com/expires",
            expires_in_hours=24,
        )
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        url = crud.create_short_url(db_session, url_data)
        after = datetime.now(timezone.utc).replace(tzinfo=None)
        assert url.expires_at is not None
        # expires_at is stored as naive datetime in SQLite; compare naive
        expires_at = url.expires_at
        if expires_at.tzinfo is not None:
            expires_at = expires_at.replace(tzinfo=None)
        assert before + timedelta(hours=23.9) < expires_at < after + timedelta(hours=24.1)

        url_data = schemas.URLCreate(
            url="https://example.com/alias",
            custom_alias="myalias",
        )
        url = crud.create_short_url(db_session, url_data)
        assert url.custom_alias == "myalias"
        assert crud.get_url_by_code(db_session, "myalias") is not None

    def test_custom_alias_unique(self, db_session: Session):
        """Creating two URLs with the same custom alias raises ValueError."""
        crud.create_short_url(
            db_session,
            schemas.URLCreate(url="https://example.com/a", custom_alias="taken"),
        )
        with pytest.raises(ValueError, match="already taken"):
            crud.create_short_url(
                db_session,
                schemas.URLCreate(url="https://example.com/b", custom_alias="taken"),
            )

    def test_random_code_unique(self, db_session: Session):
        """Creating many URLs should never produce duplicate short codes."""
        codes: set[str] = set()
        for i in range(200):
            url_data = schemas.URLCreate(url=f"https://example.com/{i}")
            url = crud.create_short_url(db_session, url_data)
            assert url.short_code not in codes, f"Collision at iteration {i}"
            codes.add(url.short_code)


# ---------------------------------------------------------------------------
# get_url_by_code
# ---------------------------------------------------------------------------

class TestGetUrlByCode:
    """Tests for ``crud.get_url_by_code``."""

    def test_returns_none_for_missing(self, db_session: Session):
        assert crud.get_url_by_code(db_session, "nonexistent") is None

    def test_finds_by_short_code(self, db_session: Session):
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/find-me"),
        )
        found = crud.get_url_by_code(db_session, url.short_code)
        assert found is not None
        assert found.id == url.id

    def test_finds_by_custom_alias(self, db_session: Session):
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/alias2", custom_alias="unique"),
        )
        found = crud.get_url_by_code(db_session, "unique")
        assert found is not None
        assert found.custom_alias == "unique"

    def test_returns_latest_data(self, db_session: Session):
        """Querying a URL after updating its fields returns the updated data,
        confirming no stale cached object is returned."""
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/stale-test"),
        )
        # Update the URL outside the current session's awareness
        from sqlalchemy import text as sa_text
        db_session.execute(
            sa_text("UPDATE urls SET original_url = :new_url WHERE id = :uid"),
            {"new_url": "https://updated.example.com", "uid": url.id},
        )
        db_session.commit()
        db_session.expire_all()
        # Now look it up — should get the new URL
        found = crud.get_url_by_code(db_session, url.short_code)
        assert found is not None
        assert found.original_url == "https://updated.example.com"


# ---------------------------------------------------------------------------
# update_url
# ---------------------------------------------------------------------------

class TestUpdateUrl:
    """Tests for ``crud.update_url``."""

    def test_update_fields(self, db_session: Session):
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/update-me"),
        )
        updated = crud.update_url(
            db_session,
            url,
            schemas.URLUpdate(
                original_url="https://updated.example.com",
                tag="updated-tag",
                max_clicks=5,
            ),
        )
        assert updated.original_url == "https://updated.example.com"
        assert updated.tag == "updated-tag"
        assert updated.max_clicks == 5

    def test_update_alias(self, db_session: Session):
        url = crud.create_short_url(
            db_session,
            schemas.URLCreate(url="https://example.com/old-alias", custom_alias="oldalias"),
        )
        updated = crud.update_url(
            db_session,
            url,
            schemas.URLUpdate(custom_alias="newalias"),
        )
        assert updated.custom_alias == "newalias"

        # Old alias should no longer resolve
        assert crud.get_url_by_code(db_session, "oldalias") is None
        assert crud.get_url_by_code(db_session, "newalias") is not None

    def test_update_alias_uniqueness_enforced(self, db_session: Session):
        """Trying to update a URL's alias to one already in use raises
        ValueError."""
        url_a = crud.create_short_url(
            db_session,
            schemas.URLCreate(
                url="https://example.com/a",
                custom_alias="alias-a",
            ),
        )
        crud.create_short_url(
            db_session,
            schemas.URLCreate(
                url="https://example.com/b",
                custom_alias="alias-b",
            ),
        )
        # Try to give url_a the same alias as url_b
        with pytest.raises(ValueError, match="already taken"):
            crud.update_url(
                db_session,
                url_a,
                schemas.URLUpdate(custom_alias="alias-b"),
            )

    def test_clear_expires_at_with_zero(self, db_session: Session):
        """Setting expires_in_hours to 0 should clear the expiration."""
        url = crud.create_short_url(
            db_session,
            schemas.URLCreate(url="https://example.com/exp-clear", expires_in_hours=24),
        )
        assert url.expires_at is not None

        updated = crud.update_url(
            db_session,
            url,
            schemas.URLUpdate(expires_in_hours=0),
        )
        assert updated.expires_at is None

    def test_update_normalizes_nonpositive_max_clicks(self, db_session: Session):
        """crud.update_url normalizes <= 0 to None as defense-in-depth for
        programmatic callers that bypass schema validation (the schema itself
        now rejects such values, so this uses ``model_construct``)."""
        url = crud.create_short_url(
            db_session,
            schemas.URLCreate(url="https://example.com/limit-set", max_clicks=5),
        )
        assert url.max_clicks == 5

        bypassed = schemas.URLUpdate.model_construct(max_clicks=-1)
        updated = crud.update_url(db_session, url, bypassed)
        assert updated.max_clicks is None


# ---------------------------------------------------------------------------
# delete_url
# ---------------------------------------------------------------------------

class TestDeleteUrl:
    """Tests for ``crud.delete_url``."""

    def test_delete_url_removes_it(self, db_session: Session):
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/to-delete"),
        )
        assert crud.get_url_by_code(db_session, url.short_code) is not None

        deleted = crud.delete_url(db_session, url.short_code)
        assert deleted is True
        assert crud.get_url_by_code(db_session, url.short_code) is None

    def test_delete_nonexistent_returns_false(self, db_session: Session):
        assert crud.delete_url(db_session, "ghost") is False

    def test_delete_cascades_clicks(self, db_session: Session):
        """Deleting a URL also removes its click events."""
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/cascade"),
        )
        # Record a click
        crud.record_click(db_session, url)
        assert db_session.query(models.ClickEvent).count() == 1

        crud.delete_url(db_session, url.short_code)
        assert db_session.query(models.ClickEvent).count() == 0


# ---------------------------------------------------------------------------
# is_url_expired
# ---------------------------------------------------------------------------

class TestIsUrlExpired:
    """Tests for ``crud.is_url_expired``."""

    def test_never_expires(self, db_session: Session):
        """A URL with no expires_at is never expired."""
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/never"),
        )
        assert url.expires_at is None
        assert crud.is_url_expired(url) is False

    def test_not_expired_yet(self, db_session: Session):
        """A URL with expires_at in the future is not expired."""
        url = crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/future", expires_in_hours=24),
        )
        assert crud.is_url_expired(url) is False

    def test_expired(self, db_session: Session):
        """A URL whose expires_at lies in the past is expired."""
        # Note: build the past expiry directly on the model — the schema no
        # longer accepts a negative expires_in_hours on create.
        url = crud.create_short_url(
            db_session,
            schemas.URLCreate(url="https://example.com/past"),
        )
        url.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db_session.commit()
        assert crud.is_url_expired(url) is True


# ---------------------------------------------------------------------------
# Schema validation — regression tests for the validation bugs
# ---------------------------------------------------------------------------

class TestSchemaValidation:
    """URLCreate / URLUpdate reject invalid optional parameters."""

    @pytest.mark.parametrize("bad_value", [-5, 0])
    def test_urlcreate_rejects_nonpositive_max_clicks(self, bad_value: int):
        """max_clicks must be None or >= 1 (0/negative made born-dead links)."""
        with pytest.raises(ValidationError):
            schemas.URLCreate(url="https://example.com/x", max_clicks=bad_value)

    @pytest.mark.parametrize("bad_value", [0, -3])
    def test_urlcreate_rejects_nonpositive_expires_in_hours(self, bad_value: int):
        """expires_in_hours must be None or >= 1 on create."""
        with pytest.raises(ValidationError):
            schemas.URLCreate(
                url="https://example.com/x", expires_in_hours=bad_value
            )

    def test_urlcreate_enforces_tag_max_length(self):
        """Tags longer than the String(50) column fail validation; exactly 50
        characters is allowed."""
        with pytest.raises(ValidationError):
            schemas.URLCreate(url="https://example.com/x", tag="t" * 51)
        ok = schemas.URLCreate(url="https://example.com/x", tag="t" * 50)
        assert ok.tag == "t" * 50

    def test_urlcreate_still_allows_valid_values(self):
        """Sanity check: a fully valid payload still constructs cleanly."""
        data = schemas.URLCreate(
            url="https://example.com/x",
            max_clicks=10,
            expires_in_hours=24,
            tag="ok",
        )
        assert data.max_clicks == 10
        assert data.expires_in_hours == 24
        assert data.tag == "ok"

    def test_urlupdate_zero_expires_in_hours_is_valid(self):
        """UPDATE intentionally keeps ge=0 so clients can send 0 to clear an
        existing expiry (see crud.update_url)."""
        assert schemas.URLUpdate(expires_in_hours=0).expires_in_hours == 0

    def test_urlupdate_rejects_negative_expires_in_hours(self):
        with pytest.raises(ValidationError):
            schemas.URLUpdate(expires_in_hours=-1)

    def test_urlupdate_rejects_nonpositive_max_clicks(self):
        with pytest.raises(ValidationError):
            schemas.URLUpdate(max_clicks=0)

    def test_urlupdate_enforces_tag_max_length(self):
        with pytest.raises(ValidationError):
            schemas.URLUpdate(tag="t" * 51)


class TestValidationDefenseInDepth:
    """crud-layer normalization for callers that bypass schema validation."""

    def test_create_normalizes_zero_max_clicks(self, db_session: Session):
        """Creating with max_clicks=0 while bypassing the schema stores NULL,
        never a born-dead limit of 0 clicks."""
        url_data = schemas.URLCreate.model_construct(
            url="https://example.com/zero-clicks", max_clicks=0
        )
        url = crud.create_short_url(db_session, url_data)
        assert url.max_clicks is None


# ---------------------------------------------------------------------------
# get_recent_urls — LIKE wildcard escaping in search
# ---------------------------------------------------------------------------

class TestGetRecentUrlsSearch:
    """User-supplied search terms must be matched literally."""

    def test_percent_is_literal_not_wildcard(self, db_session: Session):
        """'%' in the search term no longer matches every URL."""
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/100%_off")
        )
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/ordinary")
        )
        hits = {
            u.original_url for u in crud.get_recent_urls(db_session, search="100%")
        }
        assert hits == {"https://example.com/100%_off"}

    def test_underscore_is_literal_not_single_char_wildcard(
        self, db_session: Session
    ):
        """'_' in the search term matches only a literal underscore."""
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/sale_tag")
        )
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/saleXtag")
        )
        hits = {
            u.original_url for u in crud.get_recent_urls(db_session, search="_tag")
        }
        assert hits == {"https://example.com/sale_tag"}

    def test_backslash_is_literal(self, db_session: Session):
        r"""A literal '\' in the search term matches only real backslashes."""
        crud.create_short_url(
            db_session, schemas.URLCreate(url=r"https://example.com/win\path")
        )
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/winzpath")
        )
        hits = {
            u.original_url for u in crud.get_recent_urls(db_session, search="win\\")
        }
        assert hits == {r"https://example.com/win\path"}

    def test_plain_text_search_still_matches(self, db_session: Session):
        """Ordinary text searches are unaffected by the escaping."""
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://docs.example.com/guide")
        )
        crud.create_short_url(
            db_session, schemas.URLCreate(url="https://example.com/other")
        )
        hits = {
            u.original_url for u in crud.get_recent_urls(db_session, search="guide")
        }
        assert hits == {"https://docs.example.com/guide"}

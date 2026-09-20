-- tinylnk Neon reference schema (REFERENCE ONLY — do not apply blindly).
-- Source of truth: backend/app/models.py + ensure_schema_version().
-- Generated: 2026-09-20T17:26:39.151153+00:00
-- Project: tinylnk (purple-cell-56363253), branch: main, db: neondb, PG 17.
-- Live schema_version: 2.
-- Live row counts at generation: urls=6, click_events=7, schema_version=1.

-- ---------------- urls ----------------
CREATE TABLE public.urls (
    id integer DEFAULT nextval('urls_id_seq'::regclass) NOT NULL,
    original_url text NOT NULL,
    short_code character varying(20) NOT NULL,
    custom_alias character varying(50),
    created_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone,
    max_clicks integer,
    tag character varying(50),
    click_count integer NOT NULL,
    owner_id character varying(255),
    CONSTRAINT urls_pkey PRIMARY KEY (id)
);

CREATE INDEX ix_urls_created_at ON public.urls USING btree (created_at);
CREATE UNIQUE INDEX ix_urls_custom_alias ON public.urls USING btree (custom_alias);
CREATE INDEX ix_urls_expires_at ON public.urls USING btree (expires_at);
CREATE INDEX ix_urls_id ON public.urls USING btree (id);
CREATE INDEX ix_urls_max_clicks ON public.urls USING btree (max_clicks);
CREATE INDEX ix_urls_owner_id ON public.urls USING btree (owner_id);
CREATE UNIQUE INDEX ix_urls_short_code ON public.urls USING btree (short_code);
CREATE INDEX ix_urls_tag ON public.urls USING btree (tag);

-- ---------------- click_events ----------------
CREATE TABLE public.click_events (
    id integer DEFAULT nextval('click_events_id_seq'::regclass) NOT NULL,
    url_id integer NOT NULL,
    clicked_at timestamp without time zone NOT NULL,
    referrer character varying(500),
    user_agent character varying(500),
    ip_address character varying(45),
    CONSTRAINT click_events_pkey PRIMARY KEY (id),
    CONSTRAINT click_events_url_id_fkey FOREIGN KEY (url_id) REFERENCES urls(id)
);

CREATE INDEX ix_click_events_clicked_at ON public.click_events USING btree (clicked_at);
CREATE INDEX ix_click_events_id ON public.click_events USING btree (id);
CREATE INDEX ix_click_events_url_id ON public.click_events USING btree (url_id);

-- ---------------- schema_version ----------------
CREATE TABLE public.schema_version (
    id integer DEFAULT nextval('schema_version_id_seq'::regclass) NOT NULL,
    version integer NOT NULL,
    upgraded_at timestamp without time zone NOT NULL,
    CONSTRAINT schema_version_pkey PRIMARY KEY (id)
);

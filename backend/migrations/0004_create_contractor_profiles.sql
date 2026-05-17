CREATE TABLE contractor_profiles (
    user_id              UUID            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name         TEXT            NOT NULL,
    bio                  TEXT,
    base_rate            DOUBLE PRECISION,
    base_rate_unit       rate_unit,
    is_available         BOOLEAN         NOT NULL DEFAULT FALSE,
    is_busy              BOOLEAN         NOT NULL DEFAULT FALSE,
    current_lat          DOUBLE PRECISION,
    current_lng          DOUBLE PRECISION,
    location_updated_at  TIMESTAMPTZ,
    avg_rating           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rating_count         INTEGER          NOT NULL DEFAULT 0
);

CREATE TABLE contractor_profiles (
    user_id              UUID            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name         TEXT            NOT NULL,
    bio                  TEXT,
    base_rate            DOUBLE PRECISION CHECK (base_rate > 0),
    base_rate_unit       rate_unit,
    is_available         BOOLEAN         NOT NULL DEFAULT FALSE,
    is_busy              BOOLEAN         NOT NULL DEFAULT FALSE,
    current_lat          DOUBLE PRECISION,
    current_lng          DOUBLE PRECISION,
    current_location     GEOGRAPHY(POINT, 4326),
    location_updated_at  TIMESTAMPTZ,
    avg_rating           DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rating_count         INTEGER          NOT NULL DEFAULT 0,
    CONSTRAINT base_rate_unit_consistent CHECK (
        (base_rate IS NULL) = (base_rate_unit IS NULL)
    )
);

CREATE INDEX idx_contractor_profiles_location
    ON contractor_profiles USING GIST (current_location);

CREATE INDEX idx_contractor_profiles_available
    ON contractor_profiles (user_id)
    WHERE is_available = TRUE AND is_busy = FALSE;

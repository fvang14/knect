CREATE TABLE quotes (
    id                 UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id             UUID            NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    contractor_id      UUID            NOT NULL REFERENCES users(id),
    base_rate_snapshot DOUBLE PRECISION,
    custom_amount      DOUBLE PRECISION,
    custom_note        TEXT,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE ratings (
    id            UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id        UUID     NOT NULL UNIQUE REFERENCES jobs(id),
    contractor_id UUID     NOT NULL REFERENCES users(id),
    customer_id   UUID     NOT NULL REFERENCES users(id),
    score         SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    review_text   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_contractor_id ON ratings(contractor_id);

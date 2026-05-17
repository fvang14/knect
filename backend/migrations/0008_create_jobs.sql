CREATE TABLE jobs (
    id               UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id      UUID       NOT NULL REFERENCES users(id),
    contractor_id    UUID       NOT NULL REFERENCES users(id),
    status           job_status NOT NULL DEFAULT 'pending',
    description      TEXT       NOT NULL,
    location_lat     DOUBLE PRECISION NOT NULL,
    location_lng     DOUBLE PRECISION NOT NULL,
    location_address TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_customer_id   ON jobs(customer_id);
CREATE INDEX idx_jobs_contractor_id ON jobs(contractor_id);
CREATE INDEX idx_jobs_status        ON jobs(status);

-- Avatar storage
CREATE TABLE user_avatars (
    user_id      UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bytes        BYTEA       NOT NULL,
    content_type TEXT        NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cascade fixes so DELETE /me works end-to-end.

-- jobs.customer_id → customer_profiles(user_id)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_customer_id_fkey;
ALTER TABLE jobs
    ADD CONSTRAINT jobs_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customer_profiles(user_id) ON DELETE CASCADE;

-- jobs.contractor_id → contractor_profiles(user_id)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_contractor_id_fkey;
ALTER TABLE jobs
    ADD CONSTRAINT jobs_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id) ON DELETE CASCADE;

-- quotes.contractor_id → contractor_profiles(user_id)
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_contractor_id_fkey;
ALTER TABLE quotes
    ADD CONSTRAINT quotes_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id) ON DELETE CASCADE;

-- ratings.job_id → jobs(id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_job_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- ratings.contractor_id → contractor_profiles(user_id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_contractor_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id) ON DELETE CASCADE;

-- ratings.customer_id → customer_profiles(user_id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_customer_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customer_profiles(user_id) ON DELETE CASCADE;

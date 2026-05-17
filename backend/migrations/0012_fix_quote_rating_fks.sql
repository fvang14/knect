-- Fix FK targets: quotes and ratings should reference profile tables, not users directly

-- Quotes: contractor_id → contractor_profiles(user_id)
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_contractor_id_fkey;
ALTER TABLE quotes
    ADD CONSTRAINT quotes_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id);

-- Ratings: contractor_id → contractor_profiles(user_id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_contractor_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES contractor_profiles(user_id);

-- Ratings: customer_id → customer_profiles(user_id)
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_customer_id_fkey;
ALTER TABLE ratings
    ADD CONSTRAINT ratings_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customer_profiles(user_id);

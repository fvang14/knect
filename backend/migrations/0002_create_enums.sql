CREATE TYPE user_role AS ENUM ('contractor', 'customer', 'admin');
CREATE TYPE job_status AS ENUM ('pending', 'accepted', 'denied', 'in_progress', 'completed', 'cancelled');
CREATE TYPE rate_unit AS ENUM ('per_hour', 'per_job');

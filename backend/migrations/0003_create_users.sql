CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT        NOT NULL UNIQUE,
    phone       TEXT,
    password_hash TEXT      NOT NULL,
    role        user_role   NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suspended_at TIMESTAMPTZ
);

CREATE TABLE trade_categories (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name      TEXT NOT NULL UNIQUE,
    icon_slug TEXT NOT NULL
);

INSERT INTO trade_categories (name, icon_slug) VALUES
    ('Plumbing', 'wrench'),
    ('Electrical', 'bolt'),
    ('Landscaping', 'tree'),
    ('Cleaning', 'sparkles'),
    ('Carpentry', 'hammer'),
    ('Painting', 'paint-bucket'),
    ('HVAC', 'thermometer'),
    ('General Handyman', 'tool');

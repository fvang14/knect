CREATE TABLE contractor_trade_categories (
    contractor_id UUID REFERENCES contractor_profiles(user_id) ON DELETE CASCADE,
    category_id   UUID REFERENCES trade_categories(id)         ON DELETE CASCADE,
    PRIMARY KEY (contractor_id, category_id)
);

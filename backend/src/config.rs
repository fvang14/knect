#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_refresh_secret: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self, anyhow::Error> {
        todo!()
    }
}

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
        dotenvy::dotenv().ok();
        Ok(Config {
            database_url: std::env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL not set"))?,
            redis_url: std::env::var("REDIS_URL")
                .map_err(|_| anyhow::anyhow!("REDIS_URL not set"))?,
            jwt_secret: std::env::var("JWT_SECRET")
                .map_err(|_| anyhow::anyhow!("JWT_SECRET not set"))?,
            jwt_refresh_secret: std::env::var("JWT_REFRESH_SECRET")
                .map_err(|_| anyhow::anyhow!("JWT_REFRESH_SECRET not set"))?,
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .map_err(|_| anyhow::anyhow!("PORT must be a valid number"))?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Guards env-var mutation so parallel tests don't race on global state.
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn from_env_errors_when_database_url_missing() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let saved: Vec<(&str, Option<String>)> = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"]
            .iter()
            .map(|k| (*k, std::env::var(k).ok()))
            .collect();

        for (k, _) in &saved {
            std::env::remove_var(k);
        }

        let result = Config::from_env();

        // Restore env vars
        for (k, v) in saved {
            if let Some(val) = v {
                std::env::set_var(k, val);
            }
        }

        assert!(result.is_err());
    }
}

# Self-Hosting Design

**Date:** 2026-05-18
**Scope:** Deploy the knect-api backend (Rust/Axum + PostgreSQL/PostGIS + Redis) on a personal Linux machine using Docker. HTTP only, public IP access, dev/personal environment.

---

## Architecture

Three Docker containers on a single internal bridge network. Only the API port is exposed to the host.

```
Internet
    │  :3000
    ▼
[ api ]  ←→  [ postgres ]  (no host port)
   └────────→ [ redis ]    (no host port)
```

- **api** — built from a multi-stage Dockerfile in `backend/`, runs Axum on port 3000
- **postgres** — `postgis/postgis:16-3.4`, data persisted in a named Docker volume
- **redis** — `redis:7-alpine`, ephemeral (location cache only)
- Migrations run automatically on API startup via `sqlx::migrate!` (already in `main.rs`)
- All containers use `restart: unless-stopped` to survive server reboots

---

## Files

### `backend/Dockerfile`

Multi-stage build:
1. **Builder stage** — `rust:1-slim`, installs build deps (pkg-config, libssl-dev), compiles release binary
2. **Runtime stage** — `debian:bookworm-slim`, copies binary, adds `ca-certificates`

### `backend/docker-compose.prod.yml`

Production compose file:
- `postgres` service: postgis image, env vars from `.env`, named volume, no host port binding, healthcheck
- `redis` service: redis:7-alpine, no host port binding
- `api` service: built from `./` (backend context), port `3000:3000`, env vars constructed from `.env` vars, `depends_on` postgres healthcheck

### `.env.example`

Checked into git. Documents all required environment variables with no real values:
```
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
JWT_SECRET=
JWT_REFRESH_SECRET=
PORT=3000
```

`DATABASE_URL` and `REDIS_URL` are **not** in `.env` — docker-compose constructs them internally from the vars above and passes them to the api container. The server's actual `.env` file is created manually on the server and never committed.

### `deploy.sh`

Script run from the developer's Mac:
```bash
#!/usr/bin/env bash
set -euo pipefail
ssh home "cd ~/Projects/knect && git pull && docker compose -f backend/docker-compose.prod.yml up --build -d"
```

---

## First-Time Server Setup

Steps performed once, manually via SSH (repo already cloned at `~/Projects/knect`):

1. Install Docker (and Docker Compose plugin) on the Linux machine
2. Create `~/Projects/knect/.env` with real values for all vars in `.env.example`
3. Open port 3000: `sudo ufw allow 3000/tcp`
4. `cd ~/Projects/knect && docker compose -f backend/docker-compose.prod.yml up --build -d`

The first build compiles the Rust binary inside Docker — this takes several minutes. Subsequent builds use Docker's layer cache and are much faster.

---

## Ongoing Deploys

From the developer's Mac:
```bash
./deploy.sh
```

This SSHes into the server, pulls the latest git commits, rebuilds the API image, and restarts affected containers. The postgres volume is untouched across rebuilds.

---

## Accessing the API

```
http://<server-public-ip>:3000
```

---

## Security Notes (dev environment)

- HTTP only — acceptable for a personal dev environment
- Postgres and Redis are not exposed to the host; only reachable within the Docker network
- Real secrets live only in `~/Projects/knect/.env` on the server, never in git
- When ready for production: add Caddy or nginx in front for HTTPS via Let's Encrypt

---

## Out of Scope

- HTTPS / TLS (future production concern)
- CI/CD automation (GitHub Actions, GHCR)
- Frontend hosting
- Monitoring / alerting

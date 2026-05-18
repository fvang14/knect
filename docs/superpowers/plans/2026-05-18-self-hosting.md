# Self-Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy knect-api (Rust/Axum + PostgreSQL/PostGIS + Redis) on a personal Linux server via Docker, accessible over HTTP on port 3000.

**Architecture:** A multi-stage Dockerfile builds the Rust binary using sqlx offline mode (pre-generated query cache), then copies it into a slim Debian runtime image. `docker-compose.prod.yml` in `backend/` orchestrates postgres, redis, and api containers on an internal bridge network, with only port 3000 exposed. A `deploy.sh` at the repo root handles all subsequent deploys from the Mac with one SSH command.

**Tech Stack:** Docker, Docker Compose v2, Rust 1 (multi-stage build), postgis/postgis:16-3.4, redis:7-alpine, sqlx offline mode

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Populate | `backend/.sqlx/` | Offline sqlx query cache — required for Docker build without a live DB |
| Create | `backend/.dockerignore` | Exclude `target/`, `.env`, `tests/` from build context |
| Create | `backend/Dockerfile` | Multi-stage: rust:1-slim builder → debian:bookworm-slim runtime |
| Create | `backend/docker-compose.prod.yml` | Production orchestration: postgres + redis + api |
| Create | `backend/.env.example` | Documents all required env vars; actual `.env` created manually on server |
| Create | `deploy.sh` | One-command deploy from Mac via SSH |

---

### Task 1: Generate sqlx offline query cache

`sqlx::query!` macros verify SQL at compile time against a live database. For Docker builds there is no database, so sqlx needs a pre-generated cache of query metadata in `.sqlx/`. This task generates and commits that cache.

**Files:**
- Populate: `backend/.sqlx/` (commit all generated `query-*.json` files)

- [ ] **Step 1: Start dev postgres**

```bash
cd /Volumes/Brown-32/knect/backend
docker compose up -d postgres
```

- [ ] **Step 2: Wait for postgres to be healthy**

```bash
docker compose ps postgres
```

Expected: `Status` column shows `healthy`. If still starting, wait 10 seconds and re-run.

- [ ] **Step 3: Install sqlx-cli (skip if `cargo sqlx` already works)**

```bash
cargo install sqlx-cli --no-default-features --features postgres,rustls
```

- [ ] **Step 4: Generate the query cache**

Run from `backend/`, pointing at the dev database:

```bash
cd /Volumes/Brown-32/knect/backend
DATABASE_URL=postgres://knect:knect@localhost:5432/knect cargo sqlx prepare
```

Expected output: `query data written to .sqlx/ in the current directory; please check this into version control`

- [ ] **Step 5: Verify files were generated**

```bash
ls /Volumes/Brown-32/knect/backend/.sqlx/
```

Expected: multiple `query-<hash>.json` files (one per `sqlx::query!` call in the codebase).

- [ ] **Step 6: Commit the cache**

```bash
git add backend/.sqlx/
git commit -m "chore: generate sqlx offline query cache for Docker builds"
```

---

### Task 2: Add .dockerignore

Without this, Docker sends the entire `backend/` directory to the daemon including `target/` (hundreds of MB). This file cuts the build context to just source files.

**Files:**
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create `backend/.dockerignore`**

```
target/
.env
tests/
```

- [ ] **Step 2: Commit**

```bash
git add backend/.dockerignore
git commit -m "chore: add .dockerignore to exclude target and tests from build context"
```

---

### Task 3: Write Dockerfile

Multi-stage build: compile the release binary in `rust:1-slim`, copy only the binary into `debian:bookworm-slim`. `SQLX_OFFLINE=true` tells sqlx to use the `.sqlx/` cache instead of a live database.

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM rust:1-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . .
ENV SQLX_OFFLINE=true
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/knect-api ./knect-api
EXPOSE 3000
CMD ["./knect-api"]
```

- [ ] **Step 2: Verify the image builds locally**

```bash
cd /Volumes/Brown-32/knect/backend
docker build -t knect-api:test .
```

Expected: `Successfully built <id>` and `Successfully tagged knect-api:test`. First build takes ~5 minutes; subsequent builds are cached.

- [ ] **Step 3: Smoke-test the image starts (will exit on missing env — that's expected)**

```bash
docker run --rm knect-api:test
```

Expected: exits with an error about missing env vars (`DATABASE_URL not set`). This confirms the binary runs and Config::from_env() is reached.

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: add multi-stage Dockerfile with sqlx offline mode"
```

---

### Task 4: Write docker-compose.prod.yml

Orchestrates postgres, redis, and api on an internal bridge network. Only the api's port 3000 is exposed to the host. Postgres and redis are unreachable from outside the Docker network. All three services restart automatically after server reboots.

**Files:**
- Create: `backend/docker-compose.prod.yml`

- [ ] **Step 1: Create `backend/docker-compose.prod.yml`**

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      PORT: "3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

volumes:
  postgres_data:
```

- [ ] **Step 2: Commit**

```bash
git add backend/docker-compose.prod.yml
git commit -m "feat: add production docker-compose"
```

---

### Task 5: Write .env.example and deploy.sh

**Files:**
- Create: `backend/.env.example`
- Create: `deploy.sh`

- [ ] **Step 1: Create `backend/.env.example`**

```bash
# Copy to .env and fill in real values before first deploy.
# DATABASE_URL and REDIS_URL are constructed by docker-compose.prod.yml — do not add them here.
POSTGRES_USER=knect
POSTGRES_PASSWORD=changeme
POSTGRES_DB=knect
JWT_SECRET=
JWT_REFRESH_SECRET=
PORT=3000
```

- [ ] **Step 2: Create `deploy.sh` at repo root**

```bash
#!/usr/bin/env bash
set -euo pipefail
ssh home "cd ~/Projects/knect && git pull && docker compose --env-file backend/.env -f backend/docker-compose.prod.yml up --build -d"
```

- [ ] **Step 3: Make deploy.sh executable**

```bash
chmod +x /Volumes/Brown-32/knect/deploy.sh
```

- [ ] **Step 4: Commit both**

```bash
git add backend/.env.example deploy.sh
git commit -m "feat: add .env.example and one-command deploy script"
```

---

### Task 6: First-time server setup

Performed once, manually via SSH. The repo is already cloned at `~/Projects/knect`.

- [ ] **Step 1: SSH into the server**

```bash
ssh home
```

- [ ] **Step 2: Install Docker**

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

- [ ] **Step 3: Verify Docker and Compose are available**

```bash
docker --version
docker compose version
```

Expected: Docker 24+ and Docker Compose 2+.

- [ ] **Step 4: Pull the latest code**

```bash
cd ~/Projects/knect
git pull
```

- [ ] **Step 5: Create the .env file with real secrets**

```bash
cp backend/.env.example backend/.env
```

Generate strong secrets:

```bash
openssl rand -hex 32   # run twice: once for JWT_SECRET, once for JWT_REFRESH_SECRET
openssl rand -hex 16   # for POSTGRES_PASSWORD
```

Edit the file and fill in all values:

```bash
nano backend/.env
```

The file should look like (with real values):

```
POSTGRES_USER=knect
POSTGRES_PASSWORD=<32-char random hex>
POSTGRES_DB=knect
JWT_SECRET=<32-char random hex>
JWT_REFRESH_SECRET=<different 32-char random hex>
PORT=3000
```

- [ ] **Step 6: Open port 3000 in the firewall**

```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

Expected: `3000/tcp   ALLOW   Anywhere` in the output.

- [ ] **Step 7: Start all services**

```bash
cd ~/Projects/knect
docker compose --env-file backend/.env -f backend/docker-compose.prod.yml up --build -d
```

Expected: postgres and redis start first, api builds (takes ~5-10 min on first run), then starts. Final output shows all three containers running.

- [ ] **Step 8: Confirm all containers are running**

```bash
docker compose -f backend/docker-compose.prod.yml ps
```

Expected: `postgres`, `redis`, and `api` all show `running`.

---

### Task 7: Verify the deployment

- [ ] **Step 1: Check API startup logs**

```bash
ssh home "docker compose -f ~/Projects/knect/backend/docker-compose.prod.yml logs api --tail=30"
```

Expected: `Listening on 0.0.0.0:3000` and no errors. Migrations should log as applied or already up-to-date.

- [ ] **Step 2: Hit the API from your Mac**

Replace `<SERVER_IP>` with your Linux machine's public IP address:

```bash
curl -s -w "\nHTTP %{http_code}\n" http://<SERVER_IP>:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"wrong"}'
```

Expected: `HTTP 401` or `HTTP 400`. Any HTTP response (not a connection refused) confirms the server is up, routing, and reachable from the internet.

- [ ] **Step 3: Verify subsequent deploys work from your Mac**

From your Mac (exit the SSH session first):

```bash
./deploy.sh
```

Expected: git pull + docker compose rebuild + restart, completes without error.

---

## Notes

- **Postgres data** persists in a Docker named volume (`postgres_data`) and is untouched by rebuilds or restarts.
- **Migrations** run automatically on every API startup (`sqlx::migrate!` in `main.rs:24`); they are idempotent.
- **Updating the sqlx cache**: if you add new `sqlx::query!` calls, re-run Task 1 Steps 4–6 before pushing.
- **Future HTTPS**: add Caddy in front (`caddy reverse-proxy --from :443 --to :3000`) and your public IP will get automatic Let's Encrypt certs.

#!/usr/bin/env bash
set -euo pipefail
ssh home "cd ~/Projects/knect && git pull && docker compose --env-file backend/.env -f backend/docker-compose.prod.yml up --build -d"

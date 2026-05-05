#!/bin/bash
# PM2 entry point for ilvcredit-vector-api (gunicorn, production)
set -a
source /home/ubuntu/ilvcredit-vector-app/server/.env
set +a
cd /home/ubuntu/ilvcredit-vector-app/server
exec /home/ubuntu/ilvcredit-vector-app/server/venv/bin/gunicorn \
  --workers 2 \
  --bind 127.0.0.1:${PORT:-3022} \
  --bind 172.17.0.1:${PORT:-3022} \
  --access-logfile - \
  --error-logfile - \
  --timeout 60 \
  app:app

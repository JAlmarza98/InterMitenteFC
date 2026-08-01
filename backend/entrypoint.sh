#!/bin/sh
set -e

npx prisma migrate deploy
node dist/scripts/seed.js
node dist/server.js

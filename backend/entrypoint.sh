#!/bin/sh
set -e

npx prisma migrate deploy
node dist/server.js

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh && chown -R node:node /app

# node:20-alpine ships a non-root "node" user (uid 1000) — run as it instead
# of root to limit the blast radius of a dependency RCE.
USER node

EXPOSE 3000
CMD ["./entrypoint.sh"]

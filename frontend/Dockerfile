# Angular CLI 22 requires Node >=22.22.3.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production

# Unprivileged nginx image: master and worker processes both run as the
# non-root "nginx" user (uid 101) instead of root, and listen on port 8080
# since binding <1024 requires root. Pinned by digest for reproducibility.
FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

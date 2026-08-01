# Inter Mitente

Aplicación web para gestionar el equipo: registro de usuarios con aprobación manual, plantilla de jugadores, partidos, cronómetro de tiempo de juego en vivo (con cambios) y estadísticas por partido y por temporada.

## Stack

- **Backend**: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL, sesiones (`express-session` + `connect-pg-simple`).
- **Frontend**: Angular (standalone components) + Angular Material (Material 3 / M3 theming).
- **Despliegue**: Docker Compose (`postgres`, `api`, `web`), pensado para un servidor Proxmox propio.

## Roles

- **admin**: aprueba/rechaza usuarios, gestiona roles, y todo lo que puede hacer `coach`.
- **coach**: gestiona jugadores, partidos, cronómetro en vivo y estadísticas.
- **member**: usuario aprobado con acceso de solo lectura a plantilla, partidos y estadísticas.

Cualquiera puede registrarse, pero el usuario queda en estado `pending` hasta que un admin lo aprueba desde **Usuarios** en el panel de administración.

## Desarrollo local

Requisitos: Node.js 20+, Docker y Docker Compose.

```bash
# Levantar solo Postgres para desarrollar contra él
docker compose up -d postgres   # requiere publicar el puerto 5432 temporalmente, ver nota abajo

# Backend
cd backend
npm install
cp .env.example ../.env   # o exporta las variables necesarias (ver más abajo)
npm run prisma:migrate    # solo la primera vez / al cambiar el schema
npm run dev                # tsx watch, http://localhost:3000

# Frontend
cd frontend
npm install
npm start                  # ng serve, http://localhost:4200
```

En desarrollo, el backend habilita CORS para `http://localhost:4200` y las cookies de sesión no requieren HTTPS (`NODE_ENV=development`).

> Nota: por defecto el servicio `postgres` de `docker-compose.yml` no publica ningún puerto al host (solo red interna, ver "Seguridad" más abajo). Para desarrollar contra él directamente añade temporalmente `ports: ["127.0.0.1:5433:5432"]` al servicio `postgres` y usa `DATABASE_URL=postgresql://intermitente:<password>@localhost:5433/intermitente`.

## Despliegue en Proxmox

1. En una VM o LXC con Docker y Docker Compose instalados, clona el repositorio.
2. Copia `.env.example` a `.env` y rellena los valores:

   ```bash
   cp .env.example .env
   ```

   | Variable | Descripción |
   |---|---|
   | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales de la base de datos. Usa una contraseña fuerte. |
   | `SESSION_SECRET` | Cadena aleatoria larga (32+ caracteres) para firmar las cookies de sesión. Genera una con `openssl rand -base64 32`. |
   | `ADMIN_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | Credenciales del primer administrador. Se crea automáticamente al arrancar si no existe ya un admin en la base de datos. |
   | `WEB_PORT` | Puerto del host donde se publica la aplicación (por defecto `8080`). |

3. Levanta el stack:

   ```bash
   docker compose up -d --build
   ```

   Esto compila las imágenes, aplica las migraciones de Prisma automáticamente (`entrypoint.sh`) y crea el primer admin si no existe ninguno.

4. La aplicación queda disponible en `http://<ip-del-servidor>:${WEB_PORT}`.

### Poner la app detrás de tu reverse proxy (HTTPS, dominio propio)

El contenedor `web` sirve la app entera (frontend + proxy a la API) en el puerto publicado (`WEB_PORT`, por defecto 8080). El propio `docker-compose.yml` **no** intenta gestionar TLS ni los puertos 80/443 del host, para no interferir con lo que ya tengas corriendo en Proxmox.

- **Reverse proxy fuera de Docker** (Nginx/Traefik/Nginx Proxy Manager en otra VM/LXC, o en el host): apunta un `proxy_pass`/host de destino a `http://<ip-del-servidor-docker>:${WEB_PORT}`.
- **Reverse proxy que corre como contenedor Docker en la misma máquina**: puedes en su lugar conectar el servicio `web` a la red Docker de ese proxy (añadiendo una entrada `networks` en `docker-compose.yml`) y quitar la publicación de `ports`, apuntando el proxy a `web:80` directamente.

En ambos casos, para que las cookies de sesión (`secure`) funcionen correctamente, el reverse proxy debe terminar HTTPS y reenviar la cabecera `X-Forwarded-Proto: https` — el `nginx.conf` del contenedor `web` ya la respeta si te llega, y si no está presente asume la conexión tal cual la recibe.

### Actualizar la aplicación

```bash
git pull
docker compose up -d --build
```

Las migraciones pendientes de Prisma se aplican automáticamente al arrancar `api`.

### Copias de seguridad

Los datos viven en el volumen Docker `postgres_data`. Para un volcado manual:

```bash
docker compose exec postgres pg_dump -U intermitente intermitente > backup.sql
```

## Seguridad

- El contenedor `postgres` no publica ningún puerto al host por defecto: solo es accesible desde `api` a través de la red interna de Docker Compose.
- El contenedor `api` tampoco publica puerto: el navegador solo habla con `web`, que hace de proxy interno hacia `api:3000`. Esto evita problemas de CORS y mantiene la cookie de sesión como same-origin.
- Las contraseñas se guardan con `bcryptjs`; las sesiones se guardan en Postgres (tabla gestionada por `connect-pg-simple`), no en JWT.

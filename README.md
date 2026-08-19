# Inter Mitente

Aplicación web para gestionar el equipo: registro de usuarios con aprobación manual, plantilla de jugadores, partidos, cronómetro de tiempo de juego en vivo (con cambios y estadísticas al momento) y estadísticas por partido y por temporada.

## Stack

- **Backend**: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL, sesiones (`express-session` + `connect-pg-simple`).
- **Frontend**: Angular (standalone components, rutas con lazy-loading) + Angular Material (Material 3 / M3 theming, tema oscuro navy/dorado afinado a partir del escudo del club, tipografía Bricolage Grotesque en titulares, y el dorado como color de "esto está activo/en vivo" en toda la app: navegación, foco, marcador en directo), diseño mobile-first. Instalable como PWA (service worker + manifest) para añadirla a la pantalla de inicio del móvil.
- **Despliegue**: Docker Compose (`postgres`, `api`, `web`), pensado para un servidor Proxmox propio.

## Roles

- **admin**: aprueba/rechaza usuarios, gestiona roles y temporadas, corrige estadísticas de partido a posteriori, borra partidos, cambia el estado de un partido y su marcador manualmente, y todo lo que puede hacer `coach`.
- **coach**: gestiona jugadores, crea y edita partidos (rival, fecha, competición, convocatoria) y dirige el partido en vivo (cronómetro, cambios, goles/asistencias/tarjetas). No puede borrar partidos, corregir estadísticas a posteriori, ni cambiar el estado o el marcador del partido fuera del propio cronómetro en vivo.
- **member**: usuario aprobado con acceso de solo lectura a plantilla, partidos y estadísticas.

Cualquiera puede registrarse, pero el usuario queda en estado `pending` hasta que un admin lo aprueba desde **Usuarios** en el panel de administración. La interfaz solo muestra las acciones que el rol del usuario puede realizar — si no puedes hacer algo, no aparece el botón (además de que el backend rechaza la petición igualmente si se intentara saltar la UI).

## Funcionalidades

- **Plantilla**: alta/baja de jugadores, dorsal, posición principal y posición secundaria opcional (desplegable con las posiciones de fútbol 7, incluida "Polivalente"; la secundaria no puede repetir la principal), activo/inactivo.
- **Partidos**: crear/editar con selector de fecha y hora nativos de Material, rival, local/visitante, competición (Liga/Copa), temporada, y duración de cada parte configurable (por defecto 30 minutos, ajustable por partido). Convocatoria con titulares/suplentes.
- **Partido en vivo**: cronómetro que arranca/pausa/termina cada parte, hace cambios (banquillo ↔ campo) y dispara goles/asistencias/tarjetas al momento con un toque, todo desde el móvil en la banda. El reloj se reconstruye desde el servidor en cada carga de página — sobrevive a recargas y cortes de conexión sin perder el tiempo transcurrido (ver "Diseño del cronómetro" más abajo). Cada jugador convocado muestra su tiempo de juego acumulado en directo, tanto en el campo (corriendo en tiempo real) como en el banquillo (congelado desde el último cambio).
- **Historial del partido**: cada gol, asistencia, tarjeta y cambio hecho en vivo queda registrado con el jugador y el minuto exacto en el que ocurrió, formando un resumen cronológico consultable tanto durante el partido (pantalla de partido en vivo) como después (ficha del partido). Los goles del rival también se anotan con un toque desde el partido en vivo (sin jugador asociado) y actualizan el marcador (`opponentScore`) al momento.
- **Estadísticas por partido**: minutos exactos jugados (con segundos) por jugador, goles, asistencias, tarjetas. La pantalla de "Estadísticas" del partido es para que un **admin** corrija datos mal apuntados a posteriori — anotar en directo se hace desde la pantalla de partido en vivo, disponible para `coach` y `admin`.
- **Estadísticas de temporada**: totales y medias por jugador (partidos jugados, minutos, goles, tarjetas...) agregando solo los partidos finalizados.
- **Temporadas** (admin): alta de temporadas con fecha de inicio/fin y cuál está activa.
- **Aprobación de usuarios** (admin): pendientes/aprobados/rechazados, cambio de rol.

## Diseño del cronómetro y tiempo de juego

El reloj del partido nunca se guarda como un contador — siempre se recalcula a partir de timestamps (`MatchPeriod.startedAt`/`endedAt` + pausas), tanto en el backend como al mostrarlo en el navegador. Esto es lo que hace que sobreviva a un refresco de página o a que se cierre el móvil a mitad de partido: no hay ningún estado en memoria que se pueda perder.

El tiempo jugado por cada jugador (`PlayingTimeSegment`) se guarda en segundos exactos (no minutos redondeados), y un jugador que sigue en el campo sin haber sido sustituido cuenta su tiempo en vivo en las estadísticas en vez de mostrar 0 hasta que sale. Tanto los cambios en vivo como la edición manual posterior escriben en la misma tabla, así que corregir un error de seguimiento en directo usa exactamente el mismo dato que ya se está mostrando.

Cada acción anotada en vivo (gol, asistencia, tarjeta, cambio) además crea un `MatchEvent` con el mismo cálculo de segundo transcurrido, independiente de los contadores de `MatchPlayerStat`: los contadores son el total corregible desde la pantalla de estadísticas, y `MatchEvent` es el registro cronológico de lo que pasó y cuándo, pensado solo para consulta (no se reescribe al corregir un total a posteriori).

## Desarrollo local

Requisitos: Node.js 22+, Docker y Docker Compose.

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

### Migraciones de Prisma

Los cambios de schema se gestionan con `prisma migrate dev` como es habitual. Una excepción: si Prisma detecta "drift" porque `connect-pg-simple` crea su propia tabla `session` fuera del control de Prisma, no uses `migrate reset` (borra todos los datos) — escribe el SQL de la migración a mano en `prisma/migrations/<timestamp>_nombre/migration.sql`, aplícalo con `docker compose exec postgres psql -U intermitente -d intermitente -f ...` (o pegando el SQL), y regístralo con `npx prisma migrate resolve --applied <timestamp>_nombre`.

## Tests

Unitarios e integración en backend (Vitest + Supertest) y frontend (Karma/Jasmine), y E2E de extremo a extremo (Playwright) contra una base de datos Postgres de test desechable (`docker-compose.test.yml`, aislada de la de desarrollo).

```bash
npm test              # todo: backend + frontend + E2E, contra la BD de test, con reporte final
npm run test:backend      # solo backend (unit + integration)
npm run test:frontend     # solo frontend
npm run test:e2e          # solo E2E (arranca su propio backend/frontend contra la BD de test)
```

`npm test` levanta `postgres-test`, aplica las migraciones, corre las tres suites (siempre las tres, aunque alguna falle), tira la base de datos al terminar, y escribe `reports/index.html` con el resultado y cobertura de cada una, enlazando a los reportes detallados (`backend/coverage/`, `frontend/coverage/`, `e2e/playwright-report/`). El código de salida refleja el resultado global — útil para CI.

Antes de la primera vez: `cp backend/.env.test.example backend/.env.test` (ya trae valores de test por defecto, no hace falta tocarlo) y `npm install` en `backend/`, `frontend/` y `e2e/`.

Para depurar sin que se destruya la base de datos al terminar: `npm run test:keep-db`. Para tocar solo la BD de test manualmente: `npm run test:db:up` / `npm run test:db:down`.

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
   | `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` / `PGADMIN_PORT` | Credenciales y puerto de pgAdmin (opcional, ver más abajo). |

3. Levanta el stack. Hay dos formas, según prefieras compilar en el propio Proxmox o usar las imágenes ya publicadas en Docker Hub:

   ```bash
   # Opción A: compilar en el servidor
   docker compose up -d --build

   # Opción B (más rápido en un LXC/VM con pocos recursos): usar las imágenes
   # ya publicadas en Docker Hub (jalmarza98/inter-mitente-api y -web, linux/amd64)
   docker compose pull
   docker compose up -d
   ```

   Ambas aplican las migraciones de Prisma automáticamente (`entrypoint.sh`) y crean el primer admin si no existe ninguno.

4. La aplicación queda disponible en `http://<ip-del-servidor>:${WEB_PORT}`.

### Poner la app detrás de tu reverse proxy (HTTPS, dominio propio)

El contenedor `web` sirve la app entera (frontend + proxy a la API) en el puerto publicado (`WEB_PORT`, por defecto 8080). El propio `docker-compose.yml` **no** intenta gestionar TLS ni los puertos 80/443 del host, para no interferir con lo que ya tengas corriendo en Proxmox.

- **Reverse proxy fuera de Docker** (Nginx/Traefik/Nginx Proxy Manager en otra VM/LXC, o en el host): apunta un `proxy_pass`/host de destino a `http://<ip-del-servidor-docker>:${WEB_PORT}`.
- **Reverse proxy que corre como contenedor Docker en la misma máquina**: puedes en su lugar conectar el servicio `web` a la red Docker de ese proxy (añadiendo una entrada `networks` en `docker-compose.yml`) y quitar la publicación de `ports`, apuntando el proxy a `web:80` directamente.

En ambos casos, para que las cookies de sesión funcionen correctamente, el reverse proxy debe terminar HTTPS y reenviar la cabecera `X-Forwarded-Proto: https` — el `nginx.conf` del contenedor `web` ya la respeta si te llega. La cookie de sesión usa `secure: 'auto'`, así que funciona tanto detrás de HTTPS como en HTTP plano (por ejemplo, mientras pruebas sin el reverse proxy delante todavía) sin necesitar tocar configuración.

### Actualizar la aplicación

```bash
git pull
docker compose up -d --build   # o `docker compose pull && docker compose up -d` si usas las imágenes de Docker Hub
```

Las migraciones pendientes de Prisma se aplican automáticamente al arrancar `api`.

### Publicar nuevas imágenes en Docker Hub

Las imágenes (`jalmarza98/inter-mitente-api` y `jalmarza98/inter-mitente-web`) se publican para `linux/amd64` explícitamente, porque el desarrollo se hace en Mac con Apple Silicon (arm64) y Proxmox corre en x86. Hace falta `docker buildx` (incluido en Docker Desktop) y estar logueado (`docker login`):

```bash
docker buildx build --platform linux/amd64 --push \
  -t jalmarza98/inter-mitente-api:<version> -t jalmarza98/inter-mitente-api:latest \
  ./backend

docker buildx build --platform linux/amd64 --push \
  -t jalmarza98/inter-mitente-web:<version> -t jalmarza98/inter-mitente-web:latest \
  ./frontend
```

Sustituye `<version>` por la versión correspondiente (coincidiendo con el tag de git, p. ej. `1.0.0`).

### Copias de seguridad

Los datos viven en el volumen Docker `postgres_data`. Para un volcado manual:

```bash
docker compose exec postgres pg_dump -U intermitente intermitente > backup.sql
```

### pgAdmin (opcional)

Hay un servicio `pgadmin` para administrar la base de datos desde el navegador. No arranca con `docker compose up -d` normal porque está bajo el profile `tools`:

```bash
docker compose --profile tools up -d pgadmin
```

Se sirve en `http://<ip-del-servidor>:${PGADMIN_PORT}` (por defecto `5050`), publicado solo en `127.0.0.1` — si accedes desde otra máquina, haz un túnel SSH: `ssh -L 5050:localhost:5050 usuario@servidor`. Inicia sesión con `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` de tu `.env`.

Una vez dentro, para conectarlo a la base de datos del proyecto: **Add New Server** →
- **General → Name**: cualquier nombre (p. ej. `intermitente`)
- **Connection → Host**: `postgres` (nombre del servicio en la red interna de Docker)
- **Port**: `5432`
- **Maintenance database**: el valor de `POSTGRES_DB`
- **Username** / **Password**: los valores de `POSTGRES_USER` / `POSTGRES_PASSWORD`

Para convertir manualmente a un usuario ya registrado en administrador (por ejemplo, si prefieres registrarte desde la app con tu email real en vez de usar el admin de arranque), abre **Query Tool** sobre esa base de datos y ejecuta:

```sql
UPDATE "User" SET role = 'admin', status = 'approved' WHERE email = 'tu-email@example.com';
```

## Seguridad

- El contenedor `postgres` no publica ningún puerto al host por defecto: solo es accesible desde `api` a través de la red interna de Docker Compose.
- El contenedor `api` tampoco publica puerto: el navegador solo habla con `web`, que hace de proxy interno hacia `api:3000`. Esto evita problemas de CORS y mantiene la cookie de sesión como same-origin.
- Las contraseñas se guardan con `bcryptjs`; las sesiones se guardan en Postgres (tabla gestionada por `connect-pg-simple`), no en JWT.
- Cada endpoint de escritura exige el rol adecuado (`coach`/`admin` según el recurso) en el propio backend, no solo en la interfaz — ocultar un botón en el frontend es una ayuda de UX, no el control de acceso real.

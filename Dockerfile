# syntax=docker/dockerfile:1
# Dockerfile para Coolify: build context = raíz del repositorio.
# Un solo contenedor: el servidor Hono sirve la API y el build estático de Vite.

# ---------------------------------------------------------------------------
# Etapa 1: build del frontend (Vite)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Etapa 2: build del backend (TypeScript -> dist)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Etapa 3: imagen final de producción
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Dependencias de producción
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# tsx se necesita solo para ejecutar las migraciones al arrancar (scripts/migrate.ts)
RUN npm install --no-save tsx

# Código compilado, migraciones y scripts
COPY server/dist ./dist
COPY server/scripts ./scripts
COPY server/drizzle ./drizzle

# Frontend estático servido por Hono
COPY --from=web-build /app/web/dist /app/web-dist
ENV WEB_DIST=/app/web-dist

# Coolify inyecta PORT automáticamente; 3000 como valor por defecto
ENV PORT=3000
EXPOSE 3000

# Aplica migraciones de Drizzle y luego arranca el servidor
CMD ["sh", "-c", "node --import tsx scripts/migrate.ts && node dist/index.js"]

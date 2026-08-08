# syntax=docker/dockerfile:1
# Dockerfile del daemon fb-promo (Coolify o docker plano).
# Build context = carpeta fb-promo/ (en Coolify: Base directory "fb-promo",
# Dockerfile location "fb-promo/Dockerfile"). Sin puertos expuestos: es un daemon.

FROM node:22-bookworm-slim
WORKDIR /app

# Dependencias (tsx es devDependency y se usa en runtime: instalar todo)
COPY package.json package-lock.json ./
RUN npm ci

# Chromium headless + libs de sistema (siempre en la versión que matchea el paquete)
RUN npx playwright install --with-deps chromium && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY config ./config

# Sesión de Facebook (trackeada en git). Se copia como "seed": el CMD la
# sincroniza hacia el volumen .data solo si cambió (nueva sesión pusheada).
COPY .data/session/storage-state.json /app/session-seed/storage-state.json

# Arranque: sincroniza la sesión si difiere de la del volumen y lanza el daemon
CMD ["sh", "-c", "mkdir -p /app/.data/session && { cmp -s /app/session-seed/storage-state.json /app/.data/session/storage-state.json || cp /app/session-seed/storage-state.json /app/.data/session/storage-state.json; } && npm run start"]

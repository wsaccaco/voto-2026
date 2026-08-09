# fb-promo — Publicador para grupos de Facebook

Daemon headless (Node + TypeScript + Playwright) que publica mensajes
promocionales de la plataforma de encuestas electorales
(`https://voto.pukllayandahuaylas.pe/resultados/{id}`) en grupos de Facebook,
con rotación de textos y enlaces, franjas horarias y límites anti-saturación.

## Advertencia importante (léela antes de usar)

- Automatizar una cuenta de Facebook **infringe los Términos de Servicio de
  Meta**. La cuenta puede ser restringida o baneada, y los grupos pueden
  expulsarla. Usa una **cuenta dedicada, nunca tu cuenta personal**.
- La cuenta dedicada debe tener **datos reales** (nombre verificable, foto,
  email válido): Meta desactiva cuentas con identidad falsa y perderías el
  acceso a todos los grupos.
- Este proyecto **no incluye técnicas de evasión de detección** (ni
  anti-fingerprint, ni bypass de captchas). Ante un checkpoint o bloqueo de
  Facebook, el daemon se detiene y requiere intervención humana.
- **Seguridad del repositorio:** `.data/session/storage-state.json` contiene
  las cookies de sesión de la cuenta (equivale a su contraseña). El repo debe
  ser **privado**, y ten en cuenta que el historial de git conserva cada
  versión del archivo aunque luego lo elimines.

## Warm-up obligatorio (antes de automatizar)

Una cuenta nueva tiene "confianza baja": Facebook limita cuántas publicaciones
puede hacer en grupos y dispara checkpoints con facilidad. Antes de activar el
daemon, durante 1–2 semanas:

1. Completa el perfil (foto, bio, ciudad).
2. Únete **manualmente** a los grupos objetivo.
3. Interactúa de forma orgánica (comenta, reacciona) algunos días.

Ramp-up recomendado de ritmo: la primera semana corre con
`npm run start -- --max-per-day 1` (o 2), y sube a 3 solo si no aparecen
restricciones.

## Instalación

```bash
cd fb-promo
npm install
npx playwright install chromium          # local (login)
# en el servidor además:
npx playwright install --with-deps chromium   # instala libs de sistema
```

## Configuración

- `config/groups.json` — franjas horarias (defaults: mañana 04:30–11:00,
  tarde 11:00–17:00, noche 17:00–23:00 hora Perú, contiguas), límites, y la lista de
  grupos. Cada grupo necesita: `id`, `name`, `url` (del grupo en Facebook),
  `district` y `links` (enlaces de resultados que rota; admite varios para
  grupos que cubren más de un distrito). Reemplaza los grupos de ejemplo.
- `config/templates.json` — plantillas de texto con `{distrito}` y `{enlace}`.

## Flujo de uso

### 1. Login inicial (una vez, en una máquina con GUI)

```bash
npm run login
```

Abre Chromium visible; inicia sesión manualmente (password + 2FA). Al
detectar la sesión exporta cookies/localStorage a
`.data/session/storage-state.json`. No se guardan credenciales.

### 2. Llevar la sesión al servidor (vía git)

El archivo `.data/session/storage-state.json` está trackeado a propósito:

```bash
git add fb-promo/.data/session/storage-state.json
git commit -m "Actualizar sesión de FB"
git push
# en el servidor (o redeploy en Coolify):
git pull
```

Solo se trackea la sesión: `state.json`, logs y el perfil del navegador están
en `.gitignore` (el estado lo genera el servidor y commitearlo causaría conflictos).

### 3. Probar y arrancar el daemon (en el servidor)

```bash
npm run dry-run    # simula el plan sin abrir navegador
npm run once       # publica 1 ciclo (dentro de una franja activa)
npm run start      # daemon 24/7
npm run start -- --max-per-day 1   # ritmo conservador (ramp-up)
```

Recomendado: correr bajo pm2 o systemd para reinicio automático.

pm2:

```bash
pm2 start "npm run start" --name fb-promo --cwd /ruta/fb-promo
pm2 save
```

systemd (`/etc/systemd/system/fb-promo.service`):

```ini
[Unit]
Description=fb-promo
After=network-online.target

[Service]
WorkingDirectory=/ruta/fb-promo
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=60

[Install]
WantedBy=multi-user.target
```

## Deploy con Docker (Coolify)

El daemon tiene su propio `fb-promo/Dockerfile` (no usa el de la web: necesita
Chromium y no expone puertos).

- **Coolify:** nueva aplicación desde el mismo repo git con
  *Base directory* `fb-promo` y *Dockerfile location* `fb-promo/Dockerfile`.
  Sin puerto expuesto.
- **Volumen persistente:** montar un volumen en `/app/.data` para que
  `state.json` (contadores de franjas) y logs sobrevivan redeploys.
- **Sesión:** el build incluye `storage-state.json` (trackeado en git) como
  seed; al arrancar, el CMD lo sincroniza al volumen solo si cambió. Flujo de
  renovación: `npm run login` local → `git push` → redeploy en Coolify.
- **Requisito:** commitear `fb-promo/.data/session/storage-state.json` antes
  del primer build (el Dockerfile lo copia y fallaría si no existe).
- La hora del contenedor no importa: el planificador calcula todo en
  America/Lima vía `Intl`, independiente de la hora del servidor.

Prueba local con docker:

```bash
cd fb-promo
docker build -t fb-promo .
docker run --rm -it -v fb-promo-data:/app/.data fb-promo npm run dry-run
docker run -d --name fb-promo -v fb-promo-data:/app/.data fb-promo   # daemon
```

## Comportamiento del planificador

- Intenta publicar cada **10–15 min** (aleatorio), solo dentro de la franja
  activa (mañana/tarde/noche, hora Perú). Franjas contiguas de 04:30 a 23:00;
  fuera de franja (madrugada) duerme.
- Si la verificación de sesión falla se reintenta **3 veces** con esperas
  crecientes (90–120 s): un login transitorio de Facebook no tira el daemon.
  Si persiste, alerta y espera **10 min** antes de salir para evitar
  crash-loops de reinicios en ráfaga (el próximo arranque reintentará).
- Máximo **1 publicación por grupo por franja** => **3/día por grupo**.
- Gap mínimo de **4 h** entre publicaciones al mismo grupo (cubierto por las
  franjas). Nunca dos publicaciones consecutivas al mismo grupo.
- Tope global diario configurable (default 30) como red de seguridad.
- Estado persistente en `.data/state.json`; sobrevive reinicios y se
  reinicia por día.
- **Grupos sin compositor de texto simple** (p. ej. de compraventa): al
  detectarse, se marcan en `unsupportedGroups` (`.data/state.json`) y se
  omiten permanentemente, sin detener el ciclo ni afectar al resto de
  publicaciones. Se revalidan publicando con `npm run once -- --group ID`:
  si el post sale, el grupo se desmarca solo.

## Recuperación ante alertas

El daemon escribe alertas críticas en `.data/ALERT.txt` y se detiene si:

- **Sesión expirada** (`SessionExpiredError`): repite `npm run login` en la
  máquina con GUI, sube el nuevo `storage-state.json` (git push) y reinicia el
  daemon.
- **Checkpoint/bloqueo** (`BlockedError`): revisa la cuenta manualmente en un
  navegador normal, resuelve la verificación, espera un par de días y reduce
  `--max-per-day` antes de reiniciar.

Monitoreo sugerido: un cron que avise si `.data/ALERT.txt` existe o fue
modificado recientemente.

## Login sin máquina local (CDP por SSH)

Si no puedes instalar el proyecto en una máquina con GUI:

1. En el servidor, arranca Chromium de Playwright con debugging remoto:

   ```bash
   npx playwright launch --channel chromium --persistent /tmp/fb-profile \
     -- --remote-debugging-port=9222   # o usa un script ad hoc
   ```

2. Desde tu PC, abre un túnel: `ssh -L 9222:localhost:9222 usuario@servidor`
3. Conecta un navegador Chromium local a `http://localhost:9222`, inicia
   sesión en Facebook ahí, y luego exporta el storageState desde el servidor
   (por ejemplo con un pequeño script que use `connectOverCDP` y
   `context.storageState()`).

## Estructura

```
fb-promo/
├── config/            groups.json, templates.json
├── .data/             (gitignore parcial) sesión trackeada, estado/logs locales
└── src/
    ├── index.ts       CLI: login | dry-run | once | run
    ├── scheduler.ts   franjas horarias, elegibilidad, selección por ciclo
    ├── content.ts     rotación de plantillas y enlaces
    ├── poster.ts      Playwright: sesión, compositor, detección de bloqueos
    ├── state.ts       persistencia del estado del planificador
    ├── config.ts      carga/validación de configuración
    └── log.ts         logs a consola + archivo, alertas críticas
```

## Mantenimiento

Los selectores del compositor de Facebook (`COMPOSER_SELECTORS` /
`SUBMIT_SELECTORS` en `src/poster.ts`) pueden romperse cuando Facebook cambia
su DOM. Si `npm run once` empieza a fallar con "No se encontró el compositor",
inspecciona el DOM del grupo y actualiza esos selectores. El grupo afectado
queda en omisión permanente (`unsupportedGroups`): tras corregir los
selectores, revalídalo con `npm run once -- --group ID` para que se desmarque
y vuelva a rotar en el planificador.

import 'dotenv/config';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { authHandler } from './auth.js';
import { env } from './env.js';
import { ensureWeeklyCycle } from './lib/surveys.js';
import { adminRoutes } from './routes/admin.js';
import { cronRoutes } from './routes/cron.js';
import { publicRoutes } from './routes/public.js';

const app = new Hono();

// Cabeceras de seguridad (CSP básico, HSTS, etc.).
// Se excluyen las rutas de Auth.js porque sus Response son inmutables y el
// middleware no puede modificar sus headers (lanzaria "TypeError: immutable").
const securityHeaders = secureHeaders();
app.use('*', async (c, next) => {
	if (c.req.path.startsWith('/api/auth')) return next();
	return securityHeaders(c, next);
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

// Auth.js (login/logout/sesión con Google)
app.all('/api/auth/*', (c) => authHandler(c));

// Rutas públicas, admin y cron
app.route('/api', publicRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/cron', cronRoutes);

app.onError((err, c) => {
	console.error('[error]', err);
	return c.json({ error: 'Error interno del servidor' }, 500);
});

// ---------------------------------------------------------------------------
// Frontend estático (build de Vite) con fallback SPA
// ---------------------------------------------------------------------------
app.use('*', serveStatic({ root: env.webDist }));
app.get('*', serveStatic({ root: env.webDist, path: 'index.html' }));

// ---------------------------------------------------------------------------
// Ciclo semanal: verificación al arranque + cada 30 minutos
// ---------------------------------------------------------------------------
async function tryWeeklyCycle() {
	try {
		await ensureWeeklyCycle();
	} catch (err) {
		console.warn('[ciclo semanal] no se pudo ejecutar:', err instanceof Error ? err.message : err);
	}
}
void tryWeeklyCycle();
setInterval(tryWeeklyCycle, 30 * 60_000).unref();

serve({ fetch: app.fetch, port: env.port }, (info) => {
	console.log(`Servidor escuchando en http://localhost:${info.port}`);
});

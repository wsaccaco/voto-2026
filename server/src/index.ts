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
import { ogRoutes, resultadosHtmlHandler } from './routes/og.js';
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
// Open Graph dinámico (imágenes + HTML con meta tags). Debe registrarse ANTES
// del middleware estático para tener precedencia sobre el fallback SPA.
// ---------------------------------------------------------------------------
app.route('/og', ogRoutes);
app.get('/resultados/:id', resultadosHtmlHandler);

// ---------------------------------------------------------------------------
// Frontend estático (build de Vite) con fallback SPA
// ---------------------------------------------------------------------------
// Caché de despliegue seguro: los assets de Vite llevan hash en el nombre
// (cambian en cada build), así que pueden cachearse para siempre; index.html
// en cambio debe revalidarse siempre, porque es el que apunta a los hashes.
// Si el navegador guarda un index.html viejo tras un redeploy, pedirá JS con
// hashes que ya no existen y el fallback SPA les devolvería HTML, causando
// "Failed to load module script ... MIME type of text/html".
app.use('/assets/*', async (c, next) => {
	await next();
	if (c.res.status === 200) {
		c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}
});

// Todo HTML estático (index.html en / o en rutas SPA) se revalida siempre.
app.use('*', async (c, next) => {
	await next();
	if (c.res.headers.get('Content-Type')?.includes('text/html')) {
		c.res.headers.set('Cache-Control', 'no-cache');
	}
});

app.use('*', serveStatic({ root: env.webDist }));

const serveIndexHtml = serveStatic({ root: env.webDist, path: 'index.html' });
app.get('*', async (c, next) => {
	// Un asset inexistente (/assets/*) nunca debe caer al index.html: 404.
	if (c.req.path.startsWith('/assets/')) return c.notFound();
	return serveIndexHtml(c, next);
});

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

import { Hono } from 'hono';
import { env } from '../env.js';
import { ensureWeeklyCycle } from '../lib/surveys.js';

export const cronRoutes = new Hono();

/**
 * POST /api/cron/weekly
 * Protegido con CRON_SECRET (header Authorization: Bearer <secret>).
 * Configurar en Coolify como cron job: cada lunes 00:05.
 */
cronRoutes.post('/weekly', async (c) => {
	const auth = c.req.header('authorization') ?? '';
	const token = auth.replace(/^Bearer\s+/i, '');
	if (!env.cronSecret || token !== env.cronSecret) {
		return c.json({ error: 'No autorizado' }, 401);
	}
	await ensureWeeklyCycle();
	return c.json({ ok: true, at: new Date().toISOString() });
});

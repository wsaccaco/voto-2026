import { Hono } from 'hono';
import { env } from '../env.js';
import { ensureWeeklyCycle } from '../lib/surveys.js';

export const cronRoutes = new Hono();

/**
 * POST /api/cron/weekly
 * Respaldo OPCIONAL: el ciclo semanal ya corre dentro del proceso (al arrancar
 * y cada 30 min, ver src/index.ts), por lo que este endpoint no es necesario
 * en el despliegue normal. Si se usa (p. ej. desde Coolify), debe ejecutarse
 * después del lunes 00:00 hora de Perú (America/Lima), p. ej. lunes 00:05.
 * Protegido con CRON_SECRET (header Authorization: Bearer <secret>).
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

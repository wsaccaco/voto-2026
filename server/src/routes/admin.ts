import { Hono } from 'hono';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { getSessionUser } from '../auth.js';
import { db } from '../db/index.js';
import {
	auditLog,
	candidates,
	deviceFingerprints,
	elections,
	responses,
	surveys,
	users
} from '../db/schema.js';
import { getDemographicBreakdown, getSurveyResults, resultsToCsv } from '../lib/results.js';
import { ensureWeeklyCycle } from '../lib/surveys.js';

export const adminRoutes = new Hono<{ Variables: { adminEmail: string } }>();

// Guard: solo administradores (ADMIN_EMAILS)
adminRoutes.use('*', async (c, next) => {
	const session = await getSessionUser(c);
	if (!session) return c.json({ error: 'No autenticado' }, 401);
	if (!session.isAdmin) return c.json({ error: 'Sin permisos de administrador' }, 403);
	c.set('adminEmail', session.email);
	await next();
});

async function logAudit(email: string, action: string, detail?: string) {
	await db.insert(auditLog).values({ actorEmail: email, action, detail });
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
adminRoutes.get('/overview', async (c) => {
	const [totalUsers] = await db.select({ n: count() }).from(users);
	const [totalVotes] = await db.select({ n: count() }).from(responses);
	const openSurveys = await db.select().from(surveys).where(eq(surveys.status, 'abierta'));
	const allElections = await db.select().from(elections);
	return c.json({
		totalUsers: totalUsers.n,
		totalVotes: totalVotes.n,
		openSurveys,
		elections: allElections
	});
});

// ---------------------------------------------------------------------------
// Elecciones y candidatos
// ---------------------------------------------------------------------------
adminRoutes.get('/candidates', async (c) => {
	const electionId = Number(c.req.query('electionId'));
	const list = electionId
		? await db.select().from(candidates).where(eq(candidates.electionId, electionId)).orderBy(asc(candidates.sortOrder))
		: await db.select().from(candidates).orderBy(asc(candidates.electionId), asc(candidates.sortOrder));
	return c.json({ candidates: list });
});

adminRoutes.post('/candidates', async (c) => {
	const body = await c.req.json();
	if (!body?.electionId || !body?.name) return c.json({ error: 'electionId y name son obligatorios' }, 400);
	const [created] = await db
		.insert(candidates)
		.values({
			electionId: Number(body.electionId),
			name: String(body.name).slice(0, 255),
			party: body.party ? String(body.party).slice(0, 255) : null,
			partyColor: body.partyColor ? String(body.partyColor).slice(0, 16) : null,
			photoUrl: body.photoUrl ?? null,
			partyLogoUrl: body.partyLogoUrl ?? null,
			isSpecial: Boolean(body.isSpecial),
			sortOrder: Number(body.sortOrder ?? 0)
		})
		.returning();
	await logAudit(c.get('adminEmail'), 'candidate.create', `${created.name} (id ${created.id})`);
	return c.json({ candidate: created });
});

adminRoutes.patch('/candidates/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const body = await c.req.json();
	const allowed: Record<string, unknown> = {};
	for (const key of ['name', 'party', 'partyColor', 'photoUrl', 'partyLogoUrl', 'active', 'isSpecial', 'sortOrder']) {
		if (key in body) allowed[key] = body[key];
	}
	const [updated] = await db.update(candidates).set(allowed).where(eq(candidates.id, id)).returning();
	if (!updated) return c.json({ error: 'Candidato no encontrado' }, 404);
	await logAudit(c.get('adminEmail'), 'candidate.update', JSON.stringify({ id, ...allowed }));
	return c.json({ candidate: updated });
});

// ---------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------
adminRoutes.get('/surveys', async (c) => {
	const electionId = Number(c.req.query('electionId'));
	const list = electionId
		? await db.select().from(surveys).where(eq(surveys.electionId, electionId)).orderBy(desc(surveys.weekNumber))
		: await db.select().from(surveys).orderBy(desc(surveys.createdAt));
	return c.json({ surveys: list });
});

adminRoutes.post('/surveys/:id/status', async (c) => {
	const id = Number(c.req.param('id'));
	const { status } = await c.req.json<{ status: 'abierta' | 'cerrada' | 'borrador' }>();
	if (!['abierta', 'cerrada', 'borrador'].includes(status)) {
		return c.json({ error: 'Estado inválido' }, 400);
	}
	const [updated] = await db.update(surveys).set({ status }).where(eq(surveys.id, id)).returning();
	if (!updated) return c.json({ error: 'Encuesta no encontrada' }, 404);
	await logAudit(c.get('adminEmail'), 'survey.status', `id ${id} -> ${status}`);
	return c.json({ survey: updated });
});

/** Ejecuta el ciclo semanal manualmente (respaldo del cron). */
adminRoutes.post('/surveys/roll', async (c) => {
	await ensureWeeklyCycle();
	await logAudit(c.get('adminEmail'), 'survey.roll', 'ciclo semanal manual');
	return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Resultados detallados + demografía + export
// ---------------------------------------------------------------------------
adminRoutes.get('/results/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const results = await getSurveyResults(id);
	if (!results) return c.json({ error: 'Encuesta no encontrada' }, 404);
	const demographics = await getDemographicBreakdown(id);
	return c.json({ ...results, demographics });
});

adminRoutes.get('/export/:id.csv', async (c) => {
	const id = Number(c.req.param('id'));
	const csv = await resultsToCsv(id);
	if (!csv) return c.json({ error: 'Encuesta no encontrada' }, 404);
	c.header('Content-Type', 'text/csv; charset=utf-8');
	c.header('Content-Disposition', `attachment; filename="encuesta-${id}.csv"`);
	return c.body(csv);
});

// ---------------------------------------------------------------------------
// Antifraude: cuentas sospechosas y anulación de votos
// ---------------------------------------------------------------------------
adminRoutes.get('/suspicious', async (c) => {
	// Fingerprints compartidos por 2+ cuentas de Google
	const shared = await db
		.select({
			fingerprintHash: deviceFingerprints.fingerprintHash,
			accounts: sql<number>`count(distinct ${deviceFingerprints.userId})`.as('accounts')
		})
		.from(deviceFingerprints)
		.groupBy(deviceFingerprints.fingerprintHash)
		.having(sql`count(distinct ${deviceFingerprints.userId}) > 1`)
		.orderBy(desc(sql`accounts`));

	const detailed = [];
	for (const row of shared) {
		const fpUsers = await db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(deviceFingerprints)
			.innerJoin(users, eq(users.id, deviceFingerprints.userId))
			.where(eq(deviceFingerprints.fingerprintHash, row.fingerprintHash))
			.groupBy(users.id, users.email, users.name);
		detailed.push({ fingerprintHash: row.fingerprintHash.slice(0, 12), accounts: row.accounts, users: fpUsers });
	}
	return c.json({ suspicious: detailed });
});

adminRoutes.delete('/responses/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const [deleted] = await db.delete(responses).where(eq(responses.id, id)).returning();
	if (!deleted) return c.json({ error: 'Voto no encontrado' }, 404);
	await logAudit(c.get('adminEmail'), 'response.void', `voto id ${id} de encuesta ${deleted.surveyId}`);
	return c.json({ ok: true });
});

adminRoutes.get('/responses', async (c) => {
	const surveyId = Number(c.req.query('surveyId'));
	if (!Number.isInteger(surveyId)) return c.json({ error: 'surveyId requerido' }, 400);
	const list = await db
		.select({
			id: responses.id,
			votedAt: responses.votedAt,
			userEmail: users.email,
			userName: users.name,
			candidateId: responses.candidateId,
			fingerprint: responses.fingerprintHash
		})
		.from(responses)
		.innerJoin(users, eq(users.id, responses.userId))
		.where(eq(responses.surveyId, surveyId))
		.orderBy(desc(responses.votedAt))
		.limit(500);
	return c.json({ responses: list });
});

import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import {
	getOrCreateDbUser,
	getSessionUser,
	type SessionUser
} from '../auth.js';
import { db } from '../db/index.js';
import { candidates, deviceFingerprints, responses, surveys, userProfiles, users } from '../db/schema.js';
import { getComparison, getSurveyResults, type Grouping } from '../lib/results.js';
import { rateLimit, sha256 } from '../lib/security.js';
import { getSurveyWithCandidates, listCurrentWeekBallots, listOpenSurveys } from '../lib/surveys.js';
import { countdownOf } from '../lib/weeks.js';

export const publicRoutes = new Hono();

// ---------------------------------------------------------------------------
// Sesión actual (para el frontend)
// ---------------------------------------------------------------------------
publicRoutes.get('/me', async (c) => {
	const session = await getSessionUser(c);
	if (!session) return c.json({ user: null });
	const dbUser = await findProfile(session);
	return c.json({ user: { ...session, profile: dbUser?.profile ?? null } });
});

async function findProfile(session: SessionUser) {
	const user = await db.query.users.findFirst({
		where: eq(users.email, session.email.toLowerCase()),
		with: { profile: true }
	});
	return user ?? null;
}

// ---------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------
publicRoutes.get('/surveys', async (c) => {
	const open = await listOpenSurveys();
	// Cuenta regresiva de la semana en curso, para el badge del frontend
	return c.json({ surveys: open, week: countdownOf(new Date()) });
});

publicRoutes.get('/surveys/:id', async (c) => {
	const id = Number(c.req.param('id'));
	if (!Number.isInteger(id)) return c.json({ error: 'id inválido' }, 400);
	const survey = await getSurveyWithCandidates(id);
	if (!survey) return c.json({ error: 'Encuesta no encontrada' }, 404);

	// Si hay sesión, indicar si ya votó y por quién
	const session = await getSessionUser(c);
	let myVote: { candidateId: number } | null = null;
	if (session) {
		const user = await db.query.users.findFirst({
			where: (u, { eq }) => eq(u.email, session.email.toLowerCase())
		});
		if (user) {
			const vote = await db.query.responses.findFirst({
				where: (r, { and, eq }) => and(eq(r.surveyId, id), eq(r.userId, user.id))
			});
			if (vote) myVote = { candidateId: vote.candidateId };
		}
	}

	return c.json({ survey, myVote });
});

// ---------------------------------------------------------------------------
// Votar (1 voto por persona por semana)
// ---------------------------------------------------------------------------
publicRoutes.post('/surveys/:id/vote', async (c) => {
	const session = await getSessionUser(c);
	if (!session) return c.json({ error: 'Debes iniciar sesión con Google para votar.' }, 401);

	const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
	if (!rateLimit(`vote:${ip}`, 10, 60_000)) {
		return c.json({ error: 'Demasiados intentos. Espera un momento.' }, 429);
	}

	const id = Number(c.req.param('id'));
	type VoteBody = { candidateId?: number; fingerprint?: string };
	const body: VoteBody = await c.req.json<VoteBody>().catch(() => ({}));
	const candidateId = Number(body.candidateId);
	if (!Number.isInteger(candidateId)) {
		return c.json({ error: 'Selecciona un candidato válido.' }, 400);
	}

	const survey = await getSurveyWithCandidates(id);
	if (!survey) return c.json({ error: 'Encuesta no encontrada' }, 404);
	if (survey.status !== 'abierta' || survey.endDate < new Date()) {
		return c.json({ error: 'Esta encuesta ya está cerrada. Participa en la de esta semana.' }, 403);
	}

	const candidate = survey.candidates.find((cd) => cd.id === candidateId);
	if (!candidate) return c.json({ error: 'El candidato no pertenece a esta elección.' }, 400);

	const user = await getOrCreateDbUser(session);
	const ipHash = sha256(ip);
	const fingerprint = typeof body.fingerprint === 'string' ? sha256(body.fingerprint) : null;

	// Registrar fingerprint (antifraude: detección de cuentas múltiples)
	if (fingerprint) {
		const existing = await db.query.deviceFingerprints.findFirst({
			where: (f, { and, eq }) => and(eq(f.userId, user.id), eq(f.fingerprintHash, fingerprint))
		});
		if (!existing) {
			await db.insert(deviceFingerprints).values({
				userId: user.id,
				fingerprintHash: fingerprint,
				userAgent: c.req.header('user-agent') ?? null
			});
		}
	}

	try {
		await db.insert(responses).values({
			surveyId: id,
			userId: user.id,
			candidateId,
			ipHash,
			fingerprintHash: fingerprint
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('responses_survey_user_uq') || msg.includes('duplicate key')) {
			return c.json({ error: 'Ya registraste tu voto esta semana. Podrás votar de nuevo la próxima semana.' }, 409);
		}
		throw err;
	}

	return c.json({ ok: true, message: '¡Tu voto fue registrado! Gracias por participar.' });
});

// ---------------------------------------------------------------------------
// Encuestas de la semana actual (con candidatos y votos propios)
// ---------------------------------------------------------------------------
publicRoutes.get('/week', async (c) => {
	const surveys = await listCurrentWeekBallots();

	let myVotes: Record<number, number> = {};
	const session = await getSessionUser(c);
	if (session && surveys.length > 0) {
		const user = await db.query.users.findFirst({
			where: eq(users.email, session.email.toLowerCase())
		});
		if (user) {
			const votes = await db
				.select({ surveyId: responses.surveyId, candidateId: responses.candidateId })
				.from(responses)
				.where(and(eq(responses.userId, user.id), inArray(responses.surveyId, surveys.map((s) => s.id))));
			for (const v of votes) myVotes[v.surveyId] = v.candidateId;
		}
	}

	return c.json({ surveys, myVotes });
});

// ---------------------------------------------------------------------------
// Voto por lote: una encuesta por nivel en la misma sesión de voto
// ---------------------------------------------------------------------------
publicRoutes.post('/vote', async (c) => {
	const session = await getSessionUser(c);
	if (!session) return c.json({ error: 'Debes iniciar sesión con Google para votar.' }, 401);

	const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
	if (!rateLimit(`vote:${ip}`, 10, 60_000)) {
		return c.json({ error: 'Demasiados intentos. Espera un momento.' }, 429);
	}

	type BatchBody = { votes?: { surveyId?: number; candidateId?: number }[]; fingerprint?: string };
	const body: BatchBody = await c.req.json<BatchBody>().catch(() => ({}));
	if (!Array.isArray(body.votes) || body.votes.length === 0) {
		return c.json({ error: 'Selecciona al menos una opción.' }, 400);
	}

	const user = await getOrCreateDbUser(session);
	const ipHash = sha256(ip);
	const fingerprint = typeof body.fingerprint === 'string' ? sha256(body.fingerprint) : null;

	// Registrar fingerprint (antifraude: detección de cuentas múltiples)
	if (fingerprint) {
		const existing = await db.query.deviceFingerprints.findFirst({
			where: (f, { and, eq }) => and(eq(f.userId, user.id), eq(f.fingerprintHash, fingerprint))
		});
		if (!existing) {
			await db.insert(deviceFingerprints).values({
				userId: user.id,
				fingerprintHash: fingerprint,
				userAgent: c.req.header('user-agent') ?? null
			});
		}
	}

	// Votos ya registrados en estas encuestas: se omiten sin romper el lote
	const surveyIds = body.votes.map((v) => Number(v.surveyId)).filter(Number.isInteger);
	const alreadyVoted = new Set(
		(await db
			.select({ surveyId: responses.surveyId })
			.from(responses)
			.where(and(eq(responses.userId, user.id), inArray(responses.surveyId, surveyIds))))
			.map((r) => r.surveyId)
	);

	const voted: number[] = [];
	const skipped: number[] = [];
	const errors: string[] = [];

	for (const v of body.votes) {
		const surveyId = Number(v.surveyId);
		const candidateId = Number(v.candidateId);
		if (!Number.isInteger(surveyId) || !Number.isInteger(candidateId)) {
			errors.push('Voto inválido');
			continue;
		}
		if (alreadyVoted.has(surveyId)) {
			skipped.push(surveyId);
			continue;
		}

		const survey = await getSurveyWithCandidates(surveyId);
		if (!survey || survey.status !== 'abierta' || survey.endDate < new Date()) {
			errors.push(`La encuesta ${surveyId} ya está cerrada.`);
			continue;
		}
		if (!survey.candidates.find((cd) => cd.id === candidateId)) {
			errors.push(`El candidato no pertenece a la encuesta ${surveyId}.`);
			continue;
		}

		try {
			await db.insert(responses).values({
				surveyId,
				userId: user.id,
				candidateId,
				ipHash,
				fingerprintHash: fingerprint
			});
			voted.push(surveyId);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes('responses_survey_user_uq') || msg.includes('duplicate key')) {
				skipped.push(surveyId);
			} else {
				throw err;
			}
		}
	}

	if (voted.length === 0 && skipped.length === 0) {
		return c.json({ error: errors[0] ?? 'No se pudo registrar ningún voto.' }, 400);
	}

	return c.json({
		ok: true,
		voted,
		skipped,
		message: '¡Tus votos fueron registrados! Gracias por participar.'
	});
});

// ---------------------------------------------------------------------------
// Resultados (polling desde el frontend)
// ---------------------------------------------------------------------------
publicRoutes.get('/results/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const res = await getSurveyResults(id);
	if (!res) return c.json({ error: 'Encuesta no encontrada' }, 404);
	return c.json(res);
});

// ---------------------------------------------------------------------------
// Comparativo entre semanas
// ---------------------------------------------------------------------------
publicRoutes.get('/comparison', async (c) => {
	const electionId = Number(c.req.query('electionId'));
	const grouping = (c.req.query('grouping') ?? 'semanal') as Grouping;
	if (!Number.isInteger(electionId)) return c.json({ error: 'electionId inválido' }, 400);
	if (!['semanal', 'quincenal', 'mensual'].includes(grouping)) {
		return c.json({ error: 'Agrupación inválida' }, 400);
	}
	const points = await getComparison(electionId, grouping);
	const electionCandidates = await db
		.select()
		.from(candidates)
		.where(eq(candidates.electionId, electionId));
	return c.json({ points, candidates: electionCandidates });
});

// ---------------------------------------------------------------------------
// Perfil demográfico (opcional y amigable)
// ---------------------------------------------------------------------------
const AGE_RANGES = ['18-25', '26-35', '36-50', '51+'];
const SEXES = ['masculino', 'femenino', 'prefiero_no_decir'];

publicRoutes.post('/profile', async (c) => {
	const session = await getSessionUser(c);
	if (!session) return c.json({ error: 'Inicia sesión primero.' }, 401);
	const user = await getOrCreateDbUser(session);

	type ProfileBody = {
		ageRange?: string | null;
		sex?: string | null;
		district?: string | null;
		province?: string | null;
		occupation?: string | null;
		educationLevel?: string | null;
	};
	const body = await c.req.json<ProfileBody>().catch(() => ({} as ProfileBody));

	const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
	const ageRange = body.ageRange && AGE_RANGES.includes(body.ageRange) ? body.ageRange : null;
	const sex = body.sex && SEXES.includes(body.sex) ? body.sex : null;

	const values = {
		ageRange: ageRange as '18-25' | '26-35' | '36-50' | '51+' | null,
		sex: sex as 'masculino' | 'femenino' | 'prefiero_no_decir' | null,
		district: clean(body.district),
		province: clean(body.province),
		occupation: clean(body.occupation),
		educationLevel: clean(body.educationLevel)
	};

	const filled = Object.values(values).filter(Boolean).length;

	await db
		.insert(userProfiles)
		.values({ userId: user.id, ...values, completedAt: filled >= 4 ? new Date() : null })
		.onConflictDoUpdate({ target: userProfiles.userId, set: values });

	return c.json({ ok: true, filled });
});

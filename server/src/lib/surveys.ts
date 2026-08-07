import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { candidates, elections, responses, surveys } from '../db/schema.js';
import { currentWeekRange, isoWeekNumber, weekLabel } from './weeks.js';

/** Encuestas abiertas con datos de su elección. */
export async function listOpenSurveys() {
	const open = await db
		.select({
			survey: surveys,
			electionName: elections.name,
			electionType: elections.type,
			electionLevel: elections.level,
			electionProvince: elections.province,
			electionDistrict: elections.district
		})
		.from(surveys)
		.innerJoin(elections, eq(surveys.electionId, elections.id))
		.where(eq(surveys.status, 'abierta'))
		.orderBy(asc(elections.id));

	return open.map((row) => ({
		...row.survey,
		electionName: row.electionName,
		electionType: row.electionType,
		electionLevel: row.electionLevel,
		electionProvince: row.electionProvince,
		electionDistrict: row.electionDistrict,
		weekLabel: weekLabel(row.survey.startDate, row.survey.endDate)
	}));
}

/** Encuesta por id con sus candidatos activos y conteo de votos. */
export async function getSurveyWithCandidates(surveyId: number) {
	const [surveyRow] = await db
		.select({
			survey: surveys,
			electionName: elections.name,
			electionType: elections.type,
			electionLevel: elections.level,
			electionProvince: elections.province,
			electionDistrict: elections.district
		})
		.from(surveys)
		.innerJoin(elections, eq(surveys.electionId, elections.id))
		.where(eq(surveys.id, surveyId));
	if (!surveyRow) return null;

	const surveyCandidates = await db
		.select()
		.from(candidates)
		.where(and(eq(candidates.electionId, surveyRow.survey.electionId), eq(candidates.active, true)))
		.orderBy(asc(candidates.sortOrder), asc(candidates.id));

	const [voteCount] = await db
		.select({ count: responses.id })
		.from(responses)
		.where(eq(responses.surveyId, surveyId))
		.limit(1);

	return {
		...surveyRow.survey,
		electionName: surveyRow.electionName,
		electionType: surveyRow.electionType,
		electionLevel: surveyRow.electionLevel,
		electionProvince: surveyRow.electionProvince,
		electionDistrict: surveyRow.electionDistrict,
		weekLabel: weekLabel(surveyRow.survey.startDate, surveyRow.survey.endDate),
		candidates: surveyCandidates,
		hasVotes: Boolean(voteCount)
	};
}

/**
 * Cédulas de la semana actual: encuestas abiertas y no vencidas con sus
 * candidatos, en orden regional → provincial → distrital.
 */
export async function listCurrentWeekBallots() {
	const open = await listOpenSurveys();
	const now = new Date();
	const levelRank = { regional: 0, provincial: 1, distrital: 2 } as const;
	const current = open
		.filter((s) => s.endDate >= now)
		.sort((a, b) => levelRank[a.electionLevel] - levelRank[b.electionLevel]);

	const detailed: NonNullable<Awaited<ReturnType<typeof getSurveyWithCandidates>>>[] = [];
	for (const s of current) {
		const detail = await getSurveyWithCandidates(s.id);
		if (detail) detailed.push(detail);
	}
	return detailed;
}

/**
 * Ciclo semanal: cierra encuestas vencidas y abre la encuesta de la semana
 * actual para cada elección activa que no la tenga. Idempotente.
 */
export async function ensureWeeklyCycle(now = new Date()) {
	const { start, end } = currentWeekRange(now);
	const weekNumber = isoWeekNumber(now);

	const activeElections = await db.select().from(elections).where(eq(elections.active, true));

	for (const election of activeElections) {
		const electionSurveys = await db
			.select()
			.from(surveys)
			.where(eq(surveys.electionId, election.id))
			.orderBy(desc(surveys.weekNumber));

		// 1. Cerrar encuestas abiertas cuyo periodo ya terminó
		for (const s of electionSurveys) {
			if (s.status === 'abierta' && s.endDate < now) {
				await db.update(surveys).set({ status: 'cerrada' }).where(eq(surveys.id, s.id));
			}
		}

		// 2. Crear la encuesta de esta semana si no existe
		const exists = electionSurveys.some((s) => s.weekNumber === weekNumber);
		if (!exists) {
			await db.insert(surveys).values({
				electionId: election.id,
				// El título solo lleva el nombre de la elección; la semana y las fechas
				// se muestran por separado en la interfaz para evitar duplicados.
				title: election.name,
				weekNumber,
				startDate: start,
				endDate: end,
				status: 'abierta'
			});
			console.log(`[ciclo semanal] Encuesta creada: ${election.name} semana ${weekNumber}`);
		}
	}
}

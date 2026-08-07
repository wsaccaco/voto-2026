import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { candidates, responses, surveys, userProfiles } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Caché simple en memoria (TTL corto) para no golpear la BD con el polling
// ---------------------------------------------------------------------------
const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 10_000;

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data as T);
	return loader().then((data) => {
		cache.set(key, { at: Date.now(), data });
		return data;
	});
}

// ---------------------------------------------------------------------------
// Resultados de una encuesta
// ---------------------------------------------------------------------------
export interface CandidateResult {
	candidateId: number;
	name: string;
	party: string | null;
	partyColor: string | null;
	photoUrl: string | null;
	isSpecial: boolean;
	votes: number;
	percent: number;
}

export async function getSurveyResults(surveyId: number) {
	return cached(`results:${surveyId}`, async () => {
		const rows = await db
			.select({
				candidateId: candidates.id,
				name: candidates.name,
				party: candidates.party,
				partyColor: candidates.partyColor,
				photoUrl: candidates.photoUrl,
				isSpecial: candidates.isSpecial,
				votes: count(responses.id)
			})
			.from(candidates)
			.leftJoin(responses, and(eq(responses.candidateId, candidates.id), eq(responses.surveyId, surveyId)))
			.where(eq(candidates.active, true))
			.groupBy(
				candidates.id,
				candidates.name,
				candidates.party,
				candidates.partyColor,
				candidates.photoUrl,
				candidates.isSpecial
			);

		// Solo candidatos de la elección de esta encuesta
		const [survey] = await db.select().from(surveys).where(eq(surveys.id, surveyId));
		if (!survey) return null;

		const filtered = rows;
		const electionCandidates = await db
			.select({ id: candidates.id })
			.from(candidates)
			.where(eq(candidates.electionId, survey.electionId));
		const ids = new Set(electionCandidates.map((c) => c.id));

		const results: CandidateResult[] = filtered
			.filter((r) => ids.has(r.candidateId))
			.map((r) => ({ ...r, percent: 0 }))
			.sort((a, b) => b.votes - a.votes);

		const totalVotes = results.reduce((acc, r) => acc + r.votes, 0);
		for (const r of results) {
			r.percent = totalVotes > 0 ? Math.round((r.votes / totalVotes) * 1000) / 10 : 0;
		}

		return { surveyId, totalVotes, results };
	});
}

// ---------------------------------------------------------------------------
// Comparativo entre periodos para una elección
// ---------------------------------------------------------------------------
export type Grouping = 'semanal' | 'quincenal' | 'mensual';

export interface ComparisonPoint {
	surveyId: number;
	weekNumber: number;
	label: string;
	percents: Record<number, number>; // candidateId -> %
	totalVotes: number;
}

export async function getComparison(electionId: number, grouping: Grouping) {
	return cached(`comparison:${electionId}:${grouping}`, async () => {
		const electionSurveys = await db
			.select()
			.from(surveys)
			.where(eq(surveys.electionId, electionId))
			.orderBy(asc(surveys.weekNumber));

		const points: ComparisonPoint[] = [];
		for (const s of electionSurveys) {
			const res = await getSurveyResults(s.id);
			if (!res || res.totalVotes === 0) continue;
			points.push({
				surveyId: s.id,
				weekNumber: s.weekNumber,
				label: `S${s.weekNumber}`,
				percents: Object.fromEntries(res.results.map((r) => [r.candidateId, r.percent])),
				totalVotes: res.totalVotes
			});
		}

		if (grouping === 'semanal') return points;

		// Agrupar promedios por quincena (2 semanas) o mes (4 semanas)
		const size = grouping === 'quincenal' ? 2 : 4;
		const grouped: ComparisonPoint[] = [];
		for (let i = 0; i < points.length; i += size) {
			const chunk = points.slice(i, i + size);
			const percents: Record<number, number> = {};
			const candidateIds = new Set(chunk.flatMap((p) => Object.keys(p.percents).map(Number)));
			for (const id of candidateIds) {
				const values = chunk.map((p) => p.percents[id] ?? 0);
				percents[id] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
			}
			grouped.push({
				surveyId: chunk[chunk.length - 1].surveyId,
				weekNumber: chunk[chunk.length - 1].weekNumber,
				label: `${chunk[0].label}–${chunk[chunk.length - 1].label}`,
				percents,
				totalVotes: chunk.reduce((a, p) => a + p.totalVotes, 0)
			});
		}
		return grouped;
	});
}

// ---------------------------------------------------------------------------
// Desgloses demográficos (solo admin / informes)
// ---------------------------------------------------------------------------
export async function getDemographicBreakdown(surveyId: number) {
	const base = db
		.select({
			ageRange: userProfiles.ageRange,
			sex: userProfiles.sex,
			district: userProfiles.district,
			candidateId: responses.candidateId,
			total: count(responses.id)
		})
		.from(responses)
		.innerJoin(userProfiles, eq(userProfiles.userId, responses.userId))
		.where(eq(responses.surveyId, surveyId))
		.groupBy(userProfiles.ageRange, userProfiles.sex, userProfiles.district, responses.candidateId);

	const rows = await base;

	const byAge = aggregate(rows, (r) => r.ageRange ?? 'sin dato');
	const bySex = aggregate(rows, (r) => r.sex ?? 'sin dato');
	const byDistrict = aggregate(rows, (r) => r.district ?? 'sin dato');

	return { byAge, bySex, byDistrict };
}

type DemoRow = {
	ageRange: string | null;
	sex: string | null;
	district: string | null;
	candidateId: number;
	total: number;
};

function aggregate(rows: DemoRow[], keyFn: (r: DemoRow) => string) {
	const map = new Map<string, Map<number, number>>();
	for (const r of rows) {
		const key = keyFn(r);
		if (!map.has(key)) map.set(key, new Map());
		const inner = map.get(key)!;
		inner.set(r.candidateId, (inner.get(r.candidateId) ?? 0) + r.total);
	}
	return Array.from(map.entries()).map(([label, votes]) => {
		const total = Array.from(votes.values()).reduce((a, b) => a + b, 0);
		return {
			label,
			total,
			candidates: Array.from(votes.entries())
				.map(([candidateId, n]) => ({
					candidateId,
					votes: n,
					percent: total > 0 ? Math.round((n / total) * 1000) / 10 : 0
				}))
				.sort((a, b) => b.votes - a.votes)
		};
	});
}

/** Exportación CSV de resultados de una encuesta. */
export async function resultsToCsv(surveyId: number): Promise<string> {
	const res = await getSurveyResults(surveyId);
	if (!res) return '';
	const header = 'candidato,partido,votos,porcentaje';
	const lines = res.results.map(
		(r) => `"${r.name}","${r.party ?? ''}",${r.votes},${r.percent}`
	);
	return [header, ...lines, `TOTAL,,${res.totalVotes},100`].join('\n');
}

import { districtsOf, getProvince, isCapitalDistrict, REGION_NAME } from './geo';
import type { ElectionLevel, Survey } from './types';

const STORAGE_KEY = 'encuesta:ubicacion';
/** Clave antigua (modelo binario): se descarta al leer. */
const LEGACY_KEY = 'encuesta:punto-votacion';

/**
 * Lugar de residencia del elector dentro de la región Apurímac.
 * Determina sus encuestas: la regional siempre; la provincial según su
 * provincia; la distrital solo si su distrito no es capital provincial.
 */
export interface VotingLocation {
	province: string;
	district: string;
}

/** Orden fijo de presentación de las encuestas (como en el local de votación). */
export const LEVEL_ORDER: ElectionLevel[] = ['regional', 'provincial', 'distrital'];

export const LEVEL_LABELS: Record<ElectionLevel, string> = {
	regional: `Gobierno Regional de ${REGION_NAME}`,
	provincial: 'Alcaldía provincial',
	distrital: 'Alcaldía distrital'
};

/** Etiqueta legible del nivel; si la lista trae una sola elección del nivel usa su nombre. */
export function levelLabel(level: ElectionLevel, surveys?: Survey[]): string {
	const ofLevel = surveys?.filter((s) => s.electionLevel === level) ?? [];
	const unique = [...new Set(ofLevel.map((s) => s.electionName))];
	if (unique.length === 1) return unique[0];
	return LEVEL_LABELS[level];
}

/** "Talavera, Andahuaylas" */
export function locationLabel(location: VotingLocation): string {
	return `${location.district}, ${location.province}`;
}

/** Ubicación registrada por el usuario (persistida localmente). */
export function getVotingLocation(): VotingLocation | null {
	try {
		localStorage.removeItem(LEGACY_KEY);
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<VotingLocation>;
		if (typeof parsed.province !== 'string' || typeof parsed.district !== 'string') return null;
		// Validar contra el catálogo: la provincia debe existir y el distrito pertenecer a ella
		if (!districtsOf(parsed.province).includes(parsed.district)) return null;
		return { province: parsed.province, district: parsed.district };
	} catch {
		return null;
	}
}

export function setVotingLocation(location: VotingLocation) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
	} catch {
		/* almacenamiento no disponible */
	}
}

export function clearVotingLocation() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* almacenamiento no disponible */
	}
}

/** Indica si la encuesta corresponde al ámbito de la ubicación dada. */
export function canVoteIn<T extends Pick<Survey, 'electionLevel' | 'electionProvince' | 'electionDistrict'>>(
	survey: T,
	location: VotingLocation | null
): boolean {
	if (!location) return false;
	if (survey.electionLevel === 'regional') return true;
	if (survey.electionLevel === 'provincial') return survey.electionProvince === location.province;
	return survey.electionProvince === location.province && survey.electionDistrict === location.district;
}

/**
 * Encuestas visibles según dónde vive el usuario.
 * Sin ubicación registrada se muestran todas (modo exploración).
 */
export function visibleSurveys<T extends Survey>(surveys: T[], location: VotingLocation | null): T[] {
	if (!location) return surveys;
	return surveys.filter((s) => canVoteIn(s, location));
}

/** Agrupa encuestas por elección, en el orden de niveles (regional primero). */
export function groupByElection<T extends Survey>(surveys: T[]): { electionId: number; name: string; level: ElectionLevel; surveys: T[] }[] {
	const map = new Map<number, { electionId: number; name: string; level: ElectionLevel; surveys: T[] }>();
	for (const s of surveys) {
		const group = map.get(s.electionId) ?? { electionId: s.electionId, name: s.electionName, level: s.electionLevel, surveys: [] };
		group.surveys.push(s);
		map.set(s.electionId, group);
	}
	const rank = (level: ElectionLevel) => LEVEL_ORDER.indexOf(level);
	return [...map.values()].sort((a, b) => rank(a.level) - rank(b.level) || a.electionId - b.electionId);
}

/** Aviso para electores de capitales provinciales (sin alcalde distrital propio). */
export function capitalNote(location: VotingLocation): string | null {
	if (!isCapitalDistrict(location.province, location.district)) return null;
	const province = getProvince(location.province);
	return `Vives en la capital de la provincia de ${location.province}: no hay alcalde distrital separado, ` +
		`el alcalde provincial de ${province?.name ?? location.province} cumple esa función.`;
}

/**
 * Elimina el sufijo " · Semana N (año)" de títulos históricos,
 * que se muestra por separado y no aporta información en el card.
 */
export function cleanSurveyTitle(title: string): string {
	return title.replace(/\s*·\s*Semana \d+\s*\(\d{4}\)\s*$/i, '').trim();
}

/**
 * Rango de fechas en un único formato legible, ej. "3 – 9 de agosto de 2026"
 * o "28 de julio – 3 de agosto de 2026" si cruza meses.
 */
export function formatDateRange(start: string, end: string): string {
	const a = new Date(start);
	const b = new Date(end);
	const long = { day: 'numeric', month: 'long', year: 'numeric' } as const;
	const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
	if (sameMonth) return `${a.getDate()} – ${b.toLocaleDateString('es-PE', long)}`;
	return `${a.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })} – ${b.toLocaleDateString('es-PE', long)}`;
}

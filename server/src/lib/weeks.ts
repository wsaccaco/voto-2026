/**
 * Utilidades de ciclo semanal.
 * La semana electoral inicia el lunes a las 00:00 y termina el domingo a las
 * 23:59:59, siempre en hora de Perú (America/Lima, UTC-5 fijo, sin horario de
 * verano), independientemente de la zona horaria del servidor.
 * El número de semana es el ISO-8601 del día civil peruano.
 * La cuenta regresiva electoral (etiqueta "N/M" de la interfaz) se calcula
 * contra la semana del día de las elecciones.
 */

/** Offset de Perú (America/Lima) respecto a UTC, en milisegundos. */
const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Misma fecha desplazada a UTC para leer sus componentes civiles peruanos. */
function peruCivil(date: Date): Date {
	// Perú (UTC-5): la hora civil peruana de `date` son sus componentes UTC tras restar 5 h.
	return new Date(date.getTime() - PERU_OFFSET_MS);
}

/** Número de semana ISO-8601 para una fecha dada (día civil de Perú). */
export function isoWeekNumber(date: Date): number {
	const civil = peruCivil(date);
	const d = new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Lunes 00:00:00 (hora de Perú) de la semana que contiene `date`. */
export function mondayOfWeek(date: Date): Date {
	const civil = peruCivil(date);
	const day = civil.getUTCDay() || 7; // domingo = 7
	// Lunes 00:00 en Perú equivale a las 05:00 UTC.
	return new Date(
		Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate() - (day - 1), 5, 0, 0)
	);
}

/** Inicio y fin de la semana actual. */
export function currentWeekRange(now = new Date()): { start: Date; end: Date } {
	const start = mondayOfWeek(now);
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	end.setMilliseconds(end.getMilliseconds() - 1);
	return { start, end };
}

/** Rango de la semana siguiente a la de `date`. */
export function nextWeekRange(date: Date): { start: Date; end: Date } {
	const next = new Date(date);
	next.setDate(next.getDate() + 7);
	return currentWeekRange(next);
}

/** Rango legible para una encuesta semanal, ej. "4 ago – 10 ago" (hora de Perú). */
export function weekLabel(start: Date, end: Date): string {
	const fmt = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' });
	return `${fmt.format(start)} – ${fmt.format(end)}`;
}

// ---------------------------------------------------------------------------
// Cuenta regresiva electoral
// ---------------------------------------------------------------------------

/** Día de las elecciones: domingo 4 de octubre de 2026 (ERM 2026, hora de Perú). */
export const ELECTION_DATE = new Date(Date.UTC(2026, 9, 4, 5, 0, 0));

/** Duración de la cuenta regresiva en semanas: la semana de las elecciones es la N/N. */
export const COUNTDOWN_TOTAL_WEEKS = 8;

/**
 * Posición (1..N) y total de la cuenta regresiva para la semana que contiene
 * `date`: la primera semana de la campaña es "1/N", la de las elecciones "N/N"
 * y las semanas fuera de la campaña quedan acotadas al rango.
 */
export function countdownOf(date: Date): { position: number; total: number } {
	const electionWeekStart = mondayOfWeek(ELECTION_DATE);
	const weekStart = mondayOfWeek(date);
	const weeksLeft = Math.round((electionWeekStart.getTime() - weekStart.getTime()) / (7 * 86_400_000));
	const position = Math.min(COUNTDOWN_TOTAL_WEEKS, Math.max(1, COUNTDOWN_TOTAL_WEEKS - weeksLeft + 1));
	return { position, total: COUNTDOWN_TOTAL_WEEKS };
}

/** Etiqueta de la cuenta regresiva, ej. "1/8" para la semana en curso. */
export function countdownLabel(date: Date): string {
	const { position, total } = countdownOf(date);
	return `${position}/${total}`;
}

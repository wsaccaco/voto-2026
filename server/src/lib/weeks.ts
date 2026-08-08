/**
 * Utilidades de ciclo semanal.
 * La semana electoral inicia el lunes a las 00:00 y termina el domingo a las
 * 23:59:59, siempre en hora de Perú (America/Lima, UTC-5 fijo, sin horario de
 * verano), independientemente de la zona horaria del servidor.
 * El número de semana es el ISO-8601 del día civil peruano.
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

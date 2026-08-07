/**
 * Utilidades de ciclo semanal.
 * La semana inicia el lunes a las 00:00 y termina el domingo a las 23:59:59.
 * El número de semana es el ISO-8601 dentro del año en curso.
 */

/** Número de semana ISO-8601 para una fecha dada. */
export function isoWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Lunes 00:00:00 (hora local) de la semana que contiene `date`. */
export function mondayOfWeek(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay() || 7; // domingo = 7
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - (day - 1));
	return d;
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

/** Rango legible para una encuesta semanal, ej. "4 ago – 10 ago". */
export function weekLabel(start: Date, end: Date): string {
	const fmt = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });
	return `${fmt.format(start)} – ${fmt.format(end)}`;
}

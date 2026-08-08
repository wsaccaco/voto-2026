/**
 * Cuenta regresiva electoral (espejo de server/src/lib/weeks.ts).
 * La semana electoral va de lunes a domingo en hora de Perú (America/Lima,
 * UTC-5 fijo, sin horario de verano) y la etiqueta "N/M" cuenta las semanas
 * hasta el día de las elecciones: la primera semana de la campaña es "1/M"
 * y la semana de las elecciones "M/M".
 */

const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 86_400_000;

/** Día de las elecciones: domingo 4 de octubre de 2026 (ERM 2026, hora de Perú). */
const ELECTION_DATE = new Date(Date.UTC(2026, 9, 4, 5, 0, 0));

/** Duración de la cuenta regresiva en semanas (misma constante que el servidor). */
const COUNTDOWN_TOTAL_WEEKS = 8;

/** Lunes 00:00:00 (hora de Perú) de la semana que contiene `date`. */
function mondayOfWeek(date: Date): Date {
	const civil = new Date(date.getTime() - PERU_OFFSET_MS);
	const day = civil.getUTCDay() || 7; // domingo = 7
	return new Date(
		Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate() - (day - 1), 5, 0, 0)
	);
}

/** Etiqueta de la cuenta regresiva, ej. "1/8" para la semana en curso. */
export function countdownLabel(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	const electionWeekStart = mondayOfWeek(ELECTION_DATE);
	const weekStart = mondayOfWeek(d);
	const weeksLeft = Math.round((electionWeekStart.getTime() - weekStart.getTime()) / WEEK_MS);
	const position = Math.min(COUNTDOWN_TOTAL_WEEKS, Math.max(1, COUNTDOWN_TOTAL_WEEKS - weeksLeft + 1));
	return `${position}/${COUNTDOWN_TOTAL_WEEKS}`;
}

import type { AppConfig, GroupConfig, WindowName } from './config.js';
import { WINDOW_NAMES } from './config.js';
import type { State } from './state.js';

// Planificador: ciclos cada 10-15 min dentro de la franja activa, máximo
// 1 publicación por grupo por franja (3/día), gap mínimo entre posts al
// mismo grupo. Todos los cálculos horarios usan la hora local del timezone
// configurado (America/Lima), independiente de la hora del servidor.

export interface WallParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

export function wallParts(date: Date, timezone: string): WallParts {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(date);
	const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function dateKey(date: Date, timezone: string): string {
	const p = wallParts(date, timezone);
	return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Offset UTC del timezone en un instante dado (maneja DST sin depender de la
// hora local del servidor).
function offsetMs(timezone: string, isoNoTz: string): number {
	const asUtc = Date.parse(`${isoNoTz}Z`);
	const p = wallParts(new Date(asUtc), timezone);
	const wallAsUtc = Date.parse(
		`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00Z`
	);
	return wallAsUtc - asUtc;
}

// Instante en que hoy (según la hora local) se alcanza HH:MM.
function wallTimeToday(timezone: string, now: Date, hhmm: string): Date {
	const p = wallParts(now, timezone);
	const iso = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${hhmm}:00`;
	return new Date(Date.parse(`${iso}Z`) - offsetMs(timezone, iso));
}

export interface ActiveWindow {
	name: WindowName;
	start: Date;
	end: Date;
}

export function activeWindow(config: AppConfig, now: Date): ActiveWindow | null {
	for (const name of WINDOW_NAMES) {
		const w = config.windows[name];
		const start = wallTimeToday(config.timezone, now, w.start);
		const end = wallTimeToday(config.timezone, now, w.end);
		if (now >= start && now < end) return { name, start, end };
	}
	return null;
}

// Inicio de la próxima franja (de hoy si queda alguna; si no, la primera de mañana).
export function nextWindowStart(config: AppConfig, now: Date): Date {
	const candidates: Date[] = [];
	for (const name of WINDOW_NAMES) {
		candidates.push(wallTimeToday(config.timezone, now, config.windows[name].start));
	}
	const future = candidates.filter((c) => c > now);
	if (future.length > 0) return future.sort((a, b) => a.getTime() - b.getTime())[0]!;
	const tomorrow = new Date(now.getTime() + 24 * 3600_000);
	return wallTimeToday(config.timezone, tomorrow, config.windows.morning.start);
}

export function randInt(min: number, max: number): number {
	return min + Math.floor(Math.random() * (max - min + 1));
}

export function cycleDelayMs(config: AppConfig): number {
	return randInt(config.cycleIntervalMinMinutes, config.cycleIntervalMaxMinutes) * 60_000;
}

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j]!, copy[i]!];
	}
	return copy;
}

// Grupos que pueden recibir publicación en la franja actual:
// - no están descartados hoy (p. ej. sin compositor de texto simple)
// - no publicaron todavía en esta franja (máx. 1 por franja => 3/día)
// - respetan el gap mínimo desde su último post
export function eligibleGroups(config: AppConfig, state: State, windowName: WindowName, now: Date): GroupConfig[] {
	const gapMs = config.minGapBetweenPostsHours * 3_600_000;
	return config.groups.filter((group) => {
		if (state.skippedToday.includes(group.id)) return false;
		if (state.postsByWindow[group.id]?.[windowName]) return false;
		const last = state.lastPostedAt[group.id];
		if (last && now.getTime() - Date.parse(last) < gapMs) return false;
		return true;
	});
}

// Selección de 1-2 grupos por ciclo. Nunca dos publicaciones consecutivas al
// mismo grupo: si hay alternativas, se excluye el último grupo publicado.
export function pickGroupsForCycle(
	config: AppConfig,
	state: State,
	windowName: WindowName,
	now: Date
): GroupConfig[] {
	let pool = shuffle(eligibleGroups(config, state, windowName, now));
	if (pool.length > 1 && state.lastGroupId) {
		pool = pool.filter((g) => g.id !== state.lastGroupId);
	}
	const count = Math.min(pool.length, randInt(1, 2));
	return pool.slice(0, count);
}

// Registra una publicación exitosa en el estado (el caller lo persiste).
export function recordPost(state: State, groupId: string, windowName: WindowName, templateIndex: number, now: Date): void {
	const iso = now.toISOString();
	const perWindow = state.postsByWindow[groupId] ?? {};
	perWindow[windowName] = iso;
	state.postsByWindow[groupId] = perWindow;
	state.lastPostedAt[groupId] = iso;
	state.todayGlobalPosts += 1;
	state.lastGroupId = groupId;
	const recent = state.recentTemplates[groupId] ?? [];
	recent.push(templateIndex);
	state.recentTemplates[groupId] = recent.slice(-5);
}

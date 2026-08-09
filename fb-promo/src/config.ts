import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga y valida la configuración de config/groups.json, config/templates.json
// y config/deploy.json.

const configDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'config');

export type WindowName = 'morning' | 'afternoon' | 'evening';
export const WINDOW_NAMES: WindowName[] = ['morning', 'afternoon', 'evening'];
export const WINDOW_LABELS: Record<WindowName, string> = {
	morning: 'mañana',
	afternoon: 'tarde',
	evening: 'noche'
};

export interface TimeWindow {
	start: string; // "HH:MM" en hora local (timezone de la config)
	end: string;
}

export interface LinkEntry {
	url: string;
	// distrito que se usa en el copy cuando se elige este enlace
	// (p. ej. el enlace regional usa "Apurímac"); si falta, usa el del grupo
	district?: string;
}

export interface GroupConfig {
	id: string;
	name: string;
	url: string;
	district: string;
	links: LinkEntry[];
}

// En el JSON los enlaces pueden ser strings simples o objetos { url, district }
interface RawGroup {
	id: string;
	name: string;
	url: string;
	district: string;
	links: (string | LinkEntry)[];
	// false => no se usa (p. ej. grupos de compraventa con flujo "Vender algo")
	enabled?: boolean;
}

export interface AppConfig {
	timezone: string;
	windows: Record<WindowName, TimeWindow>;
	maxPerDayPerGroup: number;
	maxPerDayGlobal: number;
	cycleIntervalMinMinutes: number;
	cycleIntervalMaxMinutes: number;
	minGapBetweenPostsHours: number;
	groups: GroupConfig[];
}

function readJson<T>(file: string): T {
	const path = join(configDir, file);
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch (err) {
		throw new Error(`No se pudo leer ${path}: ${(err as Error).message}`);
	}
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function assertTime(value: string, label: string): void {
	if (!TIME_RE.test(value)) {
		throw new Error(`${label} debe tener formato HH:MM, recibido: "${value}"`);
	}
}

export function loadConfig(): AppConfig {
	const raw = readJson<Partial<AppConfig>>('groups.json');

	if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
		throw new Error('config/groups.json debe definir al menos un grupo en "groups"');
	}

	const windows = raw.windows ?? {
		morning: { start: '07:00', end: '10:30' },
		afternoon: { start: '12:00', end: '16:00' },
		evening: { start: '18:00', end: '22:00' }
	};

	const config: AppConfig = {
		timezone: raw.timezone ?? 'America/Lima',
		windows: {
			morning: windows.morning ?? { start: '07:00', end: '10:30' },
			afternoon: windows.afternoon ?? { start: '12:00', end: '16:00' },
			evening: windows.evening ?? { start: '18:00', end: '22:00' }
		},
		maxPerDayPerGroup: Math.min(raw.maxPerDayPerGroup ?? 3, 3),
		maxPerDayGlobal: raw.maxPerDayGlobal ?? 30,
		cycleIntervalMinMinutes: raw.cycleIntervalMinMinutes ?? 10,
		cycleIntervalMaxMinutes: raw.cycleIntervalMaxMinutes ?? 15,
		minGapBetweenPostsHours: raw.minGapBetweenPostsHours ?? 4,
		groups: (raw.groups as RawGroup[])
			.filter((group) => group.enabled !== false)
			.map((group) => ({
				...group,
				links: group.links.map((link) => (typeof link === 'string' ? { url: link } : link))
			}))
	};

	for (const name of WINDOW_NAMES) {
		const w = config.windows[name];
		assertTime(w.start, `windows.${name}.start`);
		assertTime(w.end, `windows.${name}.end`);
	}

	const ids = new Set<string>();
	for (const group of config.groups) {
		if (!group.id || !group.url || !group.district) {
			throw new Error(`Grupo inválido (faltan id/url/district): ${JSON.stringify(group)}`);
		}
		if (!/^https:\/\/(www\.|m\.|web\.)?facebook\.com\/groups\//.test(group.url)) {
			throw new Error(`La URL del grupo "${group.id}" no apunta a un grupo de Facebook: ${group.url}`);
		}
		if (!Array.isArray(group.links) || group.links.length === 0) {
			throw new Error(`El grupo "${group.id}" debe tener al menos un enlace en "links"`);
		}
		for (const link of group.links) {
			const url = typeof link === 'string' ? link : link.url;
			if (!url || !url.startsWith('https://')) {
				throw new Error(`Enlace inválido en el grupo "${group.id}": ${url}`);
			}
		}
		if (ids.has(group.id)) {
			throw new Error(`Id de grupo duplicado: "${group.id}"`);
		}
		ids.add(group.id);
	}

	return config;
}

export function loadTemplates(): string[] {
	const raw = readJson<{ templates?: string[] }>('templates.json');
	if (!Array.isArray(raw.templates) || raw.templates.length < 3) {
		throw new Error('config/templates.json debe definir al menos 3 plantillas');
	}
	return raw.templates;
}

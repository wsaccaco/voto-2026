import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './log.js';

// Estado persistente del planificador en .data/state.json. Sobrevive
// reinicios del daemon y se reinicia por día (contadores y franjas).

const stateFile = join(dataDir, 'state.json');

export interface State {
	// dateKey local (America/Lima) de los contadores diarios
	date: string;
	// publicaciones globales del día
	todayGlobalPosts: number;
	// groupId -> { window -> timestamp ISO del post en esa franja }
	postsByWindow: Record<string, Partial<Record<string, string>>>;
	// groupId -> timestamp ISO del último post (para el gap mínimo)
	lastPostedAt: Record<string, string>;
	// groupId -> índices de las últimas plantillas usadas (rotación de copys)
	recentTemplates: Record<string, number[]>;
	// último grupo publicado (evitar consecutivos dentro de un ciclo)
	lastGroupId?: string;
}

export function emptyState(date: string): State {
	return {
		date,
		todayGlobalPosts: 0,
		postsByWindow: {},
		lastPostedAt: {},
		recentTemplates: {}
	};
}

export function loadState(): State | null {
	if (!existsSync(stateFile)) return null;
	try {
		const state = JSON.parse(readFileSync(stateFile, 'utf8')) as State;
		if (!state.date || typeof state.todayGlobalPosts !== 'number') return null;
		return state;
	} catch {
		return null;
	}
}

export function saveState(state: State): void {
	mkdirSync(dataDir, { recursive: true });
	const tmp = `${stateFile}.tmp`;
	writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
	// rename atómico para no corromper el estado ante un crash a mitad de escritura
	renameSync(tmp, stateFile);
}

// Si cambió el día local, reinicia contadores diarios (franjas y global).
export function rolloverIfNeeded(state: State, dateKey: string): State {
	if (state.date === dateKey) return state;
	return {
		...emptyState(dateKey),
		// el historial de plantillas se conserva entre días para seguir rotando
		recentTemplates: state.recentTemplates
	};
}

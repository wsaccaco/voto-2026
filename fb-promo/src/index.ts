import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import type { AppConfig, WindowName } from './config.js';
import { WINDOW_LABELS, WINDOW_NAMES, loadConfig, loadTemplates } from './config.js';
import { generatePost } from './content.js';
import { alert, log } from './log.js';
import {
	BlockedError,
	FacebookPoster,
	NoComposerError,
	PostFailedError,
	SessionExpiredError,
	humanDelay,
	loginInteractive,
	sleep,
	storageStateFile
} from './poster.js';
import { activeWindow, cycleDelayMs, dateKey, nextWindowStart, pickGroupsForCycle, recordPost, wallParts } from './scheduler.js';
import { emptyState, loadState, rolloverIfNeeded, saveState, type State } from './state.js';

// CLI del publicador:
//   login           login interactivo local (máquina con GUI), exporta storageState
//   dry-run         simula el planificador sin abrir navegador ni publicar
//   once            publica 1 ciclo y termina (pruebas)
//   run             daemon 24/7 headless
// La sesión viaja al servidor vía git (.data/session/storage-state.json).
// Flags: --max-per-day N (publicaciones/día por grupo, máx. 3)

function refreshState(config: AppConfig): State {
	const key = dateKey(new Date(), config.timezone);
	let state = loadState() ?? emptyState(key);
	state = rolloverIfNeeded(state, key);
	return state;
}

function localNowLabel(config: AppConfig): string {
	const now = new Date();
	const p = wallParts(now, config.timezone);
	return `${dateKey(now, config.timezone)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

// Publica en los grupos elegibles del ciclo actual. Lanza SessionExpiredError
// o BlockedError si la sesión murió o Facebook mostró un control.
async function runCycle(
	config: AppConfig,
	templates: string[],
	state: State,
	windowName: WindowName,
	poster: FacebookPoster
): Promise<number> {
	const now = new Date();
	const picked = pickGroupsForCycle(config, state, windowName, now);
	// Los grupos sin compositor de texto simple se omiten permanentemente (no
	// se navega a ellos): no bloquean el resto del ciclo.
	const omitted = picked.filter((g) => state.unsupportedGroups.includes(g.id));
	const groups = picked.filter((g) => !state.unsupportedGroups.includes(g.id));
	if (omitted.length > 0) {
		log.info(`[${WINDOW_LABELS[windowName]}] ${omitted.length} grupo(s) sin compositor omitido(s): ${omitted.map((g) => g.name).join(', ')}`);
	}
	if (groups.length === 0) {
		log.info(`[${WINDOW_LABELS[windowName]}] Sin grupos elegibles en este ciclo.`);
		return 0;
	}

	let posted = 0;
	for (const group of groups) {
		if (state.todayGlobalPosts >= config.maxPerDayGlobal) {
			log.warn('Tope global diario alcanzado; no se publica más hoy.');
			break;
		}
		const { text, templateIndex } = generatePost(group, templates, state.recentTemplates[group.id] ?? []);
		log.info(`[${WINDOW_LABELS[windowName]}] Publicando en "${group.name}": ${text}`);
		try {
			await poster.postToGroup(group, text);
		} catch (err) {
			if (err instanceof PostFailedError) {
				const permanent = err instanceof NoComposerError;
				log.warn(`Fallo al publicar en "${group.name}": ${err.message} (se omite este grupo${permanent ? ' permanentemente' : ', se reintentará mañana'})`);
				skipGroupForToday(state, group.id);
				if (permanent) markUnsupported(state, group.id);
				continue;
			}
			throw err;
		}
		recordPost(state, group.id, windowName, templateIndex, new Date());
		saveState(state);
		posted += 1;
		if (posted < groups.length) await humanDelay();
	}
	return posted;
}

// Marca un grupo como descartado por hoy (p. ej. publicación no confirmada):
// no se reintenta en los próximos ciclos.
function skipGroupForToday(state: State, groupId: string): void {
	if (!state.skippedToday.includes(groupId)) {
		state.skippedToday.push(groupId);
		saveState(state);
		log.warn(`El grupo ${groupId} se omitirá por el resto del día.`);
	}
}

// Marca un grupo sin compositor de texto simple (compraventa, etc.): se omite
// permanentemente (persiste entre días) hasta que se revalide publicando con
// "npm run once -- --group ID", que lo desmarca automáticamente.
function markUnsupported(state: State, groupId: string): void {
	if (!state.unsupportedGroups.includes(groupId)) {
		state.unsupportedGroups.push(groupId);
		saveState(state);
		log.warn(`El grupo ${groupId} se omitirá de forma permanente por no tener compositor de texto simple.`);
	}
}

// Pausa tras un error fatal antes de terminar el proceso: sin ella, un
// contenedor con restart automático (Coolify/Docker) entra en crash-loop de
// reinicios en ráfaga que golpean a Facebook y empeoran la detección.
const FATAL_BACKOFF_MS = 10 * 60_000;

async function handleFatal(err: unknown, poster: FacebookPoster): Promise<never> {
	if (err instanceof SessionExpiredError) {
		alert(`Sesión expirada: ${err.message} Revisa .data/logs/session-fail-*.png para ver qué mostró Facebook. Flujo de recuperación: "npm run login" en una máquina con GUI, sube .data/session/storage-state.json por git (commit/push) y reinicia el daemon.`);
	} else if (err instanceof BlockedError) {
		alert(`Facebook mostró un control/checkpoint: ${err.message} Revisa la cuenta manualmente y reduce el ritmo antes de reiniciar.`);
	} else {
		log.error(`Error inesperado: ${(err as Error).stack ?? String(err)}`);
	}
	await poster.close();
	log.info(`Esperando ${FATAL_BACKOFF_MS / 60_000} min antes de salir (backoff anti-crash-loop); el próximo arranque reintentará la sesión.`);
	await sleep(FATAL_BACKOFF_MS);
	process.exit(1);
}

async function commandOnce(
	config: AppConfig,
	templates: string[],
	windowArg?: string,
	options: { debug?: boolean; groupId?: string } = {}
): Promise<void> {
	const state = refreshState(config);
	const now = new Date();
	let windowName: WindowName | undefined = activeWindow(config, now)?.name;
	if (windowArg) {
		if (!WINDOW_NAMES.includes(windowArg as WindowName)) {
			throw new Error(`--window debe ser uno de: ${WINDOW_NAMES.join(', ')}`);
		}
		windowName = windowArg as WindowName;
	}
	if (!windowName) {
		log.warn(`Fuera de franja (${localNowLabel(config)}). Usa "--window morning|afternoon|evening" para forzar la prueba, o "npm run dry-run" para ver el plan.`);
		process.exit(2);
	}

	let groups;
	if (options.groupId) {
		const group = config.groups.find((g) => g.id === options.groupId || g.url.includes(options.groupId!));
		if (!group) throw new Error(`No se encontró el grupo "${options.groupId}" en config/groups.json`);
		// Un grupo forzado se intenta aunque esté en omisión permanente: sirve
		// para revalidar (si publica, se desmarca solo).
		groups = [group];
	} else {
		const picked = pickGroupsForCycle(config, state, windowName, now);
		const omitted = picked.filter((g) => state.unsupportedGroups.includes(g.id));
		groups = picked.filter((g) => !state.unsupportedGroups.includes(g.id));
		if (omitted.length > 0) {
			log.info(`${omitted.length} grupo(s) sin compositor omitido(s): ${omitted.map((g) => g.name).join(', ')}`);
		}
	}
	if (groups.length === 0) {
		log.warn('Sin grupos elegibles en esta franja (todos ya publicaron hoy o están en cooldown).');
		process.exit(2);
	}

	const poster = new FacebookPoster({
		headless: !options.debug,
		slowMoMs: options.debug ? 200 : 0,
		debug: options.debug
	});
	try {
		await poster.start();
		await poster.verifySession();
		for (const group of groups) {
			const { text, templateIndex } = generatePost(group, templates, state.recentTemplates[group.id] ?? []);
			log.info(`[${WINDOW_LABELS[windowName]}] Publicando en "${group.name}": ${text}`);
			try {
				await poster.postToGroup(group, text);
			} catch (err) {
				if (err instanceof PostFailedError) {
					const permanent = err instanceof NoComposerError;
					log.warn(`Fallo al publicar en "${group.name}": ${err.message}`);
					skipGroupForToday(state, group.id);
					if (permanent) markUnsupported(state, group.id);
					continue;
				}
				throw err;
			}
			recordPost(state, group.id, windowName, templateIndex, new Date());
			saveState(state);
			// Publicación exitosa revalida un grupo antes marcado sin compositor.
			if (state.unsupportedGroups.includes(group.id)) {
				state.unsupportedGroups = state.unsupportedGroups.filter((id) => id !== group.id);
				saveState(state);
				log.info(`El grupo ${group.id} se revalidó: se quitó de la omisión permanente.`);
			}
		}
		if (options.debug) {
			// Mantiene el navegador visible para inspeccionar el resultado.
			await waitForEnter('Modo debug: revisa el navegador. Presiona ENTER para cerrar...');
		}
		log.info('Ciclo terminado.');
	} catch (err) {
		await handleFatal(err, poster);
	} finally {
		await poster.close();
	}
}

function waitForEnter(prompt: string): Promise<void> {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		rl.question(prompt, () => {
			rl.close();
			resolve();
		});
	});
}

async function commandRun(config: AppConfig, templates: string[]): Promise<void> {
	log.info(`Daemon iniciado (${localNowLabel(config)} hora ${config.timezone}). Grupos: ${config.groups.length}.`);
	let state = refreshState(config);
	saveState(state);

	const poster = new FacebookPoster();
	try {
		await poster.start();
		await poster.verifySession();
	} catch (err) {
		await handleFatal(err, poster);
	}

	const shutdown = async (): Promise<void> => {
		log.info('Deteniendo daemon...');
		await poster.close();
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	for (;;) {
		state = refreshState(config);
		const now = new Date();
		const window = activeWindow(config, now);
		if (!window) {
			const next = nextWindowStart(config, now);
			log.info(`Fuera de franja (${localNowLabel(config)}). Durmiendo hasta la próxima franja: ${next.toISOString()}`);
			await sleep(Math.max(60_000, next.getTime() - now.getTime()));
			continue;
		}
		try {
			await runCycle(config, templates, state, window.name, poster);
		} catch (err) {
			await handleFatal(err, poster);
		}
		const delay = Math.min(cycleDelayMs(config), window.end.getTime() - Date.now());
		if (delay > 0) {
			log.info(`Próximo ciclo en ${Math.round(delay / 60_000)} min.`);
			await sleep(delay);
		}
	}
}

// Simulación sin navegador: muestra qué publicaría y cuándo durante varios ciclos.
function commandDryRun(config: AppConfig, templates: string[]): void {
	const state = refreshState(config);
	let now = new Date();
	log.info(`Simulación desde ${localNowLabel(config)} (hora ${config.timezone}). No se publica nada.`);

	for (let cycle = 0; cycle < 8; cycle++) {
		let window = activeWindow(config, now);
		if (!window) {
			now = nextWindowStart(config, now);
			window = activeWindow(config, now);
		}
		if (!window) break;

		const groups = pickGroupsForCycle(config, state, window.name, now);
		if (groups.length === 0) {
			log.info(`[ciclo ${cycle + 1} · ${WINDOW_LABELS[window.name]}] sin grupos elegibles; avanzando al fin de la franja.`);
			now = window.end;
			continue;
		}
		for (const group of groups) {
			const { text, templateIndex } = generatePost(group, templates, state.recentTemplates[group.id] ?? []);
			log.info(`[ciclo ${cycle + 1} · ${WINDOW_LABELS[window.name]} · ${now.toISOString()}] "${group.name}" <- ${text}`);
			recordPost(state, group.id, window.name, templateIndex, now);
		}
		now = new Date(now.getTime() + cycleDelayMs(config));
	}
	log.info('Fin de la simulación.');
}

function printUsage(): void {
	console.log(`Uso: npm run <comando>
  login            Login interactivo local (requiere GUI); exporta la sesión
  dry-run          Simula el planificador sin publicar
  once             Publica 1 ciclo y termina (dentro de una franja activa)
  start            Daemon 24/7 headless
Flags: --max-per-day N  publicaciones/día por grupo (1-3, default 3)
       --window W       solo "once": fuerza la franja (morning|afternoon|evening)
       --group ID       solo "once": publica solo en ese grupo (id o texto de la URL)
       --debug          solo "once": navegador visible, lento y con capturas por paso`);
}

async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			'max-per-day': { type: 'string' },
			window: { type: 'string' },
			group: { type: 'string' },
			debug: { type: 'boolean' }
		}
	});
	const command = positionals[0];
	const validCommands = ['login', 'dry-run', 'once', 'run'];
	if (!command || !validCommands.includes(command)) {
		printUsage();
		process.exit(command ? 1 : 0);
	}

	if (command === 'login') {
		await loginInteractive();
		return;
	}

	const config = loadConfig();
	if (values['max-per-day']) {
		const n = Number(values['max-per-day']);
		if (!Number.isInteger(n) || n < 1 || n > 3) throw new Error('--max-per-day debe ser un entero entre 1 y 3');
		config.maxPerDayPerGroup = n;
	}
	const templates = loadTemplates();

	if (command === 'dry-run') commandDryRun(config, templates);
	else if (command === 'once') await commandOnce(config, templates, values.window, { debug: values.debug, groupId: values.group });
	else await commandRun(config, templates);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});

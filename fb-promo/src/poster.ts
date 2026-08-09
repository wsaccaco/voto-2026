import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import type { GroupConfig } from './config.js';
import { dataDir, log } from './log.js';

// Interacción con Facebook vía Playwright. El login inicial es manual y
// exporta un storageState que luego usa el daemon headless. Ante checkpoint,
// bloqueo o sesión vencida se lanzan errores tipados: el daemon debe pausar
// y pedir intervención humana (nunca se intenta evadir controles).

export const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const sessionDir = join(dataDir, 'session');
export const storageStateFile = join(sessionDir, 'storage-state.json');
const loginProfileDir = join(sessionDir, 'profile');

export class SessionExpiredError extends Error {}
export class BlockedError extends Error {}
export class PostFailedError extends Error {}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pausa "humana" entre acciones de página.
export function humanDelay(minMs = 3_000, maxMs = 10_000): Promise<void> {
	return sleep(minMs + Math.random() * (maxMs - minMs));
}

// Selectores del compositor de publicación de Facebook. Facebook cambia su
// DOM con frecuencia: mantenerlos centralizados aquí para facilitar ajustes.
// El primero cubre el diálogo que se abre tras clicar el placeholder (en
// algunos grupos abre un formulario tipo "vender algo" con textbox propio).
const COMPOSER_SELECTORS = [
	'div[role="dialog"] div[role="textbox"]',
	'div[role="group"] div[role="textbox"]',
	'div[role="textbox"][contenteditable="true"]',
	'[aria-label="Escribe algo"][contenteditable="true"]',
	'[aria-label^="Escribe algo"]',
	'[aria-label="Write something"][contenteditable="true"]',
	'[aria-label^="Write something"]'
];

const SUBMIT_SELECTORS = [
	'div[role="dialog"] [aria-label="Publicar"]',
	'div[role="dialog"] [aria-label="Post"]',
	'div[role="button"][aria-label="Publicar"]',
	'div[role="button"][aria-label="Post"]',
	'[aria-label="Publicar"][role="button"]',
	'[aria-label="Post"][role="button"]'
];

// Disparadores del compositor en grupos que no muestran caja de texto
// directa (p. ej. el placeholder "Escribe algo...").
// Nota: los grupos cuyo disparador es "Vender algo" (compraventa) se
// descartan: su formulario exige campos adicionales y no se automatizan.
const COMPOSER_TRIGGER_SELECTORS = [
	'div[role="button"][aria-label="Escribe algo"]',
	'div[role="button"]:has-text("Escribe algo")',
	'div[role="button"][aria-label="Write something"]',
	'div[role="button"]:has-text("¿Qué quieres publicar")'
];

const BLOCK_URL_PATTERNS = [/\/checkpoint/i, /\/challenge/i, /login\/approve/i, /\/restrict/i];

const BLOCK_TEXT_KEYWORDS = [
	'verificar tu identidad',
	'confirma tu identidad',
	'tu cuenta ha sido',
	'cuenta restringida',
	'temporalmente bloqueado',
	'actividad inusual',
	'confirmar que no eres un robot',
	'verify your identity',
	'your account has been',
	'unusual activity',
	'temporarily blocked'
];

// Avisos de Facebook cuando el grupo requiere aprobación de administradores
const PENDING_APPROVAL_KEYWORDS = [
	'pendiente de aprobación',
	'pendiente de aprobacion',
	'se envió tu publicación',
	'tu publicación se envió',
	'enviada para aprobación',
	'post submitted',
	'submitted for approval',
	'will be visible after approval'
];

async function looksLoggedIn(page: Page): Promise<boolean> {
	const url = page.url();
	if (!url.includes('facebook.com')) return false;
	if (/\/login|\/checkpoint|\/challenge/.test(url)) return false;
	const emailInputs = await page.locator('input[name="email"]').count().catch(() => 1);
	return emailInputs === 0;
}

async function detectBlock(page: Page): Promise<void> {
	const url = page.url();
	if (BLOCK_URL_PATTERNS.some((re) => re.test(url))) {
		throw new BlockedError(`Facebook mostró una página de control: ${url}`);
	}
	const bodyText = await page
		.locator('body')
		.innerText()
		.catch(() => '');
	const lower = bodyText.slice(0, 6_000).toLowerCase();
	const hit = BLOCK_TEXT_KEYWORDS.find((kw) => lower.includes(kw));
	if (hit) {
		throw new BlockedError(`Facebook mostró un aviso de control/bloqueo ("${hit}")`);
	}
}

// Login interactivo: se corre UNA vez en una máquina con GUI. Abre Chromium
// visible, el usuario inicia sesión manualmente (password + 2FA) y al
// detectar sesión activa exporta el storageState para el daemon headless.
export async function loginInteractive(timeoutMs = 15 * 60_000): Promise<void> {
	mkdirSync(loginProfileDir, { recursive: true });
	const context = await chromium.launchPersistentContext(loginProfileDir, {
		headless: false,
		userAgent: USER_AGENT,
		locale: 'es-PE',
		timezoneId: 'America/Lima',
		viewport: { width: 1280, height: 900 }
	});
	try {
		const page = context.pages()[0] ?? (await context.newPage());
		await page.goto('https://www.facebook.com/');
		log.info('Inicia sesión manualmente en la ventana del navegador (password + 2FA si aplica)...');

		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			await sleep(3_000);
			const current = context.pages().at(-1);
			if (current && (await looksLoggedIn(current).catch(() => false))) {
				await sleep(5_000); // deja que FB termine de cargar tras el login
				await context.storageState({ path: storageStateFile });
				log.info(`Sesión exportada a ${storageStateFile}`);
				log.info('Ahora puedes copiarla al servidor con: npm run deploy-session');
				return;
			}
		}
		throw new Error('Tiempo de espera agotado: no se detectó el inicio de sesión.');
	} finally {
		await context.close();
	}
}

export interface PosterOptions {
	headless?: boolean;
	// ralentiza las acciones para poder seguir el flujo a simple vista
	slowMoMs?: number;
	// guarda capturas de cada paso en .data/logs/debug-*.png
	debug?: boolean;
}

export class FacebookPoster {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;

	constructor(private readonly opts: PosterOptions = {}) {}

	private get debug(): boolean {
		return this.opts.debug ?? false;
	}

	async start(): Promise<void> {
		if (!existsSync(storageStateFile)) {
			throw new SessionExpiredError(
				`No existe ${storageStateFile}. Ejecuta "npm run login" en una máquina con GUI y luego "npm run deploy-session".`
			);
		}
		this.browser = await chromium.launch({ headless: this.opts.headless ?? true, slowMo: this.opts.slowMoMs ?? 0 });
		this.context = await this.browser.newContext({
			storageState: storageStateFile,
			userAgent: USER_AGENT,
			locale: 'es-PE',
			timezoneId: 'America/Lima',
			viewport: { width: 1366, height: 900 }
		});
		this.context.setDefaultTimeout(30_000);
	}

	async close(): Promise<void> {
		await this.browser?.close().catch(() => {});
		this.browser = null;
		this.context = null;
	}

	private async page(): Promise<Page> {
		if (!this.context) throw new Error('Poster no inicializado: llama a start() primero');
		return this.context.newPage();
	}

	// Verifica que la sesión siga viva. Lanza SessionExpiredError / BlockedError.
	// Facebook a veces muestra la página de login de forma transitoria (primer
	// acceso desde una IP nueva o checks ligeros): se reintenta 3 veces con
	// esperas crecientes antes de declarar la sesión expirada. Los checkpoints
	// (BlockedError) no se reintentan: requieren revisión manual de la cuenta.
	async verifySession(): Promise<void> {
		const attempts = 3;
		let lastErr: Error | null = null;
		for (let attempt = 1; attempt <= attempts; attempt++) {
			const page = await this.page();
			try {
				await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
				await sleep(4_000);
				await detectBlock(page);
				if (await looksLoggedIn(page)) {
					log.info('Sesión verificada: cuenta autenticada.');
					return;
				}
				lastErr = new SessionExpiredError('Facebook pide iniciar sesión de nuevo: el storageState expiró.');
			} catch (err) {
				if (err instanceof BlockedError) throw err;
				lastErr = err as Error;
			} finally {
				await page.close().catch(() => {});
			}
			if (attempt < attempts) {
				const waitMs = 60_000 + attempt * 30_000; // 90 s, luego 120 s
				log.warn(`Verificación de sesión fallida (intento ${attempt}/${attempts}). Reintentando en ${Math.round(waitMs / 1_000)} s...`);
				await sleep(waitMs);
			}
		}
		throw lastErr ?? new SessionExpiredError('No se pudo verificar la sesión.');
	}

	async postToGroup(group: GroupConfig, text: string): Promise<void> {
		const page = await this.page();
		try {
			log.info(`Navegando al grupo "${group.name}" (${group.url})`);
			await page.goto(group.url, { waitUntil: 'domcontentloaded' });
			await humanDelay();
			await detectBlock(page);
			if (!(await looksLoggedIn(page))) {
				throw new SessionExpiredError('La sesión expiró mientras se navegaba al grupo.');
			}
			await this.debugShot(page, `1-grupo-${group.id}`);

			const composer = await this.openComposer(page);
			await this.debugShot(page, `2-compositor-${group.id}`);
			await composer.click();
			await humanDelay(800, 2_000);
			await this.typeHuman(page, text);
			await humanDelay(1_000, 2_500);
			await this.debugShot(page, `3-texto-${group.id}`);
			await this.submit(page, composer);
			await this.confirmPosted(page, composer);
			await detectBlock(page);
			await this.checkPendingApproval(page, group);
			await this.debugShot(page, `4-final-${group.id}`);
			log.info(`Publicado en "${group.name}"`);
		} finally {
			await page.close().catch(() => {});
		}
	}

	// En modo debug guarda una captura por paso para revisar qué vio el bot.
	private async debugShot(page: Page, name: string): Promise<void> {
		if (!this.debug) return;
		const path = join(dataDir, 'logs', `debug-${name}.png`);
		await page.screenshot({ path }).catch(() => {});
		log.info(`[debug] captura: ${path}`);
	}

	private async findTextbox(page: Page, timeoutMs = 2_000): Promise<Locator | null> {
		for (const selector of COMPOSER_SELECTORS) {
			const boxes = page.locator(selector);
			const count = await boxes.count().catch(() => 0);
			for (let i = 0; i < count; i++) {
				const box = boxes.nth(i);
				if (!(await box.isVisible({ timeout: timeoutMs }).catch(() => false))) continue;
				// Excluye cajas de comentarios: viven dentro de un [role="article"]
				// (una publicación del feed) o se anuncian como comentario.
				const aria = (await box.getAttribute('aria-label').catch(() => null)) ?? '';
				if (/comentario|comment/i.test(aria)) continue;
				const insideArticle = await box
					.evaluate((el) => Boolean(el.closest('[role="article"]')))
					.catch(() => true);
				if (insideArticle) continue;
				return box;
			}
		}
		return null;
	}

	// Abre el compositor del grupo. Cubre dos escenarios:
	// 1. caja de texto visible directamente (inline o en diálogo ya abierto)
	// 2. placeholder ("Escribe algo...") que abre el diálogo de publicación.
	// Los grupos de compraventa (botón "Vender algo") no se automatizan:
	// si no hay caja de texto simple, se falla y el grupo se omite.
	private async openComposer(page: Page): Promise<Locator> {
		for (let attempt = 0; attempt < 2; attempt++) {
			const direct = await this.findTextbox(page);
			if (direct) return direct;

			// Clic en el disparador del compositor, si existe.
			for (const selector of COMPOSER_TRIGGER_SELECTORS) {
				const trigger = page.locator(selector).first();
				if (await trigger.isVisible({ timeout: 1_500 }).catch(() => false)) {
					await trigger.click();
					await humanDelay(1_000, 2_500);
					break;
				}
			}

			const afterTrigger = await this.findTextbox(page);
			if (afterTrigger) return afterTrigger;

			// Cierra cualquier diálogo que no sirva y reintenta.
			await page.keyboard.press('Escape').catch(() => {});
			await page.mouse.wheel(0, 200).catch(() => {});
			await sleep(2_500);
		}
		// Captura para poder diagnosticar el DOM del grupo y ajustar selectores.
		const shot = join(dataDir, 'logs', `composer-fail-${Date.now()}.png`);
		await page.screenshot({ path: shot }).catch(() => {});
		throw new PostFailedError(`No se encontró un compositor de texto simple en el grupo (captura: ${shot}).`);
	}

	private async typeHuman(page: Page, text: string): Promise<void> {
		for (const char of text) {
			await page.keyboard.insertText(char);
			await sleep(30 + Math.random() * 50);
		}
	}

	private async submit(page: Page, composer: Locator): Promise<void> {
		await page.keyboard.press('Control+Enter');
		await sleep(3_000);
		// Si Ctrl+Enter no envió, busca el botón Publicar visible.
		if (await this.composerStillHasText(composer)) {
			for (const selector of SUBMIT_SELECTORS) {
				const button = page.locator(selector).first();
				if (await button.isVisible({ timeout: 1_500 }).catch(() => false)) {
					await button.click();
					return;
				}
			}
		}
	}

	private async composerStillHasText(composer: Locator): Promise<boolean> {
		const text = await composer.innerText().catch(() => '');
		return text.trim().length > 0;
	}

	private async confirmPosted(page: Page, composer: Locator): Promise<void> {
		const deadline = Date.now() + 20_000;
		while (Date.now() < deadline) {
			if (!(await this.composerStillHasText(composer))) return;
			await sleep(2_000);
		}
		throw new PostFailedError('No se pudo confirmar la publicación: el texto sigue en el compositor.');
	}

	// Detecta el aviso de "publicación pendiente de aprobación" para que quede
	// claro en los logs por qué el post no se ve en el feed del grupo.
	private async checkPendingApproval(page: Page, group: GroupConfig): Promise<void> {
		const bodyText = await page
			.locator('body')
			.innerText()
			.catch(() => '');
		const lower = bodyText.slice(0, 6_000).toLowerCase();
		const hit = PENDING_APPROVAL_KEYWORDS.find((kw) => lower.includes(kw));
		if (hit) {
			log.warn(`La publicación en "${group.name}" quedó PENDIENTE DE APROBACIÓN de los administradores del grupo.`);
		}
	}
}

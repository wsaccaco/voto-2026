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
const COMPOSER_SELECTORS = [
	'div[role="group"] div[role="textbox"]',
	'div[role="textbox"][contenteditable="true"]',
	'[aria-label="Escribe algo"][contenteditable="true"]',
	'[aria-label^="Escribe algo"]',
	'[aria-label="Write something"][contenteditable="true"]',
	'[aria-label^="Write something"]'
];

const SUBMIT_SELECTORS = [
	'div[role="button"][aria-label="Publicar"]',
	'div[role="button"][aria-label="Post"]',
	'[aria-label="Publicar"][role="button"]',
	'[aria-label="Post"][role="button"]'
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

export class FacebookPoster {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;

	constructor(private readonly headless = true) {}

	async start(): Promise<void> {
		if (!existsSync(storageStateFile)) {
			throw new SessionExpiredError(
				`No existe ${storageStateFile}. Ejecuta "npm run login" en una máquina con GUI y luego "npm run deploy-session".`
			);
		}
		this.browser = await chromium.launch({ headless: this.headless });
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
	async verifySession(): Promise<void> {
		const page = await this.page();
		try {
			await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
			await sleep(4_000);
			await detectBlock(page);
			if (!(await looksLoggedIn(page))) {
				throw new SessionExpiredError('Facebook pide iniciar sesión de nuevo: el storageState expiró.');
			}
			log.info('Sesión verificada: cuenta autenticada.');
		} finally {
			await page.close().catch(() => {});
		}
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

			const composer = await this.findComposer(page);
			await composer.click();
			await humanDelay(800, 2_000);
			await this.typeHuman(page, text);
			await humanDelay(1_000, 2_500);
			await this.submit(page, composer);
			await this.confirmPosted(page, composer);
			await detectBlock(page);
			log.info(`Publicado en "${group.name}"`);
		} finally {
			await page.close().catch(() => {});
		}
	}

	private async findComposer(page: Page): Promise<Locator> {
		for (let attempt = 0; attempt < 2; attempt++) {
			for (const selector of COMPOSER_SELECTORS) {
				const locator = page.locator(selector).first();
				if (await locator.isVisible({ timeout: 2_500 }).catch(() => false)) {
					return locator;
				}
			}
			// El compositor puede cargar tarde: scroll leve y reintento.
			await page.mouse.wheel(0, 200).catch(() => {});
			await sleep(2_500);
		}
		throw new PostFailedError('No se encontró el compositor de publicación en el grupo.');
	}

	private async typeHuman(page: Page, text: string): Promise<void> {
		for (const char of text) {
			await page.keyboard.insertText(char);
			await sleep(60 + Math.random() * 120);
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
}

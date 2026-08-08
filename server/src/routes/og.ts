import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono, type MiddlewareHandler } from 'hono';
import { env } from '../env.js';
import { renderSurveyOgImage } from '../lib/og.js';
import { getSurveyResults } from '../lib/results.js';
import { getSurveyWithCandidates } from '../lib/surveys.js';
import { countdownLabel } from '../lib/weeks.js';

// ---------------------------------------------------------------------------
// Imágenes y meta tags Open Graph dinámicos para /resultados/:id
// ---------------------------------------------------------------------------

export const ogRoutes = new Hono();

// GET /og/resultados/:id.webp — imagen WebP 1200x630 con los resultados actuales
// (acepta también .png para no romper links ya compartidos)
ogRoutes.get('/resultados/:file', async (c) => {
	const match = /^(\d+)\.(?:png|webp)$/.exec(c.req.param('file') ?? '');
	if (!match) return c.json({ error: 'Archivo inválido' }, 400);

	const image = await renderSurveyOgImage(Number(match[1]));
	if (!image) return c.json({ error: 'Encuesta no encontrada' }, 404);

	return new Response(image as unknown as BodyInit, {
		headers: {
			'Content-Type': 'image/webp',
			'Cache-Control': 'public, max-age=60, s-maxage=300'
		}
	});
});

// ---------------------------------------------------------------------------
// HTML dinámico para /resultados/:id: se sirve a todos los clientes (SPA para
// navegadores, meta tags OG para crawlers). Si la encuesta no existe, se deja
// pasar al fallback estático normal.
// ---------------------------------------------------------------------------
let htmlTemplate: string | null = null;

async function getHtmlTemplate(): Promise<string | null> {
	if (htmlTemplate !== null) return htmlTemplate;
	try {
		htmlTemplate = await readFile(join(env.webDist, 'index.html'), 'utf8');
	} catch (err) {
		console.warn('[og] no se pudo leer index.html:', err instanceof Error ? err.message : err);
		htmlTemplate = null;
	}
	return htmlTemplate;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const fmtVotes = new Intl.NumberFormat('es-PE');

export const resultadosHtmlHandler: MiddlewareHandler = async (c, next) => {
	const id = Number(c.req.param('id'));
	if (!Number.isInteger(id)) {
		await next();
		return;
	}

	const template = await getHtmlTemplate();
	if (!template) {
		await next();
		return;
	}

	const [survey, results] = await Promise.all([
		getSurveyWithCandidates(id).catch(() => null),
		getSurveyResults(id).catch(() => null)
	]);
	if (!survey || !results) {
		await next();
		return;
	}

	const leader = results.results[0];
	const description =
		results.totalVotes > 0 && leader
			? `${leader.name} lidera con ${leader.percent}% · ${fmtVotes.format(results.totalVotes)} votos registrados. Entra y mira los resultados completos.`
			: 'Aún no hay votos en esta encuesta. Participa y mira los resultados en vivo.';
	const title = `Resultados · ${survey.electionName} · Semana ${countdownLabel(survey.startDate)} | Andahuaylas Vota`;
	const url = `${env.publicUrl}/resultados/${id}`;
	// ?v= por semana: invalida la caché del crawler (WhatsApp/Facebook) sin perder frescura intra-semana
	const image = `${env.publicUrl}/og/resultados/${id}.webp?v=${survey.weekNumber}`;

	const html = template
		.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
		.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
		// El template base no incluye og:description/twitter:description: se insertan
		// justo después de su tag de título correspondiente.
		.replace(/(<meta property="og:title"[^>]*>)/, `$1\n\t<meta property="og:description" content="${escapeHtml(description)}" />`)
		.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeHtml(url)}$2`)
		.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`)
		.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
		.replace(/(<meta name="twitter:title"[^>]*>)/, `$1\n\t<meta name="twitter:description" content="${escapeHtml(description)}" />`)
		.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`)
		.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(url)}$2`);

	return c.html(html);
}

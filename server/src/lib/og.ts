import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import satori, { type Font } from 'satori';
import sharp from 'sharp';
import { partyLogoBaseName } from './party-logos.js';
import { getSurveyResults, type CandidateResult } from './results.js';
import { getSurveyWithCandidates } from './surveys.js';

// ---------------------------------------------------------------------------
// Generación de imágenes Open Graph (1200x630) para páginas de resultados.
// Pipeline: satori (layout + texto a SVG) → resvg (SVG a PNG) → sharp (a WebP,
// ~2x más liviano que PNG y soportado por los crawlers de WhatsApp/Facebook).
// Las fuentes se leen de @fontsource (WOFF estáticos) y los logos de partido
// de server/assets/party-logos/ (descargados con `npm run db:logos`), de modo
// que el render no depende de ninguna llamada de red.
// ---------------------------------------------------------------------------

const WIDTH = 1200;
const HEIGHT = 630;

// Paleta alineada con el tema claro de la web
const BG = '#f6f7fb';
const CARD = '#ffffff';
const INK = '#20242f';
const MUTED = '#6a7083';
const PRIMARY = '#5b4be0';
const TRACK = '#e9eaf2';

// Con pocos votos la imagen no muestra conteos (solo %) para no desincentivar
// la participación; a partir de este total aparece el número de votos.
// Mismo valor que VOTES_THRESHOLD en web/src/lib/utils.ts.
const VOTES_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Fuentes (WOFF estáticos de @fontsource; satori no soporta WOFF2)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

function woff(pkg: string, file: string): ArrayBuffer {
	const buf = readFileSync(require.resolve(`${pkg}/files/${file}`));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

type FontSpec = Font;

let fonts: FontSpec[] | null = null;

function getFonts() {
	if (fonts) return fonts;
	fonts = [
		{ name: 'Manrope', data: woff('@fontsource/manrope', 'manrope-latin-400-normal.woff'), weight: 400, style: 'normal' },
		{ name: 'Manrope', data: woff('@fontsource/manrope', 'manrope-latin-700-normal.woff'), weight: 700, style: 'normal' },
		{ name: 'Manrope', data: woff('@fontsource/manrope', 'manrope-latin-800-normal.woff'), weight: 800, style: 'normal' },
		{ name: 'Fraunces', data: woff('@fontsource/fraunces', 'fraunces-latin-600-normal.woff'), weight: 600, style: 'normal' }
	];
	return fonts;
}

// ---------------------------------------------------------------------------
// Logos de partido (archivos locales, key = nombre del partido)
// ---------------------------------------------------------------------------
const LOGO_DIR = fileURLToPath(new URL('../../assets/party-logos/', import.meta.url));
const logoCache = new Map<string, { data: Buffer; mime: string } | null>();
const RASTER_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

function sniffMime(buf: Buffer): string | null {
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
	if (buf.subarray(0, 4).toString('latin1') === '\x89PNG') return 'image/png';
	// webp/gif no los soporta resvg de forma fiable: se omiten (fallback a iniciales)
	return null;
}

async function getPartyLogo(partyKey: string | null): Promise<{ data: Buffer; mime: string } | null> {
	if (!partyKey) return null;
	const base = partyLogoBaseName(partyKey);
	if (logoCache.has(base)) return logoCache.get(base) ?? null;
	for (const ext of RASTER_EXTS) {
		try {
			const data = await readFile(`${LOGO_DIR}${base}${ext}`);
			const mime = sniffMime(data);
			if (!mime) throw new Error('formato no soportado');
			logoCache.set(base, { data, mime });
			return logoCache.get(base)!;
		} catch {
			// probar siguiente extensión
		}
	}
	logoCache.set(base, null);
	return null;
}

// ---------------------------------------------------------------------------
// Helpers de layout (objetos { type, props } que satori acepta sin React)
// ---------------------------------------------------------------------------
type El = { type: string; props: Record<string, unknown> };

function h(type: string, props: Record<string, unknown> | null, ...children: unknown[]): El {
	return { type, props: { ...(props ?? {}), children: children.flat().filter(Boolean) } };
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function initialsOf(name: string): string {
	return name
		.split(' ')
		.slice(0, 2)
		.map((p) => p[0])
		.join('')
		.toUpperCase();
}

const fmtVotes = new Intl.NumberFormat('es-PE');

// ---------------------------------------------------------------------------
// Render de la imagen de una encuesta (WebP)
// ---------------------------------------------------------------------------
const imageCache = new Map<number, { at: number; image: Buffer }>();
const CACHE_TTL_MS = 60_000;

export async function renderSurveyOgImage(surveyId: number): Promise<Buffer | null> {
	const hit = imageCache.get(surveyId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.image;

	const [results, detail] = await Promise.all([getSurveyResults(surveyId), getSurveyWithCandidates(surveyId)]);
	if (!results || !detail) return null;

	const candidatesById = new Map(detail.candidates.map((c) => [c.id, c]));
	const logos = new Map<number, { data: Buffer; mime: string }>();
	await Promise.all(
		results.results.map(async (r) => {
			const c = candidatesById.get(r.candidateId);
			// Misma clave que el script db:logos: el logo es del partido, no del candidato.
			const logo = await getPartyLogo(c?.party ?? c?.name ?? r.party ?? r.name);
			if (logo) logos.set(r.candidateId, logo);
		})
	);

	const svg = await satori(buildTree(results, detail, logos), {
		width: WIDTH,
		height: HEIGHT,
		fonts: getFonts()
	});
	const png = new Resvg(svg, { background: BG }).render().asPng();
	// WebP con calidad alta: conserva el texto nítido y pesa ~2x menos que el PNG.
	const image = await sharp(png).webp({ quality: 88 }).toBuffer();

	imageCache.set(surveyId, { at: Date.now(), image });
	return image;
}

type SurveyDetail = NonNullable<Awaited<ReturnType<typeof getSurveyWithCandidates>>>;

function buildTree(
	results: NonNullable<Awaited<ReturnType<typeof getSurveyResults>>>,
	detail: SurveyDetail,
	logos: Map<number, { data: Buffer; mime: string }>
): El {
	const top = results.results.slice(0, 3);
	const rest = results.results.length - top.length;
	const byId = new Map(detail.candidates.map((c) => [c.id, c]));

	const cardChildren: unknown[] = [
		h('div', { style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
			h('span', { style: { fontSize: 15, fontWeight: 800, letterSpacing: '0.14em', color: PRIMARY } }, 'RESULTADOS EN VIVO'),
			h('span', { style: { fontSize: 17, fontWeight: 700, color: MUTED } },
				results.totalVotes === 0
					? 'Sé el primero en votar'
					: results.totalVotes > VOTES_THRESHOLD
						? `${fmtVotes.format(results.totalVotes)} votos registrados`
						: 'Encuesta en curso'
			)
		)
	];

	for (const r of top) cardChildren.push(candidateRow(r, byId.get(r.candidateId), logos.get(r.candidateId)));
	if (rest > 0) {
		cardChildren.push(
			h('div', { style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
				h('span', { style: { fontSize: 17, fontWeight: 700, color: MUTED } },
					`+${rest} ${rest === 1 ? 'candidato más' : 'candidatos más'} en la encuesta`
				),
				h('span', { style: { fontSize: 15, fontWeight: 700, color: PRIMARY } }, 'Mira la lista completa »')
			)
		);
	}

	return h('div', {
		style: {
			width: '100%',
			height: '100%',
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'space-between',
			backgroundColor: BG,
			padding: '42px 56px'
		}
	},
		// Header
		h('div', { style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
			h('span', { style: { fontSize: 20, fontWeight: 800, letterSpacing: '0.16em', color: PRIMARY } }, 'ANDAHUAYLAS VOTA'),
			h('span', { style: { fontSize: 18, fontWeight: 700, color: MUTED } },
				`SEMANA ${detail.weekNumber} · ${detail.weekLabel.toUpperCase()}`
			)
		),
		// Título + tarjeta
		h('div', { style: { display: 'flex', flexDirection: 'column', gap: 22 } },
			h('div', { style: { display: 'flex', fontSize: 42, fontWeight: 600, fontFamily: 'Fraunces', color: INK, lineHeight: 1.15 } },
				truncate(detail.electionName, 52)
			),
			h('div', {
				style: {
					display: 'flex',
					flexDirection: 'column',
					gap: 16,
					backgroundColor: CARD,
					borderRadius: 24,
					padding: '26px 30px'
				}
			},
				results.totalVotes === 0
					? emptyState()
					: cardChildren
			)
		),
		// Footer
		h('div', { style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
			h('span', { style: { fontSize: 18, fontWeight: 700, color: MUTED } }, 'voto.pukllayandahuaylas.pe'),
			h('div', {
				style: {
					display: 'flex',
					alignItems: 'center',
					backgroundColor: PRIMARY,
					borderRadius: 999,
					padding: '13px 28px'
				}
			},
				h('span', { style: { fontSize: 20, fontWeight: 800, color: '#ffffff' } }, 'Ver resultados completos »')
			)
		)
	);
}

function candidateRow(r: CandidateResult, candidate: SurveyDetail['candidates'][number] | undefined, logo: { data: Buffer; mime: string } | undefined): El {
	const color = r.partyColor ?? '#64748b';
	const name = candidate?.name ?? r.name;
	const party = candidate?.party ?? r.party;

	const avatar = logo
		? h('img', {
				src: `data:${logo.mime};base64,${logo.data.toString('base64')}`,
				width: 36,
				height: 36,
				style: { width: 36, height: 36, borderRadius: 9 }
			})
		: h('div', {
				style: {
					width: 36,
					height: 36,
					borderRadius: '50%',
					backgroundColor: color,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 14,
					fontWeight: 800,
					color: '#ffffff'
				}
			},
				initialsOf(name)
			);

	return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
		h('div', { style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 } },
			h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 } },
				avatar,
				h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 } },
					h('span', { style: { fontSize: 21, fontWeight: 700, color: INK, whiteSpace: 'nowrap' } },
						truncate(name, 44)
					),
					party
						? h('span', { style: { fontSize: 14, fontWeight: 500, color: MUTED, whiteSpace: 'nowrap' } },
								truncate(party, 58)
							)
						: null
				)
			),
			h('span', { style: { fontSize: 26, fontWeight: 800, color: INK } }, `${r.percent}%`)
		),
		h('div', { style: { display: 'flex', height: 10, borderRadius: 999, backgroundColor: TRACK, overflow: 'hidden' } },
			h('div', { style: { display: 'flex', height: '100%', width: `${r.percent}%`, borderRadius: 999, backgroundColor: color } })
		)
	);
}

function emptyState(): El {
	return h('div', {
		style: {
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 10,
			padding: '36px 0'
		}
	},
		h('span', { style: { fontSize: 30, fontWeight: 600, fontFamily: 'Fraunces', color: INK } },
			'Aún no hay votos en esta encuesta'
		),
		h('span', { style: { fontSize: 18, fontWeight: 500, color: MUTED } },
			'Participa y mira los resultados en vivo cada semana'
		)
	);
}

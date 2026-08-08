import 'dotenv/config';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { db } from '../src/db/index.js';
import { candidates } from '../src/db/schema.js';
import { partyLogoBaseName } from '../src/lib/party-logos.js';

// ---------------------------------------------------------------------------
// Descarga los logos de partido una sola vez a server/assets/party-logos/.
// Los partyLogoUrl son hotlinks al blob del JNE: guardarlos en disco hace que
// el render de las imágenes OG no dependa de la red ni de su disponibilidad.
//
// Un partido político tiene UN solo logo, compartido por todos sus candidatos
// (aunque el blob del JNE use una URL distinta por candidato). Por eso se
// agrupa por partido: se descarga UNA URL por partido (la más usada) y el
// archivo se nombra con partyLogoBaseName(partido), estable e independiente
// de la URL. Los candidatos sin partido usan su propio nombre como clave.
//
// Uso: npm run db:logos   (ejecutar tras cada importación de candidatos)
// ---------------------------------------------------------------------------

const OUT_DIR = fileURLToPath(new URL('../assets/party-logos/', import.meta.url));
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const RASTER_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/** Detecta el formato por bytes mágicos (más fiable que la extensión de la URL). */
function sniffFormat(buf: Buffer): 'svg' | 'png' | 'jpg' | 'webp' | 'gif' | 'unknown' {
	if (buf.subarray(0, 4).toString('latin1') === '\x89PNG') return 'png';
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
	if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
		return 'webp';
	}
	if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
	if (buf.subarray(0, 256).toString('utf8').match(/^\s*(?:<\?xml[\s\S]*?\?>)?\s*<svg[\s>]/i)) return 'svg';
	return 'unknown';
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true });

	const rows = await db
		.select({ id: candidates.id, name: candidates.name, party: candidates.party, url: candidates.partyLogoUrl })
		.from(candidates);

	// Agrupar por partido político: cada partido tiene UN logo.
	const byParty = new Map<string, { party: string | null; urlCounts: Map<string, number> }>();
	for (const row of rows) {
		const key = row.party ?? row.name;
		let group = byParty.get(key);
		if (!group) {
			group = { party: row.party, urlCounts: new Map() };
			byParty.set(key, group);
		}
		if (row.url) group.urlCounts.set(row.url, (group.urlCounts.get(row.url) ?? 0) + 1);
	}

	// Una URL por partido: la más usada entre sus candidatos.
	const items: { key: string; party: string | null; url: string }[] = [];
	for (const [key, group] of byParty) {
		let best = '';
		let bestCount = 0;
		for (const [url, count] of group.urlCounts) {
			if (count > bestCount) {
				best = url;
				bestCount = count;
			}
		}
		if (best) items.push({ key, party: group.party, url: best });
	}
	console.log(`[logos] ${items.length} partidos con logo (${rows.length} candidatos)`);

	const expected = new Set(items.map((item) => partyLogoBaseName(item.key)));
	let ok = 0;
	let failed = 0;
	let next = 0;

	async function downloadOne(item: (typeof items)[number]) {
		const base = partyLogoBaseName(item.key);
		try {
			const res = await fetch(item.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			const format = sniffFormat(buf);

			let fileName: string;
			if (format === 'svg') {
				// resvg no soporta SVG embebido como <image> dentro de SVG: se rasteriza a PNG.
				const png = new Resvg(buf, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
				fileName = `${base}.png`;
				await writeFile(`${OUT_DIR}${fileName}`, png);
			} else if (format === 'png' || format === 'jpg' || format === 'webp' || format === 'gif') {
				fileName = `${base}.${format === 'jpg' ? 'jpg' : format}`;
				await writeFile(`${OUT_DIR}${fileName}`, buf);
			} else {
				throw new Error(`formato no reconocido (${buf.length} bytes)`);
			}
			ok++;
			console.log(`[logos] ok ${item.party ?? item.key} (${format}, ${fileName})`);
		} catch (err) {
			failed++;
			console.warn(`[logos] fallo ${item.party ?? item.key}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Pool simple de descargas concurrentes
	const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
		while (next < items.length) {
			const item = items[next++];
			await downloadOne(item);
		}
	});
	await Promise.all(workers);

	// Limpiar archivos obsoletos (partidos que ya no están o nombres antiguos).
	const current = new Set<string>();
	for (const item of items) {
		const base = partyLogoBaseName(item.key);
		for (const ext of RASTER_EXTS) current.add(`${base}${ext}`);
	}
	const files = await readdir(OUT_DIR);
	for (const file of files) {
		const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
		if (!RASTER_EXTS.includes(ext) || current.has(file)) continue;
		await unlink(`${OUT_DIR}${file}`);
		console.log(`[logos] limpio ${file}`);
	}

	console.log(`[logos] descargados: ${ok}, fallidos: ${failed}`);

	// La conexión de postgres mantiene vivo el event loop: salir explícitamente.
	process.exit(0);
}

void main();

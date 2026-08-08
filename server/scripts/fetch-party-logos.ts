import 'dotenv/config';
import { execFile } from 'node:child_process';
import { access, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Resvg } from '@resvg/resvg-js';
import sharp, { type RawData } from 'sharp';
import { db } from '../src/db/index.js';
import { candidates } from '../src/db/schema.js';
import { PARTY_LOGO_WEBP_SIZE, partyLogoBaseName } from '../src/lib/party-logos.js';

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
// Los logos se muestran a 36px en las imágenes OG: 128px dan margen de sobra
// y mantienen el peso mínimo (los JPEG originales del JNE pesan hasta 300 KB).
const LOGO_SIZE = 128;

const execFileP = promisify(execFile);

/**
 * Genera el ícono WebP cuadrado (36x36px) que usan las barras de resultados
 * del frontend, a partir del raster ya descargado. Usa el binario `cwebp`
 * (libwebp) con -resize: el PNG origen ya es cuadrado, así que no distorsiona.
 */
async function toWebpIcon(base: string): Promise<boolean> {
	for (const ext of ['.png', '.jpg', '.jpeg']) {
		const src = `${OUT_DIR}${base}${ext}`;
		try {
			await access(src);
		} catch {
			continue;
		}
		await execFileP('cwebp', [
			'-q', '90',
			'-resize', String(PARTY_LOGO_WEBP_SIZE), String(PARTY_LOGO_WEBP_SIZE),
			src,
			'-o', `${OUT_DIR}${base}.webp`
		]);
		return true;
	}
	return false;
}

/** Detecta el formato por bytes mágicos (más fiable que la extensión de la URL). */
function sniffFormat(buf: Buffer): 'svg' | 'png' | 'jpg' | 'webp' | 'gif' | 'bmp' | 'unknown' {
	if (buf.subarray(0, 4).toString('latin1') === '\x89PNG') return 'png';
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
	if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
		return 'webp';
	}
	if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
	// Algunos blobs del JNE sirven BMP aunque la URL termine en .png.
	if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
	if (buf.subarray(0, 256).toString('utf8').match(/^\s*(?:<\?xml[\s\S]*?\?>)?\s*<svg[\s>]/i)) return 'svg';
	return 'unknown';
}

/**
 * Decodifica BMP sin compresión de 24 bpp a RGB crudo (filas de arriba a
 * abajo). El blob del JNE de algún partido sirve BMP aunque la URL termine
 * en .png, y libvips/sharp no trae decodificador BMP: por eso se hace a mano.
 */
function decodeBmp(buf: Buffer): { data: RawData; width: number; height: number } {
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	if (buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error('no es BMP');
	const dataOffset = dv.getUint32(10, true);
	const width = dv.getInt32(18, true);
	const heightSigned = dv.getInt32(22, true);
	const bpp = dv.getUint16(28, true);
	const compression = dv.getUint32(30, true);
	if (bpp !== 24 || compression !== 0 || width <= 0 || heightSigned === 0) {
		throw new Error(`BMP no soportado (bpp=${bpp}, compresión=${compression})`);
	}
	const height = Math.abs(heightSigned);
	const topDown = heightSigned < 0;
	const stride = Math.ceil((width * 3) / 4) * 4; // filas alineadas a 4 bytes
	const data = Buffer.alloc(width * height * 3);
	for (let y = 0; y < height; y++) {
		const srcRow = dataOffset + (topDown ? y : height - 1 - y) * stride;
		const dstRow = y * width * 3;
		for (let x = 0; x < width; x++) {
			const s = srcRow + x * 3;
			data[dstRow + x * 3] = buf[s + 2]; // BMP guarda BGR
			data[dstRow + x * 3 + 1] = buf[s + 1];
			data[dstRow + x * 3 + 2] = buf[s];
		}
	}
	return { data, width, height };
}

/** Recodifica cualquier imagen (SVG/PNG/JPEG/WebP/GIF/BMP) a PNG cuadrado del ancho pedido. */
async function toPng(buf: Buffer, width: number): Promise<Buffer> {
	const mime = sniffFormat(buf);
	if (mime === 'unknown') throw new Error('formato no reconocido');
	// resvg/usvg no saben incrustar BMP y libvips no lo decodifica: se pasa a
	// PNG vía sharp alimentándolo con los píxeles crudos.
	if (mime === 'bmp') {
		const { data, width: w, height: h } = decodeBmp(buf);
		return sharp(data, { raw: { width: w, height: h, channels: 3 } })
			.resize(width, width, { fit: 'fill' }) // mismo estirado a cuadrado que la vía SVG
			.png()
			.toBuffer();
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><image href="data:image/${mime === 'svg' ? 'svg+xml' : mime === 'jpg' ? 'jpeg' : mime};base64,${buf.toString('base64')}" width="${width}" height="${width}"/></svg>`;
	return new Resvg(Buffer.from(svg), { fitTo: { mode: 'width', value: width } }).render().asPng();
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
			// Siempre PNG optimizado: los blobs del JNE vienen en formatos y tamaños
			// dispares (SVG, JPEG de cientos de KB) y resvg los rasteriza igual.
			const png = await toPng(buf, LOGO_SIZE);
			const fileName = `${base}.png`;
			await writeFile(`${OUT_DIR}${fileName}`, png);
			ok++;
			console.log(`[logos] ok ${item.party ?? item.key} (${sniffFormat(buf)}, ${fileName})`);
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

	// Íconos WebP cuadrados de 36px para el frontend (endpoint /api/party-logo).
	// Se generan también si la descarga falló pero ya existía el raster local.
	let webpOk = 0;
	for (const item of items) {
		try {
			if (await toWebpIcon(partyLogoBaseName(item.key))) webpOk++;
		} catch (err) {
			console.warn(`[logos] webp fallo ${item.party ?? item.key}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	console.log(`[logos] webp generados: ${webpOk} (${PARTY_LOGO_WEBP_SIZE}x${PARTY_LOGO_WEBP_SIZE}px con cwebp)`);

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

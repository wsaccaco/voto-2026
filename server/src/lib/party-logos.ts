import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Nombre de archivo estable para los logos de partido descargados en
// server/assets/party-logos/. Se deriva SOLO del nombre del partido (no de la
// URL), porque un partido tiene un único logo: todos sus candidatos deben
// apuntar al mismo archivo local, aunque el blob del JNE use URLs distintas.
// ---------------------------------------------------------------------------

/** Directorio donde viven los logos descargados (PNG/JPG) y sus WebP. */
export const PARTY_LOGO_DIR = fileURLToPath(new URL('../../assets/party-logos/', import.meta.url));

// Lado (px) del ícono cuadrado WebP usado en las barras de resultados del
// frontend. Se genera con cwebp en `npm run db:logos`.
export const PARTY_LOGO_WEBP_SIZE = 36;

export function partyLogoBaseName(party: string): string {
	const slug =
		party
			.normalize('NFD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'partido';
	const hash = createHash('sha256').update(party).digest('hex').slice(0, 8);
	return `${slug}-${hash}`;
}

// ---------------------------------------------------------------------------
// Lectura del logo para servirlo por HTTP (endpoint /api/party-logo).
// Prioriza el WebP cuadrado de 36px; cae al PNG/JPG si no existe.
// ---------------------------------------------------------------------------
const WEB_EXTS: { ext: string; mime: string }[] = [
	{ ext: '.webp', mime: 'image/webp' },
	{ ext: '.png', mime: 'image/png' },
	{ ext: '.jpg', mime: 'image/jpeg' },
	{ ext: '.jpeg', mime: 'image/jpeg' }
];

export async function readPartyLogo(partyKey: string): Promise<{ data: Buffer; mime: string } | null> {
	const base = partyLogoBaseName(partyKey);
	// Doble seguro: el basename ya es un slug+hash, pero validamos antes de
	// concatenar en una ruta de archivo.
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/.test(base)) return null;
	for (const { ext, mime } of WEB_EXTS) {
		try {
			const data = await readFile(`${PARTY_LOGO_DIR}${base}${ext}`);
			return { data, mime };
		} catch {
			// probar siguiente extensión
		}
	}
	return null;
}

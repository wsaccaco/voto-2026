import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Nombre de archivo estable para los logos de partido descargados en
// server/assets/party-logos/. Se deriva SOLO del nombre del partido (no de la
// URL), porque un partido tiene un único logo: todos sus candidatos deben
// apuntar al mismo archivo local, aunque el blob del JNE use URLs distintas.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// URL del logo de partido para las barras de resultados. El servidor resuelve
// el nombre a un archivo estable (slug + hash del partido) y devuelve el WebP
// cuadrado de 36px generado con cwebp (`npm run db:logos`), o 404 si el
// partido no tiene logo (el ResultBar cae entonces al punto de partyColor).
// ---------------------------------------------------------------------------

/** Clave del logo: el logo es del partido; los independientes usan su nombre. */
export function partyLogoSrc(party: string | null, candidateName: string): string {
	return `/api/party-logo?p=${encodeURIComponent(party ?? candidateName)}`;
}

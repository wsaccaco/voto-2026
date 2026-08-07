let cachedVisitorId: string | null = null;

/**
 * Genera una huella del dispositivo (FingerprintJS open source) para la
 * capa antifraude. Se envía junto al voto; el servidor la guarda hasheada.
 */
export async function getDeviceFingerprint(): Promise<string | null> {
	if (cachedVisitorId) return cachedVisitorId;
	try {
		const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default;
		const fp = await FingerprintJS.load();
		const result = await fp.get();
		cachedVisitorId = result.visitorId;
		return cachedVisitorId;
	} catch {
		return null;
	}
}

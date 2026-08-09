/**
 * Utilidades para navegadores embebidos (WebView de Facebook, Instagram, etc.).
 * Google bloquea el inicio de sesión OAuth dentro de estos WebViews
 * (disallowed_useragent), así que la app debe invitar al usuario a abrir el
 * sitio en el navegador real del dispositivo.
 */

/** Detecta si la app corre dentro de un WebView / navegador embebido. */
export function isInAppBrowser(): boolean {
	const ua = navigator.userAgent;
	const brands =
		(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.map(
			(b) => b.brand
		) ?? [];
	const joined = [ua, ...brands].join(' ');
	return /FBAN|FBAV|Instagram|MicroMessenger|\bLine\b|musical_ly|Snapchat|Twitter for iPhone|wv\b/i.test(joined);
}

/** Copia texto al portapapeles, con fallback al método clásico. */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			ta.remove();
			return ok;
		} catch {
			return false;
		}
	}
}

/**
 * Abre una URL en el navegador externo del dispositivo.
 * Android: intent URL hacia Chrome (con browser_fallback_url al navegador por
 * defecto si Chrome no está instalado). iOS: window.open con _blank, que en el
 * WebView de Facebook/Instagram abre Safari.
 * Devuelve 'copied' cuando no se pudo abrir y el enlace quedó copiado.
 */
export function openInExternalBrowser(url: string): 'opened' | 'copied' {
	const isAndroid = /Android/i.test(navigator.userAgent);
	if (isAndroid) {
		const u = new URL(url);
		const fallback = encodeURIComponent(url);
		const intent = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
		window.location.href = intent;
		return 'opened';
	}
	const win = window.open(url, '_blank');
	if (win) return 'opened';
	void copyToClipboard(url);
	return 'copied';
}

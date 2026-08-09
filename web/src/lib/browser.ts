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
 * defecto si Chrome no está instalado). iOS: primero el URL scheme de Chrome
 * (googlechromes://), que entrega la navegación a la app externa; si no se
 * confirma que la app pasó a segundo plano (Chrome no instalado), se intenta
 * window.open como respaldo, y si el popup queda bloqueado se copia el enlace.
 * Devuelve 'copied' cuando no se pudo abrir y el enlace quedó copiado.
 */
export async function openInExternalBrowser(url: string): Promise<'opened' | 'copied'> {
	const isAndroid = /Android/i.test(navigator.userAgent);
	if (isAndroid) {
		const u = new URL(url);
		const fallback = encodeURIComponent(url);
		const intent = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
		window.location.href = intent;
		return 'opened';
	}

	if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
		// El WebView de Facebook/Instagram intercepta window.open y lo abre en su
		// navegador interno (se percibe como una recarga). El URL scheme de Chrome
		// entrega la navegación a la app externa; si Chrome no está instalado la
		// navegación falla en silencio y la app nunca sale a segundo plano.
		const leftApp = await new Promise<boolean>((resolve) => {
			let timer: ReturnType<typeof setTimeout>;
			const settle = (ok: boolean) => {
				window.removeEventListener('pagehide', onPageHide);
				document.removeEventListener('visibilitychange', onHidden);
				clearTimeout(timer);
				resolve(ok);
			};
			const onPageHide = () => settle(true);
			const onHidden = () => {
				if (document.hidden) settle(true);
			};
			timer = setTimeout(() => settle(false), 1500);
			window.addEventListener('pagehide', onPageHide);
			document.addEventListener('visibilitychange', onHidden);
		});
		if (leftApp) return 'opened';

		// Chrome no disponible: respaldo con window.open; si el popup es
		// bloqueado, último recurso copiar el enlace.
		const win = window.open(url, '_blank');
		if (win) return 'opened';
		await copyToClipboard(url);
		return 'copied';
	}

	const win = window.open(url, '_blank');
	if (win) return 'opened';
	await copyToClipboard(url);
	return 'copied';
}

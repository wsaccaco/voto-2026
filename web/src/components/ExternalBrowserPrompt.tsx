import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyToClipboard, openInExternalBrowser } from '@/lib/browser';

/** Clave de sesión: el aviso se oculta una vez por sesión de navegación. */
const DISMISS_KEY = 'encuesta:webview-avisado';

/**
 * Aviso para navegadores embebidos (WebView de Facebook, Instagram, etc.):
 * Google no permite iniciar sesión dentro de estos WebViews, así que se invita
 * a abrir el sitio en el navegador real del dispositivo.
 */
export function ExternalBrowserPrompt() {
	const [visible, setVisible] = useState(() => {
		try {
			return sessionStorage.getItem(DISMISS_KEY) !== '1';
		} catch {
			return true;
		}
	});

	if (!visible) return null;

	const open = () => {
		const result = openInExternalBrowser(window.location.href);
		if (result === 'copied') toast.success('Enlace copiado: pégalo en tu navegador');
	};

	const copy = () => {
		void copyToClipboard(window.location.href).then((ok) => {
			if (ok) toast.success('Enlace copiado');
		});
	};

	const dismiss = () => {
		try {
			sessionStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* almacenamiento no disponible */
		}
		setVisible(false);
	};

	return (
		<div className="border-b bg-amber-50 dark:bg-amber-950/40">
			<div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
				<p className="flex items-center gap-2 text-sm">
					<ExternalLink className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<span>
						Para votar necesitas tu navegador: Google no permite iniciar sesión dentro de
						Facebook.
					</span>
				</p>
				<div className="flex items-center gap-2">
					<Button size="sm" onClick={open}>
						Abrir en Chrome/Safari
					</Button>
					<Button size="sm" variant="ghost" onClick={copy}>
						Copiar enlace
					</Button>
					<button
						type="button"
						onClick={dismiss}
						className="text-xs text-muted-foreground underline-offset-2 hover:underline"
					>
						Entendido
					</button>
				</div>
			</div>
		</div>
	);
}

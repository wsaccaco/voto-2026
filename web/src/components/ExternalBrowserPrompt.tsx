import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from '@/components/ui/dialog';
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
	const [showHelp, setShowHelp] = useState(false);

	if (!visible) return null;

	const open = async () => {
		const result = await openInExternalBrowser(window.location.href);
		if (result === 'copied') setShowHelp(true);
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
		<>
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
			<Dialog open={showHelp} onOpenChange={setShowHelp}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>No pudimos abrir tu navegador</DialogTitle>
						<DialogDescription>
							Copia el enlace, abre Safari en tu iPhone y pégalo en la barra de
							direcciones para poder votar.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Button onClick={copy}>
							<Copy className="mr-2 h-4 w-4" /> Copiar enlace
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

import { useState, type ComponentProps, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from '@/components/ui/dialog';
import { signInWithGoogle } from '@/lib/api';
import { copyToClipboard, isInAppBrowser, openInExternalBrowser } from '@/lib/browser';

interface SignInButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> {
	/** Ruta a la que volver tras el login (por defecto la ruta actual). */
	returnTo?: string;
	children?: ReactNode;
}

/**
 * Botón de ingreso con Google. Dentro de un WebView (Facebook, Instagram,
 * etc.) no se lanza OAuth: Google lo bloquea (disallowed_useragent), así que
 * se muestra un aviso con salida al navegador externo del dispositivo.
 */
export function SignInButton({ returnTo, children = 'Continuar con Google', ...props }: SignInButtonProps) {
	const [showPrompt, setShowPrompt] = useState(false);

	if (!isInAppBrowser()) {
		return (
			<Button {...props} onClick={() => signInWithGoogle(returnTo)}>
				{children}
			</Button>
		);
	}

	const copy = () => {
		void copyToClipboard(window.location.href).then((ok) => {
			if (ok) toast.success('Enlace copiado');
		});
	};

	return (
		<>
			<Button {...props} onClick={() => setShowPrompt(true)}>
				{children}
			</Button>
			<Dialog open={showPrompt} onOpenChange={setShowPrompt}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Usa tu navegador para continuar</DialogTitle>
						<DialogDescription>
							Google no permite iniciar sesión dentro de la app de Facebook. Abre la
							encuesta en tu navegador para poder votar.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Button onClick={() => openInExternalBrowser(window.location.href)}>
							<ExternalLink className="mr-2 h-4 w-4" /> Abrir en navegador
						</Button>
						<Button variant="outline" onClick={copy}>
							Copiar enlace
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

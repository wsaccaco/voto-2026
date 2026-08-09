import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SignInButton } from '@/components/SignInButton';

export function LoginPrompt({ title = 'Inicia sesión para continuar' }: { title?: string }) {
	return (
		<div className="mx-auto max-w-md px-4 py-12">
			<Card>
				<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
					<span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
						<Lock className="h-5 w-5 text-primary" />
					</span>
					<h2 className="text-lg font-semibold">{title}</h2>
					<p className="text-sm text-muted-foreground">
						Necesitamos tu cuenta de Google para garantizar un solo voto por persona cada semana.
					</p>
					<SignInButton className="mt-2" />
				</CardContent>
			</Card>
		</div>
	);
}

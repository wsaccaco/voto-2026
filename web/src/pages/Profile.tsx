import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LoginPrompt } from '@/components/LoginPrompt';
import { PageLoader } from '@/components/PageLoader';
import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/lib/auth-context';

export default function Profile() {
	const { user, loading } = useAuth();
	const navigate = useNavigate();

	if (loading) return <PageLoader rows={4} />;

	if (!user) return <LoginPrompt title="Inicia sesión para ver tu perfil" />;

	return (
		<div className="mx-auto max-w-lg px-4 py-8">
			<div className="mb-6 text-center">
				<span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
					<UserRound className="h-7 w-7 text-primary" />
				</span>
				<h1 className="mt-3 text-2xl font-bold tracking-tight">Mi perfil demográfico</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Tu información es opcional y se usa solo de forma agregada y anónima para hacer la encuesta más
					representativa. La puedes actualizar cuando quieras.
				</p>
			</div>

			<Card className="shadow-sm">
				<CardContent className="p-5">
					<ProfileForm initial={user.profile} onDone={() => navigate('/')} />
				</CardContent>
			</Card>
		</div>
	);
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '@/components/ui/dialog';
import { CandidateCard } from '@/components/CandidateCard';
import { LoginPrompt } from '@/components/LoginPrompt';
import { PageLoader } from '@/components/PageLoader';
import { ProfileForm } from '@/components/ProfileForm';
import { api, ApiError, getSession } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
	canVoteIn,
	cleanSurveyTitle,
	formatDateRange,
	getVotingLocation,
	type VotingLocation
} from '@/lib/elections';
import { getDeviceFingerprint } from '@/lib/fingerprint';
import type { SurveyDetail } from '@/lib/types';

export default function Survey() {
	const { id } = useParams();
	const { user, loading: authLoading, refresh } = useAuth();

	const [survey, setSurvey] = useState<SurveyDetail | null>(null);
	const [myVote, setMyVote] = useState<{ candidateId: number } | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [voted, setVoted] = useState(false);
	const [showProfile, setShowProfile] = useState(false);
	const [error, setError] = useState(false);
	const [location] = useState<VotingLocation | null>(() => getVotingLocation());

	useEffect(() => {
		api
			.get<{ survey: SurveyDetail; myVote: { candidateId: number } | null }>(`/surveys/${id}`)
			.then((d) => {
				setSurvey(d.survey);
				setMyVote(d.myVote);
			})
			.catch(() => setError(true));
	}, [id]);

	const submitVote = async () => {
		if (!selected) return;
		setSubmitting(true);
		try {
			const fingerprint = await getDeviceFingerprint();
			await api.post(`/surveys/${id}/vote`, { candidateId: selected, fingerprint });
			toast.success('¡Tu voto fue registrado! Gracias por participar.');
			await refresh();
			const session = await getSession();
			setVoted(true);
			setShowProfile(!session?.profile);
		} catch (err) {
			const message = err instanceof ApiError ? err.message : 'No se pudo registrar tu voto';
			toast.error(message);
			if (err instanceof ApiError && err.status === 409) setVoted(true);
		} finally {
			setSubmitting(false);
			setConfirmOpen(false);
		}
	};

	if (error) {
		return (
			<div className="mx-auto max-w-md px-4 py-16 text-center">
				<h2 className="text-lg font-semibold">Encuesta no encontrada</h2>
				<p className="mt-1 text-sm text-muted-foreground">Puede que ya haya vencido.</p>
				<Button asChild className="mt-4">
					<Link to="/">Volver al inicio</Link>
				</Button>
			</div>
		);
	}

	if (!survey) return <PageLoader rows={5} />;

	const closed = survey.status !== 'abierta' || new Date(survey.endDate) < new Date();

	// Ya votó esta semana
	if (voted || myVote) {
		const chosen = survey.candidates.find((c) => c.id === (myVote?.candidateId ?? selected));
		return (
			<div className="mx-auto max-w-lg px-4 py-10">
				<Card>
					<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
						<span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
							<CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
						</span>
						<h2 className="text-xl font-bold">¡Voto registrado!</h2>
						<p className="text-sm text-muted-foreground">
							Ya participaste en la semana del {formatDateRange(survey.startDate, survey.endDate)}. Podrás votar
							de nuevo el lunes de la próxima semana si cambiaste de opinión.
						</p>
						{chosen && (
							<p className="text-sm">
								Votaste por <span className="font-semibold">{chosen.name}</span>
							</p>
						)}
						<div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
							<Button asChild className="sm:flex-1">
								<Link to={`/resultados/${survey.id}`}>
									<BarChart3 className="mr-2 h-4 w-4" /> Ver resultados
								</Link>
							</Button>
							<Button asChild variant="outline" className="sm:flex-1">
								<Link to="/">Volver al inicio</Link>
							</Button>
						</div>
					</CardContent>
				</Card>

				{showProfile && (
					<div className="mt-6">
						<ProfileForm onDone={() => setShowProfile(false)} />
					</div>
				)}
			</div>
		);
	}

	// Requiere sesión para votar
	if (!authLoading && !user) {
		return <LoginPrompt title="Ingresa para votar en esta encuesta" />;
	}

	// Puerta de jurisdicción: cada encuesta es solo para electores de su ámbito
	if (!closed && !canVoteIn(survey, location)) {
		const scope =
			survey.electionLevel === 'provincial'
				? `solo para electores de la provincia de ${survey.electionProvince}`
				: `solo para electores del distrito de ${survey.electionDistrict} (${survey.electionProvince})`;
		return (
			<div className="mx-auto max-w-lg px-4 py-10">
				<Card>
					<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
						<span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
							<MapPin className="h-7 w-7 text-primary" />
						</span>
						<h2 className="text-xl font-bold">
							{location ? 'Esta encuesta no es de tu zona' : '¿Dónde vives?'}
						</h2>
						<p className="text-sm text-muted-foreground">
							{location
								? `Registraste que vives en ${location.district}, ${location.province}. La ${survey.electionName} es ${scope}.`
								: `La ${survey.electionName} es ${scope}. Indícanos dónde vives para entregarte tus encuestas.`}
						</p>
						<div className="mt-2 flex w-full flex-col gap-2">
							<Button asChild>
								<Link to="/">{location ? 'Cambiar mi ubicación' : 'Seleccionar mi ubicación'}</Link>
							</Button>
							<Button asChild variant="outline">
								<Link to="/resultados">Ver resultados igualmente</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-lg px-4 py-8">
			<div className="mb-6 text-center">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{formatDateRange(survey.startDate, survey.endDate)}
				</p>
				<h1 className="mt-1 text-2xl font-bold tracking-tight">{cleanSurveyTitle(survey.title)}</h1>
				<p className="mt-1 text-sm text-muted-foreground">Elige una opción.</p>
			</div>

			{closed ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
						<AlertTriangle className="h-8 w-8 text-amber-500" />
						<p className="text-sm text-muted-foreground">
							Esta encuesta ya cerró. Participa en la encuesta de la semana actual.
						</p>
						<Button asChild variant="outline">
							<Link to="/">Ver encuestas abiertas</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<>
					<div className="space-y-2.5">
						{survey.candidates.map((c) => (
							<CandidateCard
								key={c.id}
								candidate={c}
								selected={selected === c.id}
								onSelect={setSelected}
							/>
						))}
					</div>

					<Button
						className="mt-6 w-full min-h-[52px] text-base"
						size="lg"
						disabled={!selected || submitting}
						onClick={() => setConfirmOpen(true)}
					>
						{submitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
						Votar por esta opción
					</Button>
					<p className="mt-2 text-center text-xs text-muted-foreground">
						Al votar aceptas participar una vez por semana. Se usa tu cuenta de Google para evitar votos duplicados.
					</p>
				</>
			)}

			{/* Confirmación del voto (irreversible) */}
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>¿Confirmas tu voto?</DialogTitle>
						<DialogDescription>
							Esta acción no se puede deshacer esta semana. Podrás cambiar tu voto recién el lunes próximo.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="flex-col gap-2 sm:flex-col">
						<Button className="w-full" disabled={submitting} onClick={submitVote}>
							{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Sí, confirmar mi voto
						</Button>
						<Button variant="outline" className="w-full" onClick={() => setConfirmOpen(false)}>
							Cancelar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

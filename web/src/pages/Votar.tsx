import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BarChart3, CheckCircle2, Info, Loader2, MapPin, Vote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { PageLoader } from '@/components/PageLoader';
import { ProfileForm } from '@/components/ProfileForm';
import { SignInButton } from '@/components/SignInButton';
import { api, ApiError, getSession } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
	capitalNote,
	formatDateRange,
	getVotingLocation,
	locationLabel,
	visibleSurveys,
	type VotingLocation
} from '@/lib/elections';
import { getDeviceFingerprint } from '@/lib/fingerprint';
import type { SurveyDetail } from '@/lib/types';

const LEVEL_BADGES = {
	regional: 'Encuesta regional',
	provincial: 'Encuesta provincial',
	distrital: 'Encuesta distrital'
} as const;

export default function Votar() {
	const { user, loading: authLoading, refresh } = useAuth();
	const [location] = useState<VotingLocation | null>(() => getVotingLocation());

	const [ballots, setBallots] = useState<SurveyDetail[] | null>(null);
	const [myVotes, setMyVotes] = useState<Record<number, number>>({});
	const [selections, setSelections] = useState<Record<number, number>>({});
	const [submitting, setSubmitting] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [done, setDone] = useState(false);
	const [showProfile, setShowProfile] = useState(false);
	const [error, setError] = useState(false);

	useEffect(() => {
		api
			.get<{ surveys: SurveyDetail[]; myVotes: Record<number, number> }>('/week')
			.then((d) => {
				setBallots(d.surveys);
				setMyVotes(d.myVotes);
			})
			.catch(() => setError(true));
	}, []);

	// Solo las encuestas del ámbito del elector, en orden regional → provincial → distrital
	const mine = useMemo(() => visibleSurveys(ballots ?? [], location), [ballots, location]);
	const pending = mine.filter((b) => myVotes[b.id] === undefined);
	const allVoted = mine.length > 0 && pending.length === 0;
	const note = location ? capitalNote(location) : null;

	const submitVotes = async () => {
		const votes = pending
			.filter((b) => selections[b.id] !== undefined)
			.map((b) => ({ surveyId: b.id, candidateId: selections[b.id] }));
		if (votes.length === 0) return;
		setSubmitting(true);
		try {
			const fingerprint = await getDeviceFingerprint();
			const res = await api.post<{ ok: boolean; voted: number[]; skipped: number[] }>('/vote', { votes, fingerprint });
			toast.success('¡Tus votos fueron registrados! Gracias por participar.');
			// Marcar como votadas las encuestas registradas (y las ya votadas antes)
			setMyVotes((prev) => {
				const next = { ...prev };
				for (const v of votes) next[v.surveyId] = v.candidateId;
				for (const id of res.skipped) next[id] = next[id] ?? selections[id];
				return next;
			});
			await refresh();
			setDone(true);
			const session = await getSession();
			setShowProfile(!session?.profile);
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudieron registrar tus votos');
		} finally {
			setSubmitting(false);
			setConfirmOpen(false);
		}
	};

	if (error) {
		return (
			<div className="mx-auto max-w-md px-4 py-16 text-center">
				<h2 className="text-lg font-semibold">No pudimos cargar las encuestas</h2>
				<p className="mt-1 text-sm text-muted-foreground">Intenta de nuevo en unos segundos.</p>
				<Button asChild className="mt-4">
					<Link to="/">Volver al inicio</Link>
				</Button>
			</div>
		);
	}

	// Sin ubicación: primero debe indicar dónde vive
	if (!location) {
		return (
			<div className="mx-auto max-w-lg px-4 py-10">
				<Card>
					<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
						<span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
							<MapPin className="h-7 w-7 text-primary" />
						</span>
						<h2 className="text-xl font-bold">¿Dónde vives?</h2>
						<p className="text-sm text-muted-foreground">
							Para entregarte las encuestas correctas (regional, provincial y distrital) necesitamos
							saber tu provincia y distrito.
						</p>
						<Button asChild className="mt-2">
							<Link to="/">Seleccionar mi ubicación</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!ballots) return <PageLoader rows={5} />;

	if (mine.length === 0) {
		return (
			<div className="mx-auto max-w-md px-4 py-16 text-center">
				<h2 className="text-lg font-semibold">No hay encuestas abiertas esta semana</h2>
				<p className="mt-1 text-sm text-muted-foreground">Vuelve el lunes para la nueva jornada semanal.</p>
				<Button asChild className="mt-4">
					<Link to="/">Volver al inicio</Link>
				</Button>
			</div>
		);
	}

	// Jornada completa: ya votó todas sus encuestas de la semana
	if (done || allVoted) {
		return (
			<div className="mx-auto max-w-lg px-4 py-10">
				<Card>
					<CardContent className="flex flex-col items-center gap-3 p-8 text-center">
						<span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
							<CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
						</span>
						<h2 className="text-xl font-bold">¡Votos registrados!</h2>
						<p className="text-sm text-muted-foreground">
							Ya participaste en las {mine.length} encuestas de la semana en{' '}
							{locationLabel(location)}. Podrás votar de nuevo el lunes de la próxima semana si
							cambiaste de opinión.
						</p>
						<div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
							<Button asChild className="sm:flex-1">
								<Link to="/resultados">
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

	// Requiere sesión solo para confirmar el voto; las encuestas se pueden revisar antes
	const loggedIn = !authLoading && Boolean(user);

	const readyCount = pending.filter((b) => selections[b.id] !== undefined).length;

	return (
		<div className="mx-auto max-w-lg px-4 py-8">
			<div className="mb-6 text-center">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{formatDateRange(mine[0].startDate, mine[0].endDate)} · {locationLabel(location)}
				</p>
				<h1 className="mt-1 text-2xl font-bold tracking-tight">Tu jornada de voto</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Marca una opción en cada cédula y confirma todos tus votos.
				</p>
			</div>

			{note && (
				<div className="mb-5 flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
					<p>{note}</p>
				</div>
			)}

			<div className="space-y-8">
				{mine.map((ballot) => {
					const alreadyVoted = myVotes[ballot.id] !== undefined;
					const selectedId = alreadyVoted ? myVotes[ballot.id] : selections[ballot.id];
					return (
						<Card key={ballot.id} className="overflow-hidden">
							<div className="border-b bg-muted/40 px-5 py-3">
								<div className="flex items-center justify-between gap-2">
									<Badge variant={alreadyVoted ? 'secondary' : 'default'}>{LEVEL_BADGES[ballot.electionLevel]}</Badge>
									{alreadyVoted && (
										<span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
											<CheckCircle2 className="h-3.5 w-3.5" /> Ya votaste
										</span>
									)}
								</div>
								<h2 className="mt-1.5 text-base font-semibold leading-snug">{ballot.electionName}</h2>
							</div>
							<CardContent className="space-y-2.5 p-5">
								{ballot.candidates.map((c) => (
									<CandidateCard
										key={c.id}
										candidate={c}
										selected={selectedId === c.id}
										disabled={alreadyVoted}
										onSelect={(id) => setSelections((prev) => ({ ...prev, [ballot.id]: id }))}
									/>
								))}
							</CardContent>
						</Card>
					);
				})}
			</div>

			{loggedIn ? (
				<Button
					className="mt-8 w-full min-h-[52px] text-base"
					size="lg"
					disabled={readyCount === 0 || submitting}
					onClick={() => setConfirmOpen(true)}
				>
					{submitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
					<Vote className="mr-2 h-5 w-5" />
					Confirmar mis votos ({readyCount} de {pending.length})
				</Button>
			) : (
				<SignInButton className="mt-8 w-full min-h-[52px] text-base" size="lg" disabled={readyCount === 0}>
					<Vote className="mr-2 h-5 w-5" />
					Confirmar mis votos ({readyCount} de {pending.length})
				</SignInButton>
			)}
			<p className="mt-2 text-center text-xs text-muted-foreground">
				Se usa tu cuenta de Google solo para evitar votos duplicados.
			</p>

			{/* Confirmación del voto (irreversible esta semana) */}
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>¿Confirmas tus votos?</DialogTitle>
						<DialogDescription>
							Esta acción no se puede deshacer esta semana. Podrás cambiar tus votos recién el lunes
							próximo.
						</DialogDescription>
					</DialogHeader>
					<ul className="space-y-2 text-sm">
						{pending
							.filter((b) => selections[b.id] !== undefined)
							.map((b) => {
								const candidate = b.candidates.find((c) => c.id === selections[b.id]);
								return (
									<li key={b.id} className="flex items-baseline justify-between gap-2">
										<span className="text-muted-foreground">{b.electionName}</span>
										<span className="font-semibold">{candidate?.name}</span>
									</li>
								);
							})}
					</ul>
					<DialogFooter className="flex-col gap-2 sm:flex-col">
						<Button className="w-full" disabled={submitting} onClick={submitVotes}>
							{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Sí, confirmar mis votos
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

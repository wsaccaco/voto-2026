import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Radio, Users, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/PageLoader';
import { ResultBar } from '@/components/ResultBar';
import { ShareResults } from '@/components/ShareResults';
import { StatCard } from '@/components/StatCard';
import { VoteInvite } from '@/components/VoteInvite';
import { api } from '@/lib/api';
import type { SurveyDetail, SurveyResults } from '@/lib/types';
import { VOTES_THRESHOLD } from '@/lib/utils';

export default function Results() {
	const { id } = useParams();
	const [data, setData] = useState<SurveyResults | null>(null);
	const [error, setError] = useState(false);
	// Estado de la encuesta y voto propio: para la invitación a votar
	const [info, setInfo] = useState<{ survey: SurveyDetail; myVote: { candidateId: number } | null } | null>(null);

	useEffect(() => {
		let alive = true;
		const load = () =>
			api
				.get<SurveyResults>(`/results/${id}`)
				.then((d) => {
					if (!alive) return;
					setData(d);
					setError(false);
				})
				.catch(() => {
					if (alive) setError(true);
				});
		void load();
		const timer = setInterval(load, 10_000);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, [id]);

	useEffect(() => {
		api
			.get<{ survey: SurveyDetail; myVote: { candidateId: number } | null }>(`/surveys/${id}`)
			.then(setInfo)
			.catch(() => {
				/* información solo para la invitación; no bloquea los resultados */
			});
	}, [id]);

	if (error) {
		return (
			<div className="mx-auto max-w-md px-4 py-16 text-center">
				<h2 className="text-lg font-semibold">Resultados no disponibles</h2>
				<Button asChild variant="outline" className="mt-4">
					<Link to="/resultados">Volver</Link>
				</Button>
			</div>
		);
	}

	if (!data) return <PageLoader rows={6} />;

	const leader = data.results[0];
	// Invitar a votar solo si la encuesta está abierta y el usuario aún no votó
	const surveyOpen = info?.survey.status === 'abierta';
	const inviting = Boolean(surveyOpen && !info?.myVote);

	return (
		<div className="mx-auto max-w-2xl px-4 py-8">
			<Link
				to="/resultados"
				className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Todos los resultados
			</Link>

			<div className="mb-6">
				<p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					<Radio className="h-3.5 w-3.5 text-primary" /> En vivo · se actualiza cada 10 segundos
				</p>
				<h1 className="mt-1 text-2xl font-bold tracking-tight">Resultados de la encuesta</h1>
			</div>

			{/* CTA permanente: participar mientras la encuesta esté abierta */}
			{inviting && (
				<div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
					<div>
						<p className="text-sm font-semibold">Esta encuesta está abierta</p>
						<p className="text-sm text-muted-foreground">
							Tu opinión cuenta: vota y mira cómo cambian los resultados.
						</p>
					</div>
					<Button asChild className="shrink-0">
						<Link to="/votar">
							<Vote className="mr-2 h-4 w-4" /> Participar ahora
						</Link>
					</Button>
				</div>
			)}

			{/* Estadísticas */}
			<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
				{data.totalVotes > VOTES_THRESHOLD && <StatCard label="Votos totales" value={String(data.totalVotes)} />}
				<StatCard label="Candidatos" value={String(data.results.length)} />
				<StatCard
					label="Líder"
					value={leader ? `${leader.percent}%` : '—'}
					delta={data.results.length > 1 ? leader.percent - (data.results[1]?.percent ?? 0) : undefined}
				/>
			</div>

			{/* Barras por candidato */}
			<Card className="shadow-sm">
				<CardHeader>
					<CardTitle className="text-base">Preferencia de voto</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5">
					{data.results.map((r) => (
						<ResultBar key={r.candidateId} result={r} showVotes={data.totalVotes > VOTES_THRESHOLD} />
					))}
					{data.totalVotes === 0 && (
						<p className="py-6 text-center text-sm text-muted-foreground">
							Aún no hay votos en esta encuesta. ¡Sé el primero en votar!
						</p>
					)}
				</CardContent>
			</Card>

			<div className="mt-6 flex flex-col gap-2 sm:flex-row">
				<Button asChild className="h-12 flex-1 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm">
					<Link to="/comparativo">
						<BarChart3 className="mr-2 h-4 w-4" /> Ver evolución por semana
					</Link>
				</Button>
				{!inviting && (
					<Button asChild variant="outline" className="h-12 flex-1 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm">
						<Link to={`/encuesta/${id}`}>
							<Users className="mr-2 h-4 w-4" /> Ir a la encuesta
						</Link>
					</Button>
				)}
			</div>

			{/* Compartir en redes sociales o vía compartir nativo */}
			<ShareResults title={info?.survey.title ?? 'Encuesta'} data={data} />

			{/* Invitación automática (modal) una vez por semana electoral */}
			{info && (
				<VoteInvite
					surveys={surveyOpen ? [info.survey] : []}
					hasVoted={Boolean(info.myVote)}
					weekKey={info.survey.weekLabel}
				/>
			)}
		</div>
	);
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Radio, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/PageLoader';
import { ResultBar } from '@/components/ResultBar';
import { StatCard } from '@/components/StatCard';
import { api } from '@/lib/api';
import type { SurveyResults } from '@/lib/types';

export default function Results() {
	const { id } = useParams();
	const [data, setData] = useState<SurveyResults | null>(null);
	const [error, setError] = useState(false);

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

			{/* Estadísticas */}
			<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
				<StatCard label="Votos totales" value={String(data.totalVotes)} />
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
						<ResultBar key={r.candidateId} result={r} />
					))}
					{data.totalVotes === 0 && (
						<p className="py-6 text-center text-sm text-muted-foreground">
							Aún no hay votos en esta encuesta. ¡Sé el primero en votar!
						</p>
					)}
				</CardContent>
			</Card>

			<div className="mt-6 flex flex-col gap-2 sm:flex-row">
				<Button asChild className="flex-1">
					<Link to="/comparativo">
						<BarChart3 className="mr-2 h-4 w-4" /> Ver evolución por semana
					</Link>
				</Button>
				<Button asChild variant="outline" className="flex-1">
					<Link to={`/encuesta/${id}`}>
						<Users className="mr-2 h-4 w-4" /> Ir a la encuesta
					</Link>
				</Button>
			</div>
		</div>
	);
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Vote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLoader } from '@/components/PageLoader';
import { ResultBar } from '@/components/ResultBar';
import { api } from '@/lib/api';
import {
	cleanSurveyTitle,
	formatDateRange,
	getVotingLocation,
	visibleSurveys
} from '@/lib/elections';
import type { Survey, SurveyResults } from '@/lib/types';

type Filter = number | 'todas';

interface LiveRow extends Survey {
	results: SurveyResults | null;
	failed: boolean;
}

export default function ResultsIndex() {
	const [rows, setRows] = useState<LiveRow[] | null>(null);
	const [filter, setFilter] = useState<Filter>('todas');

	useEffect(() => {
		let alive = true;

		const loadAll = async () => {
			try {
				const { surveys } = await api.get<{ surveys: Survey[] }>('/surveys');
				const withResults = await Promise.all(
					surveys.map(async (s) => {
						try {
							const results = await api.get<SurveyResults>(`/results/${s.id}`);
							return { ...s, results, failed: false };
						} catch {
							return { ...s, results: null, failed: true };
						}
					})
				);
				if (alive) setRows(withResults);
			} catch {
				if (alive) setRows([]);
			}
		};

		void loadAll();
		const timer = setInterval(loadAll, 15_000);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, []);

	if (!rows) return <PageLoader rows={3} />;

	// Oculta las encuestas que no corresponden a la ubicación del usuario
	const forLocation = visibleSurveys(rows, getVotingLocation());
	// Elecciones únicas presentes, en orden de aparición (regional primero)
	const available = [...new Map(forLocation.map((r) => [r.electionId, r])).values()];
	const visible = filter === 'todas' ? forLocation : forLocation.filter((r) => r.electionId === filter);

	return (
		<div className="mx-auto max-w-3xl px-4 py-8">
			<div className="mb-6">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					En vivo · se actualiza cada 15 segundos
				</p>
				<h1 className="mt-1 text-2xl font-bold tracking-tight">Resultados de la semana</h1>
			</div>

			{/* Filtro por elección */}
			{available.length > 1 && (
				<div className="mb-6 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
					{(['todas', ...available.map((r) => r.electionId)] as Filter[]).map((t) => (
						<Button
							key={t}
							size="sm"
							variant={filter === t ? 'default' : 'ghost'}
							className="flex-1 sm:flex-none"
							onClick={() => setFilter(t)}
						>
							{t === 'todas' ? 'Todas' : available.find((r) => r.electionId === t)?.electionName}
						</Button>
					))}
				</div>
			)}

			<div className="space-y-4">
				{visible.map((row) => (
					<Card key={row.id} className="shadow-sm">
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between gap-2">
								<div>
									<CardTitle className="text-base leading-snug">
										{cleanSurveyTitle(row.title)}
									</CardTitle>
									<p className="mt-0.5 text-xs text-muted-foreground">
										{formatDateRange(row.startDate, row.endDate)}
									</p>
								</div>
								<Badge variant={row.status === 'abierta' ? 'default' : 'secondary'}>
									{row.status === 'abierta' ? 'Abierta' : 'Cerrada'}
								</Badge>
							</div>
						</CardHeader>
						<CardContent>
							{row.results && row.results.totalVotes > 0 ? (
								<div className="space-y-4">
									{row.results.results.map((r) => (
										<ResultBar key={r.candidateId} result={r} />
									))}
									<p className="text-xs text-muted-foreground">
										{row.results.totalVotes} voto(s) registrados
									</p>
								</div>
							) : row.failed ? (
								<p className="py-4 text-center text-sm text-muted-foreground">No se pudieron cargar los resultados.</p>
							) : (
								<div className="space-y-3">
									{Array.from({ length: 3 }).map((_, i) => (
										<Skeleton key={i} className="h-9 w-full" />
									))}
								</div>
							)}

							<div className="mt-4 flex gap-2">
								<Button asChild size="sm" className="flex-1" disabled={row.status !== 'abierta'}>
									<Link to={`/encuesta/${row.id}`}>
										<Vote className="mr-1.5 h-4 w-4" /> Votar
									</Link>
								</Button>
								<Button asChild size="sm" variant="outline" className="flex-1">
									<Link to={`/resultados/${row.id}`}>
										Detalle <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{visible.length === 0 && (
				<Card>
					<CardContent className="p-10 text-center text-sm text-muted-foreground">
						Aún no hay encuestas con resultados.
					</CardContent>
				</Card>
			)}

			<div className="mt-8 text-center">
				<Button asChild variant="outline">
					<Link to="/comparativo">
						<BarChart3 className="mr-2 h-4 w-4" /> Ver evolución histórica (comparativo)
					</Link>
				</Button>
			</div>
		</div>
	);
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Vote } from 'lucide-react';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table';
import { PageLoader } from '@/components/PageLoader';
import { api } from '@/lib/api';
import type { Candidate, ComparisonPoint } from '@/lib/types';
import { VOTES_THRESHOLD } from '@/lib/utils';

type Grouping = 'semanal' | 'quincenal' | 'mensual';

const GROUPINGS: { value: Grouping; label: string }[] = [
	{ value: 'semanal', label: 'Semanal' },
	{ value: 'quincenal', label: 'Quincenal' },
	{ value: 'mensual', label: 'Mensual' }
];

interface ElectionOption {
	id: number;
	label: string;
}

export default function Comparison() {
	const [elections, setElections] = useState<ElectionOption[]>([]);
	const [electionId, setElectionId] = useState<number | null>(null);
	const [grouping, setGrouping] = useState<Grouping>('semanal');
	const [data, setData] = useState<{ points: ComparisonPoint[]; candidates: Candidate[] } | null>(null);
	const [loading, setLoading] = useState(true);

	// Lista de elecciones desde las encuestas abiertas
	useEffect(() => {
		api
			.get<{ surveys: { electionId: number; electionName: string }[] }>('/surveys')
			.then(({ surveys }) => {
				const seen = new Map<number, string>();
				for (const s of surveys) {
					if (!seen.has(s.electionId)) seen.set(s.electionId, s.electionName);
				}
				const opts = Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
				setElections(opts);
				setElectionId((prev) => prev ?? opts[0]?.id ?? null);
			})
			.catch(() => setLoading(false));
	}, []);

	// Cargar comparativo
	useEffect(() => {
		if (!electionId) {
			setLoading(false);
			return;
		}
		setLoading(true);
		api
			.get<{ points: ComparisonPoint[]; candidates: Candidate[] }>(
				`/comparison?electionId=${electionId}&grouping=${grouping}`
			)
			.then((d) => {
				setData(d);
				setLoading(false);
			})
			.catch(() => {
				setData(null);
				setLoading(false);
			});
	}, [electionId, grouping]);

	const chartData = useMemo(() => {
		if (!data) return [];
		return data.points.map((p) => {
			const row: Record<string, number | string> = { label: p.label, totalVotes: p.totalVotes };
			for (const c of data.candidates) row[String(c.id)] = p.percents[c.id] ?? 0;
			return row;
		});
	}, [data]);

	const electionLabel = elections.find((e) => e.id === electionId)?.label ?? 'Elección';

	return (
		<div className="mx-auto max-w-5xl px-4 py-8">
			<Link
				to="/resultados"
				className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Resultados
			</Link>

			<div className="mb-6">
				<p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					<TrendingUp className="h-3.5 w-3.5 text-primary" /> Análisis histórico
				</p>
				<h1 className="mt-1 text-2xl font-bold tracking-tight">Evolución de la preferencia</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Compara el porcentaje de intención de voto entre semanas, quincenas o meses.
				</p>
			</div>

			{/* Controles */}
			<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
				<SearchableSelect
					value={electionId !== null ? String(electionId) : undefined}
					onValueChange={(v) => setElectionId(Number(v))}
					options={elections.map((e) => ({ value: String(e.id), label: e.label }))}
					placeholder="Selecciona una elección"
					searchPlaceholder="Buscar elección…"
					disabled={elections.length === 0}
					className="w-full sm:w-72"
				/>

				<div className="flex gap-1 rounded-lg bg-muted p-1">
					{GROUPINGS.map((g) => (
						<Button
							key={g.value}
							size="sm"
							variant={grouping === g.value ? 'default' : 'ghost'}
							className="flex-1 sm:flex-none"
							onClick={() => setGrouping(g.value)}
						>
							{g.label}
						</Button>
					))}
				</div>
			</div>

			{loading ? (
				<PageLoader rows={4} />
			) : !data || data.points.length === 0 ? (
				<Card>
					<CardContent className="p-10 text-center text-sm text-muted-foreground">
						Todavía no hay suficientes datos históricos para {electionLabel}. Los datos aparecerán cuando
						existan varias semanas con votos.
					</CardContent>
				</Card>
			) : (
				<>
					{/* Gráfico de líneas */}
					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle className="text-base">{electionLabel}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="h-72 w-full sm:h-80">
								<ResponsiveContainer width="100%" height="100%">
									<LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
										<XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
										<YAxis
											tick={{ fontSize: 12 }}
											stroke="var(--muted-foreground)"
											unit="%"
											domain={[0, 100]}
										/>
										<Tooltip
											formatter={(value, name) => [`${value ?? 0}%`, name]}
											labelFormatter={(label) => `Periodo: ${label}`}
										/>
										<Legend wrapperStyle={{ fontSize: 12 }} />
										{data.candidates.map((c) => (
											<Line
												key={c.id}
												type="monotone"
												dataKey={String(c.id)}
												name={c.name}
												stroke={c.partyColor ?? '#6366f1'}
												strokeWidth={2.5}
												dot={{ r: 3 }}
												connectNulls
											/>
										))}
									</LineChart>
								</ResponsiveContainer>
							</div>
						</CardContent>
					</Card>

					{/* Tabla comparativa */}
					<Card className="mt-6 shadow-sm">
						<CardHeader>
							<CardTitle className="text-base">Tabla comparativa (%)</CardTitle>
						</CardHeader>
						<CardContent className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Candidato</TableHead>
										{data.points.map((p) => (
											<TableHead key={p.surveyId} className="text-right">
												{p.label}
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.candidates.map((c) => (
										<TableRow key={c.id}>
											<TableCell className="font-medium">
												<span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.partyColor ?? '#6366f1' }} />
												{c.name}
											</TableCell>
											{data.points.map((p) => (
												<TableCell key={p.surveyId} className="text-right tabular-nums">
													{p.percents[c.id] ?? 0}%
												</TableCell>
											))}
										</TableRow>
									))}
									<TableRow>
										<TableCell className="text-muted-foreground">Votos totales</TableCell>
										{data.points.map((p) => (
											<TableCell key={p.surveyId} className="text-right tabular-nums text-muted-foreground">
												{p.totalVotes > VOTES_THRESHOLD ? p.totalVotes : '—'}
											</TableCell>
										))}
									</TableRow>
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</>
			)}

			<div className="mt-8 text-center">
				<Button asChild>
					<Link to="/votar">
						<Vote className="mr-2 h-4 w-4" /> Votar esta semana
					</Link>
				</Button>
			</div>
		</div>
	);
}

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoginPrompt } from '@/components/LoginPrompt';
import { PageLoader } from '@/components/PageLoader';
import { ResultBar } from '@/components/ResultBar';
import { StatCard } from '@/components/StatCard';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CandidateResult, SurveyResults } from '@/lib/types';

interface ElectionRow {
	id: number;
	name: string;
	type: string;
}

interface SurveyRow {
	id: number;
	electionId: number;
	weekNumber: number;
	status: 'borrador' | 'abierta' | 'cerrada';
	startDate: string;
	endDate: string;
}

interface Overview {
	totalUsers: number;
	totalVotes: number;
	openSurveys: SurveyRow[];
	elections: ElectionRow[];
}

interface DemoGroup {
	label: string;
	total: number;
	candidates: { candidateId: number; votes: number; percent: number }[];
}

interface AdminResults extends SurveyResults {
	demographics: { byAge: DemoGroup[]; bySex: DemoGroup[]; byDistrict: DemoGroup[] };
}

interface AdminResponse {
	id: number;
	votedAt: string;
	userEmail: string;
	userName: string | null;
	candidateId: number;
	fingerprint: string | null;
}

interface SuspiciousGroup {
	fingerprintHash: string;
	accounts: number;
	users: { id: number; email: string; name: string | null }[];
}

const STATUS_LABEL: Record<string, string> = { borrador: 'Borrador', abierta: 'Abierta', cerrada: 'Cerrada' };

function MiniBars({ groups, names }: { groups: DemoGroup[]; names: Map<number, string> }) {
	if (groups.length === 0) return <p className="text-xs text-muted-foreground">Sin datos (los votantes aún no completaron el perfil).</p>;
	return (
		<div className="space-y-3">
			{groups.map((g) => (
				<div key={g.label}>
					<p className="text-xs font-medium">
						{g.label} <span className="font-normal text-muted-foreground">· {g.total} votos</span>
					</p>
					<div className="mt-1 space-y-1">
						{g.candidates.map((cd) => (
							<div key={cd.candidateId} className="flex items-center gap-2 text-xs">
								<span className="w-32 truncate">{names.get(cd.candidateId) ?? `#${cd.candidateId}`}</span>
								<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary"
										style={{ width: `${Math.max(cd.percent, 2)}%` }}
									/>
								</div>
								<span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{cd.percent}%</span>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

export default function Admin() {
	const { user, loading } = useAuth();
	const [tab, setTab] = useState('resumen');

	const [overview, setOverview] = useState<Overview | null>(null);
	const [surveys, setSurveys] = useState<SurveyRow[]>([]);
	const [surveyId, setSurveyId] = useState<number | null>(null);
	const [detail, setDetail] = useState<AdminResults | null>(null);
	const [responses, setResponses] = useState<AdminResponse[]>([]);
	const [suspicious, setSuspicious] = useState<SuspiciousGroup[]>([]);
	const [busy, setBusy] = useState(false);

	const loadOverview = useCallback(() => {
		api
			.get<Overview>('/admin/overview')
			.then(setOverview)
			.catch(() => toast.error('No se pudo cargar el resumen'));
	}, []);

	const loadSurveys = useCallback(async () => {
		const { surveys: list } = await api.get<{ surveys: SurveyRow[] }>('/admin/surveys');
		setSurveys(list);
		if (surveyId === null && list.length > 0) setSurveyId(list[0].id);
	}, [surveyId]);

	const loadDetail = useCallback(async (id: number) => {
		const d = await api.get<AdminResults>(`/admin/results/${id}`);
		setDetail(d);
		const r = await api.get<{ responses: AdminResponse[] }>(`/admin/responses?surveyId=${id}`);
		setResponses(r.responses);
	}, []);

	useEffect(() => {
		if (!user?.isAdmin) return;
		loadOverview();
		void loadSurveys();
		api
			.get<{ suspicious: SuspiciousGroup[] }>('/admin/suspicious')
			.then((d) => setSuspicious(d.suspicious))
			.catch(() => {});
	}, [user?.isAdmin, loadOverview, loadSurveys]);

	useEffect(() => {
		if (user?.isAdmin && surveyId !== null) void loadDetail(surveyId);
	}, [user?.isAdmin, surveyId, loadDetail]);

	const setStatus = async (id: number, status: SurveyRow['status']) => {
		setBusy(true);
		try {
			await api.post(`/admin/surveys/${id}/status`, { status });
			toast.success('Estado actualizado');
			loadOverview();
			await loadSurveys();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'Error al actualizar');
		} finally {
			setBusy(false);
		}
	};

	const roll = async () => {
		setBusy(true);
		try {
			await api.post('/admin/surveys/roll');
			toast.success('Ciclo semanal ejecutado');
			loadOverview();
			await loadSurveys();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'Error en el ciclo');
		} finally {
			setBusy(false);
		}
	};

	const voidVote = async (id: number) => {
		if (!window.confirm('¿Anular este voto? Esta acción es irreversible.')) return;
		try {
			await api.del(`/admin/responses/${id}`);
			toast.success('Voto anulado');
			if (surveyId !== null) void loadDetail(surveyId);
			loadOverview();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'Error al anular');
		}
	};

	if (loading) return <PageLoader rows={5} />;

	if (!user) return <LoginPrompt title="Acceso restringido a administradores" />;

	if (!user.isAdmin) {
		return (
			<div className="mx-auto max-w-md px-4 py-16 text-center">
				<ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
				<h2 className="mt-3 text-lg font-semibold">Sin permisos</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Tu cuenta no está autorizada para ver el panel de administración.
				</p>
			</div>
		);
	}

	const electionName = (id: number) => overview?.elections.find((e) => e.id === id)?.name ?? `Elección #${id}`;
	const candidateName = new Map(detail?.results.map((r) => [r.candidateId, r.name] as const) ?? []);

	return (
		<div className="mx-auto max-w-5xl px-4 py-8">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						<ShieldCheck className="h-3.5 w-3.5 text-primary" /> Solo administradores
					</p>
					<h1 className="mt-1 text-2xl font-bold tracking-tight">Panel de administración</h1>
				</div>
				<Button variant="outline" size="sm" onClick={roll} disabled={busy}>
					<RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Ciclo semanal
				</Button>
			</div>

			<Tabs value={tab} onValueChange={setTab}>
				<TabsList className="mb-4">
					<TabsTrigger value="resumen">Resumen</TabsTrigger>
					<TabsTrigger value="encuestas">Encuestas</TabsTrigger>
					<TabsTrigger value="antifraude">Antifraude</TabsTrigger>
				</TabsList>

				{/* Resumen */}
				<TabsContent value="resumen">
					<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
						<StatCard label="Usuarios" value={overview ? String(overview.totalUsers) : '…'} />
						<StatCard label="Votos totales" value={overview ? String(overview.totalVotes) : '…'} />
						<StatCard label="Encuestas abiertas" value={overview ? String(overview.openSurveys.length) : '…'} />
						<StatCard label="Elecciones" value={overview ? String(overview.elections.length) : '…'} />
					</div>

					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle className="text-base">Encuestas de la semana</CardTitle>
						</CardHeader>
						<CardContent>
							{overview?.openSurveys.length ? (
								<div className="divide-y">
									{overview.openSurveys.map((s) => (
										<div key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
											<div>
												<p className="font-medium">{electionName(s.electionId)}</p>
												<p className="text-xs text-muted-foreground">Semana {s.weekNumber}</p>
											</div>
											<div className="flex items-center gap-2">
												<Badge>{STATUS_LABEL[s.status]}</Badge>
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														setTab('encuestas');
														setSurveyId(s.id);
													}}
												>
													Ver
												</Button>
											</div>
										</div>
									))}
								</div>
							) : (
								<p className="py-4 text-center text-sm text-muted-foreground">No hay encuestas abiertas.</p>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* Encuestas: resultados + demografía + votos */}
				<TabsContent value="encuestas">
					<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
						<Select
							value={surveyId !== null ? String(surveyId) : undefined}
							onValueChange={(v) => setSurveyId(Number(v))}
						>
							<SelectTrigger className="w-full sm:w-80">
								<SelectValue placeholder="Selecciona una encuesta" />
							</SelectTrigger>
							<SelectContent>
								{surveys.map((s) => (
									<SelectItem key={s.id} value={String(s.id)}>
										Semana {s.weekNumber} · {electionName(s.electionId)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{surveyId !== null && detail && (
							<>
								<div className="flex gap-2">
									<Button
										variant={detail.results.length ? 'secondary' : 'default'}
										size="sm"
										disabled={busy}
										onClick={() => setStatus(surveyId, detail.results.length ? 'cerrada' : 'abierta')}
									>
										{detail.results.length ? 'Cerrar encuesta' : 'Abrir encuesta'}
									</Button>
									<Button asChild variant="outline" size="sm">
										<a href={`/api/admin/export/${surveyId}.csv`} download>
											<Download className="mr-1.5 h-4 w-4" /> Exportar CSV
										</a>
									</Button>
								</div>
							</>
						)}
					</div>

					{!detail ? (
						<Card>
							<CardContent className="p-10 text-center text-sm text-muted-foreground">
								Selecciona una encuesta para ver sus resultados.
							</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							<Card className="shadow-sm">
								<CardHeader>
									<CardTitle className="text-base">Resultados · {detail.totalVotes} votos</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{detail.results.map((r: CandidateResult) => (
										<ResultBar key={r.candidateId} result={r} />
									))}
								</CardContent>
							</Card>

							<div className="grid gap-4 lg:grid-cols-2">
								<Card className="shadow-sm">
									<CardHeader>
										<CardTitle className="text-base">Por edad</CardTitle>
									</CardHeader>
									<CardContent>
										<MiniBars groups={detail.demographics.byAge} names={candidateName} />
									</CardContent>
								</Card>
								<Card className="shadow-sm">
									<CardHeader>
										<CardTitle className="text-base">Por sexo</CardTitle>
									</CardHeader>
									<CardContent>
										<MiniBars groups={detail.demographics.bySex} names={candidateName} />
									</CardContent>
								</Card>
								<Card className="shadow-sm lg:col-span-2">
									<CardHeader>
										<CardTitle className="text-base">Por distrito / ubicación</CardTitle>
									</CardHeader>
									<CardContent>
										<MiniBars groups={detail.demographics.byDistrict} names={candidateName} />
									</CardContent>
								</Card>
							</div>

							<Card className="shadow-sm">
								<CardHeader>
									<CardTitle className="text-base">Votos individuales ({responses.length})</CardTitle>
								</CardHeader>
								<CardContent className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Votante</TableHead>
												<TableHead>Candidato</TableHead>
												<TableHead>Fecha</TableHead>
												<TableHead className="text-right">Acción</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{responses.map((r) => (
												<TableRow key={r.id}>
													<TableCell>
														<p className="font-medium">{r.userName ?? '—'}</p>
														<p className="text-xs text-muted-foreground">{r.userEmail}</p>
													</TableCell>
													<TableCell>{candidateName.get(r.candidateId) ?? `#${r.candidateId}`}</TableCell>
													<TableCell className="text-xs text-muted-foreground">
														{new Date(r.votedAt).toLocaleString('es-PE')}
													</TableCell>
													<TableCell className="text-right">
														<Button variant="ghost" size="icon" onClick={() => voidVote(r.id)} aria-label="Anular voto">
															<Trash2 className="h-4 w-4 text-red-500" />
														</Button>
													</TableCell>
												</TableRow>
											))}
											{responses.length === 0 && (
												<TableRow>
													<TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
														Sin votos registrados.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						</div>
					)}
				</TabsContent>

				{/* Antifraude */}
				<TabsContent value="antifraude">
					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle className="text-base">Dispositivos compartidos (posibles cuentas múltiples)</CardTitle>
						</CardHeader>
						<CardContent className="overflow-x-auto">
							{suspicious.length === 0 ? (
								<p className="py-6 text-center text-sm text-muted-foreground">
									No se detectaron fingerprints de dispositivo compartidos entre varias cuentas. 🎉
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Huella</TableHead>
											<TableHead>Cuentas</TableHead>
											<TableHead>Usuarios</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{suspicious.map((g) => (
											<TableRow key={g.fingerprintHash}>
												<TableCell className="font-mono text-xs">{g.fingerprintHash}…</TableCell>
												<TableCell>
													<Badge variant="destructive">{g.accounts}</Badge>
												</TableCell>
												<TableCell>
													{g.users.map((u) => (
														<p key={u.id} className="text-sm">
															{u.name ?? '—'} <span className="text-xs text-muted-foreground">({u.email})</span>
														</p>
													))}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
					<p className="mt-3 text-xs text-muted-foreground">
						Consejo: revisa los votos de estas cuentas en la pestaña Encuestas y anula los que parezcan duplicados.
					</p>
				</TabsContent>
			</Tabs>
		</div>
	);
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Check, Info, MapPin, Vote } from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/PageLoader';
import { api } from '@/lib/api';
import {
	capitalNote,
	clearVotingLocation,
	formatDateRange,
	getVotingLocation,
	groupByElection,
	locationLabel,
	setVotingLocation,
	visibleSurveys,
	type VotingLocation
} from '@/lib/elections';
import { REGION_NAME } from '@/lib/geo';
import type { Survey } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Card de encuesta con una sola fecha y sin información repetida. */
function SurveyCard({ s }: { s: Survey }) {
	const open = s.status === 'abierta';
	return (
		<Card className={cn('shadow-sm transition-shadow hover:shadow', !open && 'opacity-75')}>
			<CardContent className="p-5">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Encuesta semanal
					</p>
					<Badge variant={open ? 'default' : 'secondary'}>{open ? 'Abierta' : 'Cerrada'}</Badge>
				</div>
				<h3 className="mt-1 text-lg font-semibold leading-snug">{formatDateRange(s.startDate, s.endDate)}</h3>
				<div className="mt-4 flex gap-2">
					<Button asChild size="sm" className="flex-1" disabled={!open}>
						<Link to={`/encuesta/${s.id}`}>
							<Vote className="mr-1.5 h-4 w-4" /> Votar
						</Link>
					</Button>
					<Button asChild size="sm" variant="outline" className="flex-1">
						<Link to={`/resultados/${s.id}`}>
							Resultados <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export default function Home() {
	const [data, setData] = useState<{ surveys: Survey[]; week: { position: number; total: number } | null } | null>(null);
	const [error, setError] = useState(false);
	const [location, setLocation] = useState<VotingLocation | null>(() => getVotingLocation());
	const [viewAll, setViewAll] = useState(false);

	useEffect(() => {
		api
			.get<{ surveys: Survey[]; week: { position: number; total: number } | null }>('/surveys')
			.then(setData)
			.catch(() => setError(true));
	}, []);

	if (error) {
		return (
			<div className="mx-auto max-w-md px-4 py-16 text-center">
				<h2 className="text-lg font-semibold">No pudimos cargar las encuestas</h2>
				<p className="mt-1 text-sm text-muted-foreground">Intenta de nuevo en unos segundos.</p>
			</div>
		);
	}

	if (!data) return <PageLoader rows={3} />;

	const surveys = data.surveys;
	const needsLocation = !location && !viewAll;
	const visible = viewAll ? surveys : visibleSurveys(surveys, location);
	const now = new Date();
	const openThisWeek = visible.filter((s) => s.status === 'abierta' && new Date(s.endDate) >= now);
	const note = location ? capitalNote(location) : null;

	const choose = (loc: VotingLocation) => {
		setVotingLocation(loc);
		setLocation(loc);
		setViewAll(false);
	};

	const resetLocation = () => {
		clearVotingLocation();
		setLocation(null);
		setViewAll(false);
	};

	return (
		<div className="mx-auto max-w-5xl px-4 py-8">
			{/* Hero */}
			<section className="mb-10 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-10">
				{data.week && (
					<Badge className="mb-3">
						Semana {data.week.position}/{data.week.total}
					</Badge>
				)}
				<h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
					¿A quién elegirías hoy en {REGION_NAME}?
				</h1>
				<p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
					Cada semana abrimos nuevas encuestas para conocer la preferencia electoral en la región.
					Cuéntanos dónde vives y recibirás tus encuestas: gobierno regional, alcaldía provincial y,
					si tu distrito no es capital provincial, alcaldía distrital. Tu voto es anónimo y puedes
					actualizarlo cada semana.
				</p>
				<Link to="/resultados">
					<Button variant="secondary" className="mt-6">
						<BarChart3 className="mr-2 h-4 w-4" /> Ver resultados en tiempo real
					</Button>
				</Link>
			</section>

			{/* Selección inicial: dónde vive el elector */}
			{needsLocation ? (
				<section>
					<div className="mb-4">
						<h2 className="text-xl font-bold tracking-tight">¿Dónde vives?</h2>
						<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
							Todos los electores de {REGION_NAME} votan por el Gobierno Regional. Según tu
							provincia y distrito también recibirás la encuesta de tu alcaldía provincial y distrital.
						</p>
					</div>
					<LocationPicker onPick={choose} />
					<div className="mt-4 text-center">
						<button
							type="button"
							onClick={() => setViewAll(true)}
							className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							Solo quiero ver todas las encuestas sin filtrar
						</button>
					</div>
				</section>
			) : (
				<section className="space-y-8">
					{/* Barra de contexto: ubicación y controles */}
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3">
						{location ? (
							<p className="flex items-center text-sm">
								<Check className="mr-1.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
								{viewAll ? (
									<>Viendo todas las encuestas · vives en <strong className="ml-1">{locationLabel(location)}</strong></>
								) : (
									<>Vives en <strong className="ml-1">{locationLabel(location)}</strong></>
								)}
							</p>
						) : (
							<p className="text-sm text-muted-foreground">Todas las encuestas</p>
						)}
						<div className="flex gap-1.5">
							{location && (
								<Button variant="ghost" size="sm" onClick={() => setViewAll((v) => !v)}>
									{viewAll ? 'Ver solo mis encuestas' : 'Ver todas'}
								</Button>
							)}
							<Button variant="outline" size="sm" onClick={resetLocation}>
								<MapPin className="mr-1.5 h-3.5 w-3.5" /> Cambiar ubicación
							</Button>
						</div>
					</div>

					{/* Aviso para capitales provinciales */}
					{note && !viewAll && (
						<div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm">
							<Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
							<p>{note}</p>
						</div>
					)}

					{/* CTA principal: votar todas las encuestas de la semana */}
					{location && !viewAll && openThisWeek.length > 0 && (
						<Button asChild size="lg" className="w-full min-h-[52px] text-base sm:w-auto">
							<Link to="/votar">
								<Vote className="mr-2 h-5 w-5" />
								Votar esta semana ({openThisWeek.length} {openThisWeek.length === 1 ? 'encuesta' : 'encuestas'})
							</Link>
						</Button>
					)}

					{groupByElection(visible).map((group) => (
						<div key={group.electionId}>
							<div className="mb-3 flex items-center gap-2">
								<h2 className="text-lg font-semibold">{group.name}</h2>
								<Badge variant="outline">{group.surveys.length} encuesta(s)</Badge>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								{group.surveys.map((s) => (
									<SurveyCard key={s.id} s={s} />
								))}
							</div>
						</div>
					))}

					{visible.length === 0 && (
						<Card>
							<CardContent className="p-10 text-center">
								<p className="text-sm text-muted-foreground">
									Aún no hay encuestas abiertas. ¡Vuelve pronto!
								</p>
							</CardContent>
						</Card>
					)}
				</section>
			)}
		</div>
	);
}

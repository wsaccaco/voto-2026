import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Check, Info, MapPin, Vote } from 'lucide-react';
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
import { APURIMAC_PROVINCES, districtsOf, REGION_NAME } from '@/lib/geo';
import type { Survey } from '@/lib/types';
import { cn } from '@/lib/utils';

function isoWeekNumber(d: Date) {
	const start = new Date(d.getFullYear(), 0, 1);
	const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
	return Math.ceil((days + start.getDay() + 1) / 7);
}

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

/** Selección en cascada: primero la provincia, luego el distrito. */
function LocationPicker({ onPick }: { onPick: (loc: VotingLocation) => void }) {
	const [province, setProvince] = useState<string | null>(null);
	const districts = districtsOf(province);

	if (!province) {
		return (
			<div className="grid gap-3 sm:grid-cols-2">
				{APURIMAC_PROVINCES.map((p) => (
					<button
						key={p.name}
						type="button"
						onClick={() => setProvince(p.name)}
						className="group rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
							<MapPin className="h-5 w-5 text-primary" />
						</span>
						<h3 className="font-semibold leading-snug">Provincia de {p.name}</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							{p.districts.length} distritos · capital: {p.capital}
						</p>
						<span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
							Vivo aquí
							<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
						</span>
					</button>
				))}
			</div>
		);
	}

	return (
		<div>
			<div className="mb-3 flex items-center justify-between gap-2">
				<p className="text-sm text-muted-foreground">
					Provincia de <strong className="text-foreground">{province}</strong> · ¿en qué distrito vives?
				</p>
				<Button variant="ghost" size="sm" onClick={() => setProvince(null)}>
					Cambiar provincia
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{districts.map((d) => (
					<button
						key={d}
						type="button"
						onClick={() => onPick({ province, district: d })}
						className={cn(
							'min-h-[48px] rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors',
							'hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
						)}
					>
						{d}
						{d === APURIMAC_PROVINCES.find((p) => p.name === province)?.capital && (
							<span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">capital provincial</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
}

export default function Home() {
	const [surveys, setSurveys] = useState<Survey[] | null>(null);
	const [error, setError] = useState(false);
	const [location, setLocation] = useState<VotingLocation | null>(() => getVotingLocation());
	const [viewAll, setViewAll] = useState(false);

	useEffect(() => {
		api
			.get<{ surveys: Survey[] }>('/surveys')
			.then((d) => setSurveys(d.surveys))
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

	if (!surveys) return <PageLoader rows={3} />;

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
				<Badge className="mb-3">Semana {isoWeekNumber(new Date())}</Badge>
				<h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
					¿A quién elegirías hoy en {REGION_NAME}?
				</h1>
				<p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
					Cada semana abrimos nuevas encuestas para conocer la preferencia electoral en la región.
					Cuéntanos dónde vives y recibirás tus cédulas: gobierno regional, alcaldía provincial y,
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
							provincia y distrito también recibirás la cédula de tu alcaldía provincial y distrital.
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

					{/* CTA principal: votar todas las cédulas de la semana */}
					{location && !viewAll && openThisWeek.length > 0 && (
						<Button asChild size="lg" className="w-full min-h-[52px] text-base sm:w-auto">
							<Link to="/votar">
								<Vote className="mr-2 h-5 w-5" />
								Votar esta semana ({openThisWeek.length} {openThisWeek.length === 1 ? 'cédula' : 'cédulas'})
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

import { useEffect, useState } from 'react';
import { ArrowRight, LocateFixed, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { orderedDistricts, type VotingLocation } from '@/lib/elections';
import { APURIMAC_PROVINCES, nearestDistrict } from '@/lib/geo';
import { cn } from '@/lib/utils';

/** Caché en memoria del ranking de distritos por votos (TTL 60 s). */
const ACTIVITY_TTL_MS = 60_000;
let activityCache: { at: number; data: Record<string, number> } | null = null;

async function loadActivity(): Promise<Record<string, number> | null> {
	const now = Date.now();
	if (activityCache && now - activityCache.at < ACTIVITY_TTL_MS) return activityCache.data;
	try {
		const { activity } = await api.get<{ activity: { district: string; votes: number }[] }>('/districts/activity');
		const data: Record<string, number> = {};
		for (const a of activity) data[a.district] = a.votes;
		activityCache = { at: now, data };
		return data;
	} catch {
		return null; // degradación silenciosa: se mantiene el orden del catálogo
	}
}

/** Selección en cascada: primero la provincia, luego el distrito. */
export function LocationPicker({ onPick }: { onPick: (loc: VotingLocation) => void }) {
	const [province, setProvince] = useState<string | null>(null);
	// Ranking de distritos por votos de su cédula distrital (opcional)
	const [activity, setActivity] = useState<Record<string, number> | null>(null);
	const [locating, setLocating] = useState(false);
	const districts = orderedDistricts(province, activity);

	useEffect(() => {
		let alive = true;
		void loadActivity().then((data) => {
			if (alive) setActivity(data);
		});
		return () => {
			alive = false;
		};
	}, []);

	/** Autoselección por GPS: centroide más cercano dentro de Apurímac. */
	const locate = () => {
		if (!('geolocation' in navigator)) {
			toast.info('Tu navegador no soporta ubicación. Elige tu provincia y distrito manualmente.');
			return;
		}
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setLocating(false);
				const loc = nearestDistrict(pos.coords.latitude, pos.coords.longitude);
				if (!loc) {
					toast.info('No detectamos tu ubicación dentro de Apurímac. Elige tu provincia y distrito.');
					return;
				}
				onPick(loc);
			},
			() => {
				setLocating(false);
				toast.info('No pudimos obtener tu ubicación. Puedes elegir tu provincia y distrito manualmente.');
			},
			{ timeout: 10_000 }
		);
	};

	if (!province) {
		return (
			<div>
				<div className="mb-4 flex justify-center">
					<Button variant="outline" size="sm" onClick={locate} disabled={locating}>
						{locating ? (
							<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
						) : (
							<LocateFixed className="mr-1.5 h-4 w-4" />
						)}
						{locating ? 'Buscando…' : 'Usar mi ubicación'}
					</Button>
				</div>
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

import { useState } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VotingLocation } from '@/lib/elections';
import { APURIMAC_PROVINCES, districtsOf } from '@/lib/geo';
import { cn } from '@/lib/utils';

/** Selección en cascada: primero la provincia, luego el distrito. */
export function LocationPicker({ onPick }: { onPick: (loc: VotingLocation) => void }) {
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

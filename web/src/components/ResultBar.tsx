import { useState } from 'react';
import { partyLogoSrc } from '@/lib/party-logos';
import type { CandidateResult } from '@/lib/types';

export function ResultBar({ result, showVotes }: { result: CandidateResult; showVotes?: boolean }) {
	const color = result.partyColor ?? '#64748b';
	// Las opciones especiales (Indeciso, Voto en blanco) no tienen partido ni
	// logo: punto de color directo, sin pedir /api/party-logo (evita 404s).
	const hasParty = !result.isSpecial;
	// Si el partido no tiene logo (404 del servidor), caer al punto de color.
	const [logoError, setLogoError] = useState(false);
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between gap-2 text-sm">
				<div className="flex min-w-0 items-center gap-2">
					{hasParty && !logoError ? (
						<img
							src={partyLogoSrc(result.party, result.name)}
							alt={result.party ?? result.name}
							width={36}
							height={36}
							loading="lazy"
							onError={() => setLogoError(true)}
							className="h-9 w-9 shrink-0 rounded-md object-contain"
						/>
					) : (
						<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
					)}
					<span className="truncate font-medium">{result.name}</span>
					{result.isSpecial && (
						<span className="hidden text-xs text-muted-foreground sm:inline">({result.party ?? 'opción'})</span>
					)}
				</div>
				<span className="shrink-0 tabular-nums text-muted-foreground">
					<span className="font-semibold text-foreground">{result.percent}%</span>
					{showVotes && <span> · {result.votes}</span>}
				</span>
			</div>
			<div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full transition-all duration-700"
					style={{ width: `${result.percent}%`, backgroundColor: color }}
				/>
			</div>
		</div>
	);
}

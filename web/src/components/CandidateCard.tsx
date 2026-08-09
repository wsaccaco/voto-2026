import { Check } from 'lucide-react';
import type { Candidate } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
	candidate: Candidate;
	selected: boolean;
	disabled?: boolean;
	onSelect: (id: number) => void;
}

export function CandidateCard({ candidate, selected, disabled, onSelect }: Props) {
	const color = candidate.partyColor ?? '#64748b';
	const initials = candidate.name
		.split(' ')
		.slice(0, 2)
		.map((p) => p[0])
		.join('')
		.toUpperCase();

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onSelect(candidate.id)}
			className={cn(
				'group relative flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all',
				'min-h-[64px] active:scale-[0.99]',
				selected
					? 'border-primary ring-2 ring-primary/30'
					: 'border-border hover:border-primary/50 hover:shadow-sm',
				disabled && 'cursor-not-allowed opacity-60'
			)}
			style={selected ? { borderColor: color } : undefined}
		>
			{/* Foto cuadrada con esquinas ligeras: el recorte circular pierde el rostro */}
			{candidate.photoUrl ? (
				<img
					src={candidate.photoUrl}
					alt={candidate.name}
					className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
					loading="lazy"
				/>
			) : (
				<span
					className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
					style={{ backgroundColor: color }}
				>
					{initials}
				</span>
			)}

			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold leading-tight">{candidate.name}</p>
				{candidate.party && (
					<p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
						{candidate.partyLogoUrl && (
							<img
								src={candidate.partyLogoUrl}
								alt={candidate.party}
								className="h-5 w-5 shrink-0 rounded-md border border-border object-contain"
								loading="lazy"
							/>
						)}
						<span className="truncate">{candidate.party}</span>
					</p>
				)}
			</div>

			<span
				className={cn(
					'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
					selected ? 'border-transparent text-white' : 'border-border text-transparent'
				)}
				style={selected ? { backgroundColor: color } : undefined}
			>
				<Check className="h-4 w-4" />
			</span>
		</button>
	);
}

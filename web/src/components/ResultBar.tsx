import type { CandidateResult } from '@/lib/types';

export function ResultBar({ result }: { result: CandidateResult }) {
	const color = result.partyColor ?? '#64748b';
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between gap-2 text-sm">
				<div className="flex min-w-0 items-center gap-2">
					<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
					<span className="truncate font-medium">{result.name}</span>
					{result.isSpecial && (
						<span className="hidden text-xs text-muted-foreground sm:inline">({result.party ?? 'opción'})</span>
					)}
				</div>
				<span className="shrink-0 tabular-nums text-muted-foreground">
					<span className="font-semibold text-foreground">{result.percent}%</span> · {result.votes}
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

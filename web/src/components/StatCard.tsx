import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
	label: string;
	value: string;
	delta?: number; // puntos porcentuales respecto al periodo anterior
}

export function StatCard({ label, value, delta }: Props) {
	const up = typeof delta === 'number' && delta > 0;
	const down = typeof delta === 'number' && delta < 0;
	return (
		<Card className="shadow-sm">
			<CardContent className="p-4">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
				<div className="mt-1 flex items-baseline gap-2">
					<span className="text-2xl font-bold tabular-nums">{value}</span>
					{typeof delta === 'number' && delta !== 0 && (
						<span
							className={cn(
								'flex items-center gap-0.5 text-xs font-semibold',
								up && 'text-emerald-600 dark:text-emerald-400',
								down && 'text-red-600 dark:text-red-400'
							)}
						>
							{up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
							{delta > 0 ? '+' : ''}
							{delta.toFixed(1)}
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

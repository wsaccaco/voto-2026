import { Skeleton } from '@/components/ui/skeleton';

export function PageLoader({ rows = 4 }: { rows?: number }) {
	return (
		<div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
			<Skeleton className="h-8 w-2/3 max-w-sm" />
			<Skeleton className="h-4 w-1/3 max-w-xs" />
			<div className="grid gap-3">
				{Array.from({ length: rows }).map((_, i) => (
					<Skeleton key={i} className="h-20 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}

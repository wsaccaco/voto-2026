import { createHash } from 'node:crypto';

/** Hash SHA-256 (se usa para anonimizar IPs; nunca guardamos la IP cruda). */
export function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/**
 * Rate limiter simple en memoria (ventana deslizante).
 * Suficiente para un VPS de una sola instancia.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const entries = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
	if (entries.length >= limit) {
		buckets.set(key, entries);
		return false; // límite excedido
	}
	entries.push(now);
	buckets.set(key, entries);
	return true;
}

// Limpieza periódica para evitar crecimiento indefinido de memoria
setInterval(() => {
	const now = Date.now();
	for (const [key, entries] of buckets) {
		const fresh = entries.filter((t) => now - t < 5 * 60_000);
		if (fresh.length === 0) buckets.delete(key);
		else buckets.set(key, fresh);
	}
}, 5 * 60_000).unref();

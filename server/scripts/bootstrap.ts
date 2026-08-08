import 'dotenv/config';
import { db, sql } from '../src/db/index.js';
import { elections } from '../src/db/schema.js';
import { runMigrations } from './migrate.js';
import { importAllElections } from './import-jne.js';

if (!process.env.DATABASE_URL) {
	console.error('Falta DATABASE_URL');
	process.exit(1);
}

// 1) Estructura de tablas (siempre)
await runMigrations();

// 2) Datos iniciales: solo si la BD está vacía (evita re-importar en cada deploy)
const existing = await db.select().from(elections);
if (existing.length === 0) {
	console.log('[bootstrap] No hay elecciones: importando datos del JNE...');
	try {
		await importAllElections();
	} catch (err) {
		console.error('[bootstrap] La importación del JNE falló; el servidor arrancará igual:', err instanceof Error ? err.message : err);
	}
} else {
	console.log(`[bootstrap] Ya hay ${existing.length} elecciones; se omite la importación.`);
}
await sql.end();

// 3) Arrancar el servidor (dist compilado, sin declaraciones de tipos)
console.log('[bootstrap] Arrancando el servidor...');
await import(/* @vite-ignore */ '../dist/index.js' as string);

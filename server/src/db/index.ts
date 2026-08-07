import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL no está definida en las variables de entorno');
}

// postgres-js: un solo pool de conexiones para toda la app
export const sql = postgres(connectionString, {
	max: Number(process.env.DB_POOL_MAX ?? 10),
	onnotice: () => {} // silencia notices de PostgreSQL
});

export const db = drizzle(sql, { schema });

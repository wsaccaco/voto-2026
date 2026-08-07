import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error('Falta DATABASE_URL');
	process.exit(1);
}

// Conexión dedicada para migraciones (max: 1)
const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

console.log('Aplicando migraciones...');
await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
console.log('Migraciones aplicadas correctamente.');

await sql.end();

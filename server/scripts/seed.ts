import 'dotenv/config';
import { db, sql } from '../src/db/index.js';
import { candidates, elections } from '../src/db/schema.js';
import { ensureWeeklyCycle } from '../src/lib/surveys.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error('Falta DATABASE_URL');
	process.exit(1);
}

async function seed() {
	const existing = await db.select().from(elections);
	if (existing.length > 0) {
		console.log('Ya existen elecciones; no se siembran datos de nuevo.');
		return;
	}
	// Elecciones 2026 (candidatos FICTICIOS de prueba)
	const [alcaldia] = await db
		.insert(elections)
		.values({
			type: 'alcaldia',
			level: 'provincial',
			name: 'Alcaldía Provincial de Andahuaylas',
			province: 'Andahuaylas',
			year: 2026
		})
		.returning();
	const [regional] = await db
		.insert(elections)
		.values({
			type: 'gobierno_regional',
			level: 'regional',
			name: 'Gobierno Regional de Apurímac',
			year: 2026
		})
		.returning();

	await db.insert(candidates).values([
		// Alcaldía — candidatos ficticios
		{ electionId: alcaldia.id, name: 'María Quispe Huamán', party: 'Fuerza Andina', partyColor: '#2563eb', sortOrder: 1 },
		{ electionId: alcaldia.id, name: 'José Antonio Ríos', party: 'Movimiento Chanka', partyColor: '#dc2626', sortOrder: 2 },
		{ electionId: alcaldia.id, name: 'Rosa Mendoza Paredes', party: 'Unidad por Andahuaylas', partyColor: '#16a34a', sortOrder: 3 },
		{ electionId: alcaldia.id, name: 'Pedro Ccahua Soto', party: 'Renovación Popular Andina', partyColor: '#f59e0b', sortOrder: 4 },
		{ electionId: alcaldia.id, name: 'Indeciso', party: null, partyColor: '#94a3b8', isSpecial: true, sortOrder: 98 },
		{ electionId: alcaldia.id, name: 'Voto en blanco', party: null, partyColor: '#cbd5e1', isSpecial: true, sortOrder: 99 },
		// Gobierno regional — candidatos ficticios
		{ electionId: regional.id, name: 'Luis Puma Vargas', party: 'Apurímac Avanza', partyColor: '#7c3aed', sortOrder: 1 },
		{ electionId: regional.id, name: 'Carmen Ayala Torres', party: 'Frente Regional', partyColor: '#0891b2', sortOrder: 2 },
		{ electionId: regional.id, name: 'Miguel Huanca Roca', party: 'Somos Apurímac', partyColor: '#ea580c', sortOrder: 3 },
		{ electionId: regional.id, name: 'Indeciso', party: null, partyColor: '#94a3b8', isSpecial: true, sortOrder: 98 },
		{ electionId: regional.id, name: 'Voto en blanco', party: null, partyColor: '#cbd5e1', isSpecial: true, sortOrder: 99 }
	]);

	console.log('Elecciones y candidatos ficticios creados.');

	// Crear la encuesta de la semana actual
	await ensureWeeklyCycle();
	console.log('Encuesta de la semana actual creada.');
}

await seed();
await sql.end();
process.exit(0);

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { candidates } from '../src/db/schema.js';

// ---------------------------------------------------------------------------
// Aplica la paleta aprobada de colores de partido a los candidatos ya
// importados. Los colores derivan del predominante de cada logo, matizados
// para que familias repetidas (rojos, verdes, azules) se diferencien a
// simple vista en barras y gráficos. Clave: nombre exacto guardado en la BD.
//
// Uso: npm run db:colors   (tras cada importación de candidatos)
// ---------------------------------------------------------------------------

const PARTY_COLORS: Record<string, string> = {
	// Rojos: vivo → medio → carmesí → frambuesa
	'Ahora Nacion - An': '#ef1a1a',
	'Accion Popular': '#cc3333',
	'Alianza Electoral Venceremos': '#be1623',
	'Partido Politico Peru Primero': '#e11d48',
	// Verdes: lima → esmeralda → bosque oscuro
	'Juntos Por El Peru': '#61bd10',
	'Progresemos': '#29b828',
	'Partido Democrata Verde': '#0aa150',
	'Partido Democrata Unido Peru': '#065f46',
	// Azules: escalonados por claridad
	'Renovacion Popular Peru': '#0b76a0',
	'Podemos Peru': '#304e94',
	'Alianza Para El Progreso': '#1e40af',
	'Frente Popular Agricola Fia Del Peru': '#3b5bdb',
	'Avanza Pais - Partido De Integracion Social': '#12275e',
	// Otros
	'Libertad Popular': '#eab308'
};

async function main() {
	for (const [party, partyColor] of Object.entries(PARTY_COLORS)) {
		const updated = await db
			.update(candidates)
			.set({ partyColor })
			.where(eq(candidates.party, party))
			.returning({ id: candidates.id });
		console.log(`[colores] ${party}: ${partyColor} (${updated.length} candidatos)`);
	}
	// La conexión de postgres mantiene vivo el event loop: salir explícitamente.
	process.exit(0);
}

void main();

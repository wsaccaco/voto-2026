import 'dotenv/config';
import postgres from 'postgres';

// ---------------------------------------------------------------------------
// Aplica la paleta aprobada de colores de partido a los candidatos ya
// importados. Los colores derivan del predominante de cada logo, matizados
// para que familias repetidas (rojos, verdes, azules) se diferencien a
// simple vista en barras y gráficos. Clave: nombre exacto guardado en la BD.
//
// Autocontenido (SQL directo, sin importar src/) porque también se ejecuta
// dentro de la imagen de producción en cada deploy: el contenedor solo
// incluye scripts/, drizzle/ y dist/.
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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error('Falta DATABASE_URL');
	process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

for (const [party, partyColor] of Object.entries(PARTY_COLORS)) {
	const updated = await sql`
		UPDATE candidates SET party_color = ${partyColor}
		WHERE party = ${party}
		RETURNING id
	`;
	console.log(`[colores] ${party}: ${partyColor} (${updated.length} candidatos)`);
}

await sql.end();

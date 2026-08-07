import 'dotenv/config';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db, sql } from '../src/db/index.js';
import { candidates, elections, responses } from '../src/db/schema.js';
import { ensureWeeklyCycle } from '../src/lib/surveys.js';

// ---------------------------------------------------------------------------
// Importador de candidatos desde Voto Informado (JNE) — ERM 2026
// Carga candidatos reales (nombre, partido, foto, logo) para las elecciones
// configuradas. Fotos y logos se guardan como hotlink al blob del JNE.
// Uso: npm run db:import   |   npm run db:import -- --reset (borra todo antes)
// ---------------------------------------------------------------------------

const API = 'https://votoinformado.jne.gob.pe/api/v1';
const FOTOS = 'https://stovotoinformadodev.blob.core.windows.net/contenedor-1';
const LOGOS = 'https://stovotoinformadodev.blob.core.windows.net/contenedor-2';

type ElectionType = 'alcaldia' | 'gobierno_regional';
type ElectionLevel = 'regional' | 'provincial' | 'distrital';

interface ElectionSource {
	type: ElectionType;
	/** Nivel de elección y ámbito (provincia/distrito) según el padrón del JNE */
	level: ElectionLevel;
	province: string | null;
	district: string | null;
	name: string;
	dep: string;
	pro: string;
	dis: string;
	/** Tipo de elección en el JNE: 4 = regional, 5 = municipal provincial, 6 = municipal distrital */
	jneType: number;
	/** Cargo del candidato titular que se importa */
	cargo: string;
}

// Códigos dep/pro/dis del padrón del JNE (Voto Informado). ¡Ojo! la numeración
// de provincias/distritos del JNE NO coincide con el ubigeo INEI; cada código
// fue verificado contra el campo `distrito`/`provincia` de la propia API.
const SOURCES: ElectionSource[] = [
	{ type: 'gobierno_regional', level: 'regional', province: null, district: null, name: 'Gobierno Regional de Apurímac', dep: '03', pro: '01', dis: '01', jneType: 4, cargo: 'GOBERNADOR REGIONAL' },
	// Provinciales (dis 01 = capital provincial, jneType 5)
	{ type: 'alcaldia', level: 'provincial', province: 'Andahuaylas', district: null, name: 'Alcaldía Provincial de Andahuaylas', dep: '03', pro: '03', dis: '01', jneType: 5, cargo: 'ALCALDE PROVINCIAL' },
	{ type: 'alcaldia', level: 'provincial', province: 'Abancay', district: null, name: 'Alcaldía Provincial de Abancay', dep: '03', pro: '01', dis: '01', jneType: 5, cargo: 'ALCALDE PROVINCIAL' },
	{ type: 'alcaldia', level: 'provincial', province: 'Chincheros', district: null, name: 'Alcaldía Provincial de Chincheros', dep: '03', pro: '07', dis: '01', jneType: 5, cargo: 'ALCALDE PROVINCIAL' },
	// Distritales de Abancay (pro 01); el distrito Abancay es capital provincial
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Circa', name: 'Alcaldía Distrital de Circa', dep: '03', pro: '01', dis: '02', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Curahuasi', name: 'Alcaldía Distrital de Curahuasi', dep: '03', pro: '01', dis: '03', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Chacoche', name: 'Alcaldía Distrital de Chacoche', dep: '03', pro: '01', dis: '04', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Huanipaca', name: 'Alcaldía Distrital de Huanipaca', dep: '03', pro: '01', dis: '05', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Lambrama', name: 'Alcaldía Distrital de Lambrama', dep: '03', pro: '01', dis: '06', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Pichirhua', name: 'Alcaldía Distrital de Pichirhua', dep: '03', pro: '01', dis: '07', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'San Pedro de Cachora', name: 'Alcaldía Distrital de San Pedro de Cachora', dep: '03', pro: '01', dis: '08', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Abancay', district: 'Tamburco', name: 'Alcaldía Distrital de Tamburco', dep: '03', pro: '01', dis: '09', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	// Distritales de Andahuaylas (pro 03); el distrito Andahuaylas es capital provincial
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Andarapa', name: 'Alcaldía Distrital de Andarapa', dep: '03', pro: '03', dis: '02', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Chiara', name: 'Alcaldía Distrital de Chiara', dep: '03', pro: '03', dis: '03', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Huancarama', name: 'Alcaldía Distrital de Huancarama', dep: '03', pro: '03', dis: '04', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Huancaray', name: 'Alcaldía Distrital de Huancaray', dep: '03', pro: '03', dis: '05', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Kishuara', name: 'Alcaldía Distrital de Kishuara', dep: '03', pro: '03', dis: '06', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Pacobamba', name: 'Alcaldía Distrital de Pacobamba', dep: '03', pro: '03', dis: '07', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Pampachiri', name: 'Alcaldía Distrital de Pampachiri', dep: '03', pro: '03', dis: '08', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'San Antonio de Cachi', name: 'Alcaldía Distrital de San Antonio de Cachi', dep: '03', pro: '03', dis: '09', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'San Jerónimo', name: 'Alcaldía Distrital de San Jerónimo', dep: '03', pro: '03', dis: '10', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Talavera', name: 'Alcaldía Distrital de Talavera', dep: '03', pro: '03', dis: '11', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Turpo', name: 'Alcaldía Distrital de Turpo', dep: '03', pro: '03', dis: '12', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Pacucha', name: 'Alcaldía Distrital de Pacucha', dep: '03', pro: '03', dis: '13', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Pomacocha', name: 'Alcaldía Distrital de Pomacocha', dep: '03', pro: '03', dis: '14', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Santa María de Chicmo', name: 'Alcaldía Distrital de Santa María de Chicmo', dep: '03', pro: '03', dis: '15', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Tumay Huaraca', name: 'Alcaldía Distrital de Tumay Huaraca', dep: '03', pro: '03', dis: '16', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Huayana', name: 'Alcaldía Distrital de Huayana', dep: '03', pro: '03', dis: '17', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'San Miguel de Chaccrampa', name: 'Alcaldía Distrital de San Miguel de Chaccrampa', dep: '03', pro: '03', dis: '18', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'Kaquiabamba', name: 'Alcaldía Distrital de Kaquiabamba', dep: '03', pro: '03', dis: '19', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Andahuaylas', district: 'José María Arguedas', name: 'Alcaldía Distrital de José María Arguedas', dep: '03', pro: '03', dis: '20', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	// Distritales de Chincheros (pro 07 en el JNE); el distrito Chincheros es capital provincial
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Ongoy', name: 'Alcaldía Distrital de Ongoy', dep: '03', pro: '07', dis: '02', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Ocobamba', name: 'Alcaldía Distrital de Ocobamba', dep: '03', pro: '07', dis: '03', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Cocharcas', name: 'Alcaldía Distrital de Cocharcas', dep: '03', pro: '07', dis: '04', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Anco Huallo', name: 'Alcaldía Distrital de Anco Huallo', dep: '03', pro: '07', dis: '05', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Huaccana', name: 'Alcaldía Distrital de Huaccana', dep: '03', pro: '07', dis: '06', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Uranmarca', name: 'Alcaldía Distrital de Uranmarca', dep: '03', pro: '07', dis: '07', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Ranracancha', name: 'Alcaldía Distrital de Ranracancha', dep: '03', pro: '07', dis: '08', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Rocchacc', name: 'Alcaldía Distrital de Rocchacc', dep: '03', pro: '07', dis: '09', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'El Porvenir', name: 'Alcaldía Distrital de El Porvenir', dep: '03', pro: '07', dis: '10', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Los Chankas', name: 'Alcaldía Distrital de Los Chankas', dep: '03', pro: '07', dis: '11', jneType: 6, cargo: 'ALCALDE DISTRITAL' },
	{ type: 'alcaldia', level: 'distrital', province: 'Chincheros', district: 'Ahuayro', name: 'Alcaldía Distrital de Ahuayro', dep: '03', pro: '07', dis: '12', jneType: 6, cargo: 'ALCALDE DISTRITAL' }
];

const YEAR = 2026;

// Colores referenciales de organizaciones políticas nacionales.
// Clave: nombre en mayúsculas sin tildes. Las organizaciones regionales
// locales quedan sin color hasta que se definan manualmente.
const PARTY_COLORS: Record<string, string> = {
	'ACCION POPULAR': '#f59e0b',
	'FUERZA POPULAR': '#f97316',
	'PODEMOS PERU': '#b45309',
	'ALIANZA PARA EL PROGRESO': '#1e40af',
	'JUNTOS POR EL PERU': '#dc2626',
	'PARTIDO MORADO': '#7c3aed',
	'RENOVACION POPULAR': '#0284c7',
	'SOMOS PERU': '#dc2626',
	'AVANZA PAIS - PARTIDO DE INTEGRACION SOCIAL': '#16a34a',
	'PERU LIBRE': '#b91c1c',
	'PARTIDO DEMOCRATICO SOMOS PERU': '#dc2626',
	'EL FRENTE AMPLIO POR JUSTICIA VIDA Y LIBERTAD': '#15803d',
	'UNIDAD Y PAZ': '#0d9488',
	'PARTIDO DEL BUEN GOBIERNO': '#2563eb',
	'AHORA NACION - AN': '#0891b2',
	'FRENTE DE LA ESPERANZA 2021': '#65a30d',
	'PRIMERO LA GENTE - COMUNIDAD, ECOLOGIA, LIBERTAD Y PROGRESO': '#ea580c',
	'UNIDAD NACIONAL': '#1d4ed8',
	'PROGRESEMOS': '#9333ea',
	'PARTIDO DEMOCRATA UNIDO PERU': '#059669',
	'PARTIDO POLITICO NACIONAL PERU PRIMERO': '#e11d48'
};

interface JneCandidato {
	numeroCandidato: number;
	estadoCandidato: string;
	cargoEleccion: string;
	apellidoPaterno: string;
	apellidoMaterno: string;
	nombres: string;
	urlFotoCandidato?: string | null;
}

interface JneOrganizacion {
	idOrganizacionPolitica: number;
	organizacionPolitica: string;
	URLlogoOP: string;
	listas: {
		idSolicitudLista: number;
		codigoExpediente?: string;
		gobernadores?: JneCandidato[];
		candidatos?: JneCandidato[];
	}[];
}

interface JneResponse {
	success: boolean;
	message?: string;
	data: { idTipoEleccion: number; tipoEleccion: string; organizaciones: JneOrganizacion[] }[];
}

const ESTADOS_VALIDOS = new Set(['INSCRITO', 'ADMITIDO']);

function titleCase(raw: string) {
	return raw
		.toLowerCase()
		.split(/\s+/)
		.map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

function normalizeParty(name: string) {
	return name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function fetchOrganizaciones(src: ElectionSource): Promise<JneResponse> {
	const res = await fetch(`${API}/candidatos/organizaciones`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ dep: src.dep, pro: src.pro, dis: src.dis })
	});
	if (!res.ok) throw new Error(`organizaciones ${src.name}: HTTP ${res.status}`);
	return (await res.json()) as JneResponse;
}

async function fetchCandidatos(src: ElectionSource, idSolicitudLista: number): Promise<JneResponse> {
	const res = await fetch(`${API}/candidatos/organizaciones/candidatos`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ dep: src.dep, pro: src.pro, dis: src.dis, idSolicitudLista })
	});
	if (!res.ok) throw new Error(`candidatos ${src.name} lista ${idSolicitudLista}: HTTP ${res.status}`);
	return (await res.json()) as JneResponse;
}

/** Extrae el candidato titular (alcalde / gobernador) de una lista. */
function titular(resp: JneResponse, jneType: number, cargo: string): JneCandidato | null {
	for (const bloque of resp.data) {
		if (bloque.idTipoEleccion !== jneType) continue;
		for (const org of bloque.organizaciones) {
			for (const lista of org.listas) {
				const pool = jneType === 4 ? lista.gobernadores : lista.candidatos;
				const found = pool?.find((c) => c.cargoEleccion === cargo);
				if (found) return found;
			}
		}
	}
	return null;
}

function orgPorSolicitud(resp: JneResponse, jneType: number, idSolicitudLista: number): JneOrganizacion | null {
	for (const bloque of resp.data) {
		if (bloque.idTipoEleccion !== jneType) continue;
		for (const org of bloque.organizaciones) {
			if (org.listas.some((l) => l.idSolicitudLista === idSolicitudLista)) return org;
		}
	}
	return null;
}

async function upsertElection(src: ElectionSource) {
	const scope = { level: src.level, province: src.province, district: src.district };
	const [existing] = await db.select().from(elections).where(eq(elections.name, src.name));
	if (existing) {
		// Mantener el ámbito al día (backfill de elecciones creadas antes de la columna)
		const [updated] = await db
			.update(elections)
			.set(scope)
			.where(eq(elections.id, existing.id))
			.returning();
		return updated;
	}
	const [created] = await db
		.insert(elections)
		.values({ type: src.type, name: src.name, year: YEAR, active: true, ...scope })
		.returning();
	return created;
}

async function importElection(src: ElectionSource) {
	const orgsResp = await fetchOrganizaciones(src);
	const bloque = orgsResp.data.find((b) => b.idTipoEleccion === src.jneType);
	if (!bloque || bloque.organizaciones.length === 0) {
		console.warn(`[import-jne] ${src.name}: sin organizaciones en el JNE, se omite.`);
		return;
	}

	const election = await upsertElection(src);

	// Limpiar candidatos reales previos y sus votos (se conservan los especiales).
	// Nota: re-importar reinicia los votos de la elección, porque la lista de
	// candidatos oficiales puede cambiar entre semanas (tachas/inscripciones).
	const previos = await db
		.select({ id: candidates.id })
		.from(candidates)
		.where(and(eq(candidates.electionId, election.id), ne(candidates.isSpecial, true)));
	if (previos.length > 0) {
		const ids = previos.map((c) => c.id);
		await db.delete(responses).where(inArray(responses.candidateId, ids));
		await db.delete(candidates).where(inArray(candidates.id, ids));
	}

	let sortOrder = 1;
	let imported = 0;

	for (const org of bloque.organizaciones) {
		for (const lista of org.listas) {
			const candResp = await fetchCandidatos(src, lista.idSolicitudLista);
			const cand = titular(candResp, src.jneType, src.cargo);
			if (!cand) {
				console.warn(`[import-jne] ${src.name}: lista ${lista.idSolicitudLista} (${org.organizacionPolitica}) sin titular ${src.cargo}`);
				continue;
			}
			if (!ESTADOS_VALIDOS.has(cand.estadoCandidato)) {
				console.warn(`[import-jne] ${src.name}: ${cand.nombres} ${cand.apellidoPaterno} en estado ${cand.estadoCandidato}, se omite`);
				continue;
			}

			const name = titleCase(`${cand.nombres} ${cand.apellidoPaterno} ${cand.apellidoMaterno}`);
			const party = titleCase(org.organizacionPolitica);
			const photoUrl = cand.urlFotoCandidato ? `${FOTOS}/${cand.urlFotoCandidato}` : null;
			const partyLogoUrl = org.URLlogoOP ? `${LOGOS}/${org.URLlogoOP}` : null;

			await db.insert(candidates).values({
				electionId: election.id,
				name,
				party,
				partyColor: PARTY_COLORS[normalizeParty(org.organizacionPolitica)] ?? null,
				photoUrl,
				partyLogoUrl,
				active: true,
				isSpecial: false,
				sortOrder: sortOrder++
			});
			imported++;
		}
	}

	// Candidatos especiales (Indeciso / Voto en blanco) si no existen
	const specials = await db
		.select()
		.from(candidates)
		.where(and(eq(candidates.electionId, election.id), eq(candidates.isSpecial, true)));
	if (specials.length === 0) {
		await db.insert(candidates).values([
			{ electionId: election.id, name: 'Indeciso', partyColor: '#94a3b8', isSpecial: true, sortOrder: 98 },
			{ electionId: election.id, name: 'Voto en blanco', partyColor: '#cbd5e1', isSpecial: true, sortOrder: 99 }
		]);
	}

	console.log(`[import-jne] ${src.name}: ${imported} candidatos importados.`);
}

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error('Falta DATABASE_URL');
		process.exit(1);
	}

	if (process.argv.includes('--reset')) {
		console.log('[import-jne] --reset: borrando elecciones existentes (incluye votos asociados)...');
		await db.delete(elections);
	}

	for (const src of SOURCES) {
		try {
			await importElection(src);
		} catch (err) {
			console.error(`[import-jne] Error en ${src.name}:`, err instanceof Error ? err.message : err);
		}
	}

	// Crear las encuestas de la semana actual para las nuevas elecciones
	await ensureWeeklyCycle();
	console.log('[import-jne] Listo.');
}

await main();
await sql.end();
process.exit(0);

/**
 * Catálogo geográfico de la región Apurímac (ubigeo INEI, departamento 03).
 * Solo se incluyen las provincias en alcance: Abancay, Andahuaylas y Chincheros.
 * El primer distrito de cada provincia es su capital: allí no existe alcalde
 * distrital separado, el alcalde provincial cumple esa función.
 */

export interface Province {
	name: string;
	/** Distrito capital de la provincia (primer elemento de `districts`) */
	capital: string;
	districts: string[];
}

export const REGION_NAME = 'Apurímac';

export const APURIMAC_PROVINCES: Province[] = [
	{
		name: 'Abancay',
		capital: 'Abancay',
		districts: [
			'Abancay',
			'Chacoche',
			'Circa',
			'Curahuasi',
			'Huanipaca',
			'Lambrama',
			'Pichirhua',
			'San Pedro de Cachora',
			'Tamburco'
		]
	},
	{
		name: 'Andahuaylas',
		capital: 'Andahuaylas',
		districts: [
			'Andahuaylas',
			'Andarapa',
			'Chiara',
			'Huancarama',
			'Huancaray',
			'Huayana',
			'José María Arguedas',
			'Kaquiabamba',
			'Kishuara',
			'Pacobamba',
			'Pacucha',
			'Pampachiri',
			'Pomacocha',
			'San Antonio de Cachi',
			'San Jerónimo',
			'San Miguel de Chaccrampa',
			'Santa María de Chicmo',
			'Talavera',
			'Tumay Huaraca',
			'Turpo'
		]
	},
	{
		name: 'Chincheros',
		capital: 'Chincheros',
		districts: [
			'Chincheros',
			'Anco Huallo',
			'Cocharcas',
			'El Porvenir',
			'Huaccana',
			'Los Chankas',
			'Ocobamba',
			'Ongoy',
			'Ranracancha',
			'Rocchacc',
			'Uranmarca',
			'Ahuayro'
		]
	}
];

/** Distancia máxima (km) para considerar que una posición pertenece a la región. */
const MAX_NEAREST_KM = 150;

/**
 * Centroides aproximados de cada distrito (lat/lon decimal, fuentes INEI/OSM).
 * Se usan solo para autoseleccionar la ubicación con el GPS del dispositivo:
 * la precisión de unos pocos km es suficiente para distinguir distritos vecinos
 * (que están a 15-40 km entre sí) y la posición nunca sale del dispositivo.
 */
export const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
	// Abancay
	Abancay: { lat: -13.633, lon: -72.879 },
	Chacoche: { lat: -13.937, lon: -72.993 },
	Circa: { lat: -13.867, lon: -72.926 },
	Curahuasi: { lat: -13.542, lon: -72.698 },
	Huanipaca: { lat: -13.507, lon: -72.932 },
	Lambrama: { lat: -13.876, lon: -72.762 },
	Pichirhua: { lat: -13.876, lon: -72.867 },
	'San Pedro de Cachora': { lat: -13.514, lon: -72.813 },
	Tamburco: { lat: -13.608, lon: -72.874 },
	// Andahuaylas
	Andahuaylas: { lat: -13.657, lon: -73.387 },
	Andarapa: { lat: -13.626, lon: -73.339 },
	Chiara: { lat: -13.284, lon: -73.677 },
	Huancarama: { lat: -13.648, lon: -73.086 },
	Huancaray: { lat: -13.760, lon: -73.548 },
	Huayana: { lat: -13.592, lon: -73.437 },
	'José María Arguedas': { lat: -13.512, lon: -73.411 },
	Kaquiabamba: { lat: -13.583, lon: -73.505 },
	Kishuara: { lat: -13.692, lon: -73.122 },
	Pacobamba: { lat: -13.723, lon: -73.080 },
	Pacucha: { lat: -13.608, lon: -73.330 },
	Pampachiri: { lat: -14.186, lon: -73.545 },
	Pomacocha: { lat: -13.742, lon: -73.614 },
	'San Antonio de Cachi': { lat: -13.777, lon: -73.612 },
	'San Jerónimo': { lat: -13.651, lon: -73.365 },
	'San Miguel de Chaccrampa': { lat: -13.667, lon: -73.150 },
	'Santa María de Chicmo': { lat: -13.699, lon: -73.283 },
	Talavera: { lat: -13.655, lon: -73.427 },
	'Tumay Huaraca': { lat: -13.693, lon: -73.486 },
	Turpo: { lat: -13.787, lon: -73.472 },
	// Chincheros
	Chincheros: { lat: -13.523, lon: -73.729 },
	'Anco Huallo': { lat: -13.556, lon: -73.672 },
	Cocharcas: { lat: -13.611, lon: -73.741 },
	'El Porvenir': { lat: -13.476, lon: -73.626 },
	Huaccana: { lat: -13.421, lon: -73.664 },
	'Los Chankas': { lat: -13.577, lon: -73.755 },
	Ocobamba: { lat: -13.468, lon: -73.518 },
	Ongoy: { lat: -13.518, lon: -73.607 },
	Ranracancha: { lat: -13.532, lon: -73.643 },
	Rocchacc: { lat: -13.599, lon: -73.665 },
	Uranmarca: { lat: -13.650, lon: -73.661 },
	Ahuayro: { lat: -13.613, lon: -73.793 }
};

export function getProvince(name: string | null | undefined): Province | null {
	if (!name) return null;
	return APURIMAC_PROVINCES.find((p) => p.name === name) ?? null;
}

export function districtsOf(provinceName: string | null | undefined): string[] {
	return getProvince(provinceName)?.districts ?? [];
}

/**
 * Indica si el distrito es la capital de su provincia. En ese caso no hay
 * alcalde distrital separado: el alcalde provincial cumple esa función.
 */
export function isCapitalDistrict(provinceName: string | null | undefined, district: string | null | undefined): boolean {
	const province = getProvince(provinceName);
	if (!province || !district) return false;
	return province.capital === district;
}

/** Distancia haversine en kilómetros entre dos puntos. */
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Distrito más cercano a una posición GPS. Devuelve null si el punto está a
 * más de 150 km de cualquier centroide (fuera del área de Apurímac).
 */
export function nearestDistrict(
	lat: number,
	lon: number
): { province: string; district: string } | null {
	let best: { province: string; district: string; km: number } | null = null;
	for (const p of APURIMAC_PROVINCES) {
		for (const d of p.districts) {
			const c = DISTRICT_COORDS[d];
			if (!c) continue;
			const km = haversineKm({ lat, lon }, c);
			if (!best || km < best.km) best = { province: p.name, district: d, km };
		}
	}
	if (!best || best.km > MAX_NEAREST_KM) return null;
	return { province: best.province, district: best.district };
}

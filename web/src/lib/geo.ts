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

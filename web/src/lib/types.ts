export type ElectionType = 'alcaldia' | 'gobierno_regional';

/** Nivel de elección: regional (Apurímac), provincial o distrital. */
export type ElectionLevel = 'regional' | 'provincial' | 'distrital';

export interface Survey {
	id: number;
	electionId: number;
	title: string;
	weekNumber: number;
	startDate: string;
	endDate: string;
	status: 'borrador' | 'abierta' | 'cerrada';
	createdAt: string;
	electionName: string;
	electionType: ElectionType;
	electionLevel: ElectionLevel;
	electionProvince: string | null;
	electionDistrict: string | null;
	weekLabel: string;
}

export interface Candidate {
	id: number;
	electionId: number;
	name: string;
	party: string | null;
	partyColor: string | null;
	photoUrl: string | null;
	partyLogoUrl: string | null;
	active: boolean;
	isSpecial: boolean;
	sortOrder: number;
}

export interface SurveyDetail extends Survey {
	candidates: Candidate[];
	hasVotes: boolean;
}

export interface CandidateResult {
	candidateId: number;
	name: string;
	party: string | null;
	partyColor: string | null;
	photoUrl: string | null;
	isSpecial: boolean;
	votes: number;
	percent: number;
}

export interface SurveyResults {
	surveyId: number;
	totalVotes: number;
	results: CandidateResult[];
}

export interface ComparisonPoint {
	surveyId: number;
	weekNumber: number;
	label: string;
	percents: Record<number, number>;
	totalVotes: number;
}

export interface Profile {
	ageRange: string | null;
	sex: string | null;
	district: string | null;
	province: string | null;
	occupation: string | null;
	educationLevel: string | null;
}

export interface SessionUser {
	googleId: string;
	email: string;
	name: string | null;
	image: string | null;
	isAdmin: boolean;
	profile?: Profile | null;
}

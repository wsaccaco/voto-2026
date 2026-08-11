import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
	varchar
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const electionTypeEnum = pgEnum('election_type', ['alcaldia', 'gobierno_regional']);
export const electionLevelEnum = pgEnum('election_level', ['regional', 'provincial', 'distrital']);
export const surveyStatusEnum = pgEnum('survey_status', ['borrador', 'abierta', 'cerrada']);
export const sexEnum = pgEnum('sex', ['masculino', 'femenino', 'prefiero_no_decir']);
export const ageRangeEnum = pgEnum('age_range', ['18-25', '26-35', '36-50', '51+']);
export const gameStatusEnum = pgEnum('game_status', ['activo', 'finalizado']);
export const roundStatusEnum = pgEnum('round_status', ['activa', 'cerrada']);

// ---------------------------------------------------------------------------
// users — un registro por cuenta de Google
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	googleId: varchar('google_id', { length: 128 }).notNull().unique(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	name: varchar('name', { length: 255 }),
	avatarUrl: text('avatar_url'),
	isAdmin: boolean('is_admin').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// user_profiles — datos demográficos opcionales, nunca bloqueantes
// ---------------------------------------------------------------------------
export const userProfiles = pgTable('user_profiles', {
	userId: integer('user_id')
		.primaryKey()
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	ageRange: ageRangeEnum('age_range'),
	sex: sexEnum('sex'),
	district: varchar('district', { length: 128 }),
	province: varchar('province', { length: 128 }),
	occupation: varchar('occupation', { length: 128 }),
	educationLevel: varchar('education_level', { length: 64 }),
	completedAt: timestamp('completed_at', { withTimezone: true })
});

// ---------------------------------------------------------------------------
// device_fingerprints — huellas de dispositivo por usuario (antifraude)
// ---------------------------------------------------------------------------
export const deviceFingerprints = pgTable(
	'device_fingerprints',
	{
		id: serial('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		fingerprintHash: varchar('fingerprint_hash', { length: 128 }).notNull(),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('fp_user_idx').on(t.userId), index('fp_hash_idx').on(t.fingerprintHash)]
);

// ---------------------------------------------------------------------------
// elections — alcaldía / gobierno regional
// level: nivel de elección; province/district: ámbito de la elección
// (regionales: ambos null; provinciales: solo province; distritales: ambos)
// ---------------------------------------------------------------------------
export const elections = pgTable('elections', {
	id: serial('id').primaryKey(),
	type: electionTypeEnum('type').notNull(),
	level: electionLevelEnum('level').notNull().default('regional'),
	name: varchar('name', { length: 255 }).notNull(),
	province: varchar('province', { length: 128 }),
	district: varchar('district', { length: 128 }),
	year: integer('year').notNull(),
	active: boolean('active').notNull().default(true)
});

// ---------------------------------------------------------------------------
// candidates — incluye opciones especiales (Indeciso, Voto en blanco)
// ---------------------------------------------------------------------------
export const candidates = pgTable(
	'candidates',
	{
		id: serial('id').primaryKey(),
		electionId: integer('election_id')
			.notNull()
			.references(() => elections.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 255 }).notNull(),
		party: varchar('party', { length: 255 }),
		partyColor: varchar('party_color', { length: 16 }),
		photoUrl: text('photo_url'),
		partyLogoUrl: text('party_logo_url'),
		active: boolean('active').notNull().default(true),
		isSpecial: boolean('is_special').notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(t) => [index('candidates_election_idx').on(t.electionId)]
);

// ---------------------------------------------------------------------------
// surveys — una por semana por elección (ciclo semanal)
// ---------------------------------------------------------------------------
export const surveys = pgTable(
	'surveys',
	{
		id: serial('id').primaryKey(),
		electionId: integer('election_id')
			.notNull()
			.references(() => elections.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 255 }).notNull(),
		weekNumber: integer('week_number').notNull(),
		startDate: timestamp('start_date', { withTimezone: true }).notNull(),
		endDate: timestamp('end_date', { withTimezone: true }).notNull(),
		status: surveyStatusEnum('status').notNull().default('borrador'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('surveys_election_idx').on(t.electionId),
		index('surveys_status_idx').on(t.status),
		uniqueIndex('surveys_election_week_uq').on(t.electionId, t.weekNumber)
	]
);

// ---------------------------------------------------------------------------
// responses — un voto por persona por semana (UNIQUE survey+user)
// ---------------------------------------------------------------------------
export const responses = pgTable(
	'responses',
	{
		id: serial('id').primaryKey(),
		surveyId: integer('survey_id')
			.notNull()
			.references(() => surveys.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		candidateId: integer('candidate_id')
			.notNull()
			.references(() => candidates.id, { onDelete: 'restrict' }),
		ipHash: varchar('ip_hash', { length: 128 }),
		fingerprintHash: varchar('fingerprint_hash', { length: 128 }),
		votedAt: timestamp('voted_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		unique('responses_survey_user_uq').on(t.surveyId, t.userId),
		index('responses_survey_idx').on(t.surveyId),
		index('responses_user_idx').on(t.userId)
	]
);

// ---------------------------------------------------------------------------
// game_instances — un juego de supervivencia por elección
// ---------------------------------------------------------------------------
export const gameInstances = pgTable('game_instances', {
	id: serial('id').primaryKey(),
	electionId: integer('election_id')
		.notNull()
		.references(() => elections.id, { onDelete: 'cascade' }),
	status: gameStatusEnum('status').notNull().default('activo'),
	currentRound: integer('current_round').notNull().default(0),
	winnerCandidateId: integer('winner_candidate_id').references(() => candidates.id),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	endedAt: timestamp('ended_at', { withTimezone: true })
});

// ---------------------------------------------------------------------------
// game_rounds — cada ronda de 24h dentro de un juego
// ---------------------------------------------------------------------------
export const gameRounds = pgTable(
	'game_rounds',
	{
		id: serial('id').primaryKey(),
		gameInstanceId: integer('game_instance_id')
			.notNull()
			.references(() => gameInstances.id, { onDelete: 'cascade' }),
		roundNumber: integer('round_number').notNull(),
		startTime: timestamp('start_time', { withTimezone: true }).notNull(),
		endTime: timestamp('end_time', { withTimezone: true }).notNull(),
		eliminatedCandidateId: integer('eliminated_candidate_id').references(() => candidates.id),
		status: roundStatusEnum('status').notNull().default('activa')
	},
	(t) => [unique('game_rounds_instance_round_uq').on(t.gameInstanceId, t.roundNumber)]
);

// ---------------------------------------------------------------------------
// game_votes — voto para eliminar a un candidato en una ronda
// ---------------------------------------------------------------------------
export const gameVotes = pgTable(
	'game_votes',
	{
		id: serial('id').primaryKey(),
		roundId: integer('round_id')
			.notNull()
			.references(() => gameRounds.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		candidateId: integer('candidate_id')
			.notNull()
			.references(() => candidates.id, { onDelete: 'restrict' }),
		fingerprintHash: varchar('fingerprint_hash', { length: 128 }),
		votedAt: timestamp('voted_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique('game_votes_round_user_uq').on(t.roundId, t.userId)]
);

export const auditLog = pgTable('audit_log', {
	id: serial('id').primaryKey(),
	actorEmail: varchar('actor_email', { length: 255 }),
	action: varchar('action', { length: 64 }).notNull(),
	detail: text('detail'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ one, many }) => ({
	profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
	fingerprints: many(deviceFingerprints),
	responses: many(responses)
}));

export const electionsRelations = relations(elections, ({ many }) => ({
	candidates: many(candidates),
	surveys: many(surveys)
}));

export const candidatesRelations = relations(candidates, ({ one }) => ({
	election: one(elections, { fields: [candidates.electionId], references: [elections.id] })
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
	election: one(elections, { fields: [surveys.electionId], references: [elections.id] }),
	responses: many(responses)
}));

export const responsesRelations = relations(responses, ({ one }) => ({
	survey: one(surveys, { fields: [responses.surveyId], references: [surveys.id] }),
	user: one(users, { fields: [responses.userId], references: [users.id] }),
	candidate: one(candidates, { fields: [responses.candidateId], references: [candidates.id] })
}));

export const gameInstancesRelations = relations(gameInstances, ({ one, many }) => ({
	election: one(elections, { fields: [gameInstances.electionId], references: [elections.id] }),
	rounds: many(gameRounds),
	winner: one(candidates, { fields: [gameInstances.winnerCandidateId], references: [candidates.id] })
}));

export const gameRoundsRelations = relations(gameRounds, ({ one, many }) => ({
	gameInstance: one(gameInstances, { fields: [gameRounds.gameInstanceId], references: [gameInstances.id] }),
	eliminatedCandidate: one(candidates, { fields: [gameRounds.eliminatedCandidateId], references: [candidates.id] }),
	votes: many(gameVotes)
}));

export const gameVotesRelations = relations(gameVotes, ({ one }) => ({
	round: one(gameRounds, { fields: [gameVotes.roundId], references: [gameRounds.id] }),
	user: one(users, { fields: [gameVotes.userId], references: [users.id] }),
	candidate: one(candidates, { fields: [gameVotes.candidateId], references: [candidates.id] })
}));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Election = typeof elections.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
export type Survey = typeof surveys.$inferSelect;
export type Response_ = typeof responses.$inferSelect;
export type GameInstance = typeof gameInstances.$inferSelect;
export type GameRound = typeof gameRounds.$inferSelect;
export type GameVote = typeof gameVotes.$inferSelect;

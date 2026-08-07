CREATE TYPE "public"."age_range" AS ENUM('18-25', '26-35', '36-50', '51+');--> statement-breakpoint
CREATE TYPE "public"."election_type" AS ENUM('alcaldia', 'gobierno_regional');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('masculino', 'femenino', 'prefiero_no_decir');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('borrador', 'abierta', 'cerrada');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_email" varchar(255),
	"action" varchar(64) NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"election_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"party" varchar(255),
	"party_color" varchar(16),
	"photo_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_special" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fingerprint_hash" varchar(128) NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "election_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"year" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"ip_hash" varchar(128),
	"fingerprint_hash" varchar(128),
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_survey_user_uq" UNIQUE("survey_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"election_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"week_number" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" "survey_status" DEFAULT 'borrador' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"age_range" "age_range",
	"sex" "sex",
	"district" varchar(128),
	"province" varchar(128),
	"occupation" varchar(128),
	"education_level" varchar(64),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_id" varchar(128) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_election_idx" ON "candidates" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "fp_user_idx" ON "device_fingerprints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fp_hash_idx" ON "device_fingerprints" USING btree ("fingerprint_hash");--> statement-breakpoint
CREATE INDEX "responses_survey_idx" ON "responses" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "responses_user_idx" ON "responses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "surveys_election_idx" ON "surveys" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "surveys_status_idx" ON "surveys" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_election_week_uq" ON "surveys" USING btree ("election_id","week_number");
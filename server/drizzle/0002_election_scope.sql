CREATE TYPE "public"."election_level" AS ENUM('regional', 'provincial', 'distrital');--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "level" "election_level" DEFAULT 'regional' NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "province" varchar(128);--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "district" varchar(128);--> statement-breakpoint
-- Backfill del ámbito de las elecciones existentes
UPDATE "elections" SET "level" = 'regional', "province" = NULL, "district" = NULL WHERE "name" = 'Gobierno Regional de Apurímac';--> statement-breakpoint
UPDATE "elections" SET "level" = 'provincial', "province" = 'Andahuaylas', "district" = NULL WHERE "name" = 'Alcaldía Provincial de Andahuaylas';--> statement-breakpoint
UPDATE "elections" SET "level" = 'provincial', "province" = 'Abancay', "district" = NULL WHERE "name" = 'Alcaldía Provincial de Abancay';--> statement-breakpoint
UPDATE "elections" SET "level" = 'provincial', "province" = 'Chincheros', "district" = NULL WHERE "name" = 'Alcaldía Provincial de Chincheros';--> statement-breakpoint
UPDATE "elections" SET "level" = 'distrital', "province" = 'Andahuaylas', "district" = 'Talavera' WHERE "name" = 'Alcaldía Distrital de Talavera';--> statement-breakpoint
UPDATE "elections" SET "level" = 'distrital', "province" = 'Andahuaylas', "district" = 'San Jerónimo' WHERE "name" = 'Alcaldía Distrital de San Jerónimo';
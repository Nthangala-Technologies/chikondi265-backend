ALTER TABLE "profiles" ADD COLUMN "gender" text;
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_gender_check"
CHECK ("gender" IS NULL OR "gender" IN ('male', 'female', 'unspecified'));

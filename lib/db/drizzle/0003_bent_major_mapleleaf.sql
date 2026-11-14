ALTER TABLE "users" DROP CONSTRAINT "users_password_auth_fields_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_auth_fields_check" CHECK ("users"."auth_provider" <> 'password' OR (("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL) AND "users"."password_hash" IS NOT NULL));
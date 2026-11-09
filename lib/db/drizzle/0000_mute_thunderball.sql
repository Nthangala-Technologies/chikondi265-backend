CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider" text NOT NULL,
	"auth_subject" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_auth_provider_auth_subject_unique" UNIQUE("auth_provider","auth_subject"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'suspended', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"position" smallint NOT NULL,
	"moderation_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_photos_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "profile_photos_user_position_unique" UNIQUE("user_id","position"),
	CONSTRAINT "profile_photos_moderation_status_check" CHECK ("profile_photos"."moderation_status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(50) NOT NULL,
	"birth_date" date NOT NULL,
	"city" varchar(80) NOT NULL,
	"country_code" char(2) DEFAULT 'MW' NOT NULL,
	"bio" varchar(500) DEFAULT '' NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"intention" varchar(40) NOT NULL,
	"visibility_status" text DEFAULT 'active' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_visibility_status_check" CHECK ("profiles"."visibility_status" in ('active', 'paused', 'hidden', 'under_review', 'removed')),
	CONSTRAINT "profiles_verification_status_check" CHECK ("profiles"."verification_status" in ('unverified', 'pending', 'verified', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"age_min" smallint DEFAULT 18 NOT NULL,
	"age_max" smallint DEFAULT 99 NOT NULL,
	"max_distance_km" integer DEFAULT 100 NOT NULL,
	"intentions" text[] DEFAULT '{}'::text[] NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"cities" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_age_min_check" CHECK ("user_preferences"."age_min" >= 18),
	CONSTRAINT "user_preferences_age_range_check" CHECK ("user_preferences"."age_max" >= "user_preferences"."age_min"),
	CONSTRAINT "user_preferences_max_distance_check" CHECK ("user_preferences"."max_distance_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_low_id" uuid NOT NULL,
	"user_high_id" uuid NOT NULL,
	"status" text DEFAULT 'matched' NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chat_enabled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_user_pair_unique" UNIQUE("user_low_id","user_high_id"),
	CONSTRAINT "connections_user_order_check" CHECK ("connections"."user_low_id" < "connections"."user_high_id"),
	CONSTRAINT "connections_status_check" CHECK ("connections"."status" in ('matched', 'chat_enabled', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"actor_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_pkey" PRIMARY KEY("actor_user_id","target_user_id"),
	CONSTRAINT "swipes_users_differ_check" CHECK ("swipes"."actor_user_id" <> "swipes"."target_user_id"),
	CONSTRAINT "swipes_action_check" CHECK ("swipes"."action" in ('like', 'pass', 'super'))
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"tx_ref" text NOT NULL,
	"provider_transaction_id" text,
	"idempotency_key" text NOT NULL,
	"amount_mwk" integer NOT NULL,
	"currency" char(3) DEFAULT 'MWK' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "payment_attempts_tx_ref_unique" UNIQUE("tx_ref"),
	CONSTRAINT "payment_attempts_payer_idempotency_unique" UNIQUE("payer_user_id","idempotency_key"),
	CONSTRAINT "payment_attempts_provider_transaction_unique" UNIQUE("provider","provider_transaction_id"),
	CONSTRAINT "payment_attempts_amount_check" CHECK ("payment_attempts"."amount_mwk" > 0),
	CONSTRAINT "payment_attempts_provider_check" CHECK ("payment_attempts"."provider" = 'paychangu'),
	CONSTRAINT "payment_attempts_status_check" CHECK ("payment_attempts"."status" in ('pending', 'succeeded', 'failed', 'cancelled', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"tx_ref" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_sha256" char(64) NOT NULL,
	"signature_valid" boolean NOT NULL,
	"processing_status" text DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_code" text,
	CONSTRAINT "provider_events_dedupe_unique" UNIQUE("provider","tx_ref","event_type","payload_sha256"),
	CONSTRAINT "provider_events_processing_status_check" CHECK ("provider_events"."processing_status" in ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"client_message_id" uuid NOT NULL,
	"body" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "messages_sender_client_message_unique" UNIQUE("sender_user_id","client_message_id"),
	CONSTRAINT "messages_body_not_blank_check" CHECK (length(trim("messages"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("blocker_user_id","blocked_user_id"),
	CONSTRAINT "blocks_users_differ_check" CHECK ("blocks"."blocker_user_id" <> "blocks"."blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"connection_id" uuid,
	"category" text NOT NULL,
	"details" varchar(1000),
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	CONSTRAINT "reports_users_differ_check" CHECK ("reports"."reporter_user_id" <> "reports"."reported_user_id"),
	CONSTRAINT "reports_category_check" CHECK ("reports"."category" in ('harassment', 'scam', 'impersonation', 'underage', 'other')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open', 'under_review', 'actioned', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_low_id_users_id_fk" FOREIGN KEY ("user_low_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_high_id_users_id_fk" FOREIGN KEY ("user_high_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_photos_user_id_idx" ON "profile_photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "connections_user_low_updated_at_idx" ON "connections" USING btree ("user_low_id","updated_at");--> statement-breakpoint
CREATE INDEX "connections_user_high_updated_at_idx" ON "connections" USING btree ("user_high_id","updated_at");--> statement-breakpoint
CREATE INDEX "swipes_target_action_idx" ON "swipes" USING btree ("target_user_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_success_per_connection_idx" ON "payment_attempts" USING btree ("connection_id") WHERE "payment_attempts"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "payment_attempts_connection_id_idx" ON "payment_attempts" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "messages_connection_created_id_idx" ON "messages" USING btree ("connection_id","created_at","id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_user_id_idx" ON "blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_at_idx" ON "reports" USING btree ("status","created_at");
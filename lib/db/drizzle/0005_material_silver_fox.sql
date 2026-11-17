ALTER TABLE "connections" ADD COLUMN "cleared_at_user_low" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "cleared_at_user_high" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_for_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_deleted_for_user_ids_gin_idx" ON "messages" USING gin ("deleted_for_user_ids");
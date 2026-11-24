CREATE TABLE "chat_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid UNIQUE REFERENCES "messages" ("id") ON DELETE SET NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users" ("id"),
  "kind" text NOT NULL,
  "object_key" uuid NOT NULL UNIQUE,
  "size_bytes" integer NOT NULL,
  "mime" text NOT NULL,
  "duration_seconds" real,
  "moderation_status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chat_media_kind_check" CHECK ("kind" IN ('audio', 'image', 'video')),
  CONSTRAINT "chat_media_size_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "chat_media_moderation_status_check" CHECK ("moderation_status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX "chat_media_owner_idx" ON "chat_media" ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "chat_media_pending_idx" ON "chat_media" ("created_at")
WHERE "moderation_status" = 'pending' AND "message_id" IS NOT NULL;

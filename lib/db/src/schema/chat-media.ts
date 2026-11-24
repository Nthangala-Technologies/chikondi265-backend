import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messagesTable } from "./messages";
import { usersTable } from "./users";

export const chatMediaTable = pgTable("chat_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").unique().references(() => messagesTable.id, { onDelete: "set null" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => usersTable.id),
  kind: text("kind", { enum: ["audio", "image", "video"] }).notNull(),
  objectKey: uuid("object_key").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  mime: text("mime").notNull(),
  durationSeconds: real("duration_seconds"),
  moderationStatus: text("moderation_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("chat_media_kind_check", sql`${table.kind} in ('audio', 'image', 'video')`),
  check("chat_media_size_check", sql`${table.sizeBytes} > 0`),
  check("chat_media_moderation_status_check", sql`${table.moderationStatus} in ('pending', 'approved', 'rejected')`),
  index("chat_media_owner_idx").on(table.ownerUserId),
  index("chat_media_pending_idx").on(table.createdAt).where(
    sql`${table.moderationStatus} = 'pending' and ${table.messageId} is not null`,
  ),
]);

export type ChatMedia = typeof chatMediaTable.$inferSelect;

import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { connectionsTable } from "./matching";
import { usersTable } from "./users";

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connectionsTable.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => usersTable.id),
    clientMessageId: uuid("client_message_id").notNull(),
    body: varchar("body", { length: 2000 }).notNull(),
    deletedForUserIds: jsonb("deleted_for_user_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    unique("messages_sender_client_message_unique").on(
      table.senderUserId,
      table.clientMessageId,
    ),
    index("messages_connection_created_id_idx").on(
      table.connectionId,
      table.createdAt,
      table.id,
    ),
    index("messages_deleted_for_user_ids_gin_idx").using(
      "gin",
      table.deletedForUserIds,
    ),
    check(
      "messages_body_not_blank_check",
      sql`length(trim(${table.body})) > 0`,
    ),
  ],
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
  readAt: true,
  deletedForUserIds: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;

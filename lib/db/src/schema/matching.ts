import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const swipesTable = pgTable(
  "swipes",
  {
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "swipes_pkey",
      columns: [table.actorUserId, table.targetUserId],
    }),
    check(
      "swipes_users_differ_check",
      sql`${table.actorUserId} <> ${table.targetUserId}`,
    ),
    check(
      "swipes_action_check",
      sql`${table.action} in ('like', 'pass', 'super')`,
    ),
    index("swipes_target_action_idx").on(table.targetUserId, table.action),
  ],
);

export const connectionsTable = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLowId: uuid("user_low_id")
      .notNull()
      .references(() => usersTable.id),
    userHighId: uuid("user_high_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("matched"),
    matchedAt: timestamp("matched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    chatEnabledAt: timestamp("chat_enabled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "connections_user_order_check",
      sql`${table.userLowId} < ${table.userHighId}`,
    ),
    unique("connections_user_pair_unique").on(
      table.userLowId,
      table.userHighId,
    ),
    check(
      "connections_status_check",
      sql`${table.status} in ('matched', 'chat_enabled', 'closed')`,
    ),
    index("connections_user_low_updated_at_idx").on(
      table.userLowId,
      table.updatedAt,
    ),
    index("connections_user_high_updated_at_idx").on(
      table.userHighId,
      table.updatedAt,
    ),
  ],
);

export const insertSwipeSchema = createInsertSchema(swipesTable).omit({
  createdAt: true,
});
export const insertConnectionSchema = createInsertSchema(connectionsTable).omit(
  {
    id: true,
    matchedAt: true,
    chatEnabledAt: true,
    closedAt: true,
    createdAt: true,
    updatedAt: true,
  },
);

export type InsertSwipe = z.infer<typeof insertSwipeSchema>;
export type Swipe = typeof swipesTable.$inferSelect;
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connectionsTable.$inferSelect;

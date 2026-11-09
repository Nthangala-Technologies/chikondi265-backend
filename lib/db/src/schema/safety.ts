import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { connectionsTable } from "./matching";
import { usersTable } from "./users";

export const blocksTable = pgTable(
  "blocks",
  {
    blockerUserId: uuid("blocker_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "blocks_pkey",
      columns: [table.blockerUserId, table.blockedUserId],
    }),
    check(
      "blocks_users_differ_check",
      sql`${table.blockerUserId} <> ${table.blockedUserId}`,
    ),
    index("blocks_blocked_user_id_idx").on(table.blockedUserId),
  ],
);

export const reportsTable = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => usersTable.id),
    reportedUserId: uuid("reported_user_id")
      .notNull()
      .references(() => usersTable.id),
    connectionId: uuid("connection_id").references(() => connectionsTable.id),
    category: text("category").notNull(),
    details: varchar("details", { length: 1000 }),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(
      () => usersTable.id,
    ),
  },
  (table) => [
    check(
      "reports_users_differ_check",
      sql`${table.reporterUserId} <> ${table.reportedUserId}`,
    ),
    check(
      "reports_category_check",
      sql`${table.category} in ('harassment', 'scam', 'impersonation', 'underage', 'other')`,
    ),
    check(
      "reports_status_check",
      sql`${table.status} in ('open', 'under_review', 'actioned', 'dismissed')`,
    ),
    index("reports_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const insertBlockSchema = createInsertSchema(blocksTable).omit({
  createdAt: true,
});
export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolvedByUserId: true,
});

export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Block = typeof blocksTable.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;

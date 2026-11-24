import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

const planNames = ["daily", "weekly", "monthly"] as const;
export const subscriptionPlansTable = pgTable("subscription_plans", {
  plan: text("plan", { enum: planNames }).primaryKey(),
  amountMwk: integer("amount_mwk").notNull(),
}, (table) => [
  check("subscription_plans_plan_check", sql`${table.plan} in ('daily', 'weekly', 'monthly')`),
  check("subscription_plans_amount_check", sql`${table.amountMwk} > 0`),
]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: planNames }).notNull().references(() => subscriptionPlansTable.plan),
  status: text("status", { enum: ["active", "expired", "cancelled", "pending"] }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  provider: text("provider").notNull(),
}, (table) => [
  check("subscriptions_status_check", sql`${table.status} in ('active', 'expired', 'cancelled', 'pending')`),
  check("subscriptions_access_window_check", sql`${table.expiresAt} > ${table.startedAt}`),
  index("subscriptions_user_active_idx").on(table.userId, table.expiresAt)
    .where(sql`${table.status} = 'active'`),
]);

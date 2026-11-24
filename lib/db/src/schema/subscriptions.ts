import { sql } from "drizzle-orm";
import { char, check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

const planNames = ["daily", "weekly", "monthly"] as const;
export const subscriptionPlansTable = pgTable("subscription_plans", {
  plan: text("plan", { enum: planNames }).primaryKey(),
  amountMwk: integer("amount_mwk").notNull(),
}, (table) => [
  check("subscription_plans_plan_check", sql`${table.plan} in ('daily', 'weekly', 'monthly')`),
  check("subscription_plans_amount_check", sql`${table.amountMwk} > 0`),
]);

export const subscriptionPaymentAttemptsTable = pgTable("subscription_payment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: planNames }).notNull().references(() => subscriptionPlansTable.plan),
  provider: text("provider").notNull().default("paychangu"),
  txRef: text("tx_ref").notNull(),
  checkoutUrl: text("checkout_url"),
  providerTransactionId: text("provider_transaction_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  amountMwk: integer("amount_mwk").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("MWK"),
  status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull().default("pending"),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (table) => [
  unique("subscription_payment_attempts_tx_ref_unique").on(table.txRef),
  unique("subscription_payment_attempts_user_idempotency_unique").on(table.userId, table.idempotencyKey),
  unique("subscription_payment_attempts_provider_transaction_unique").on(table.provider, table.providerTransactionId),
  index("subscription_payment_attempts_user_created_idx").on(table.userId, table.createdAt),
  check("subscription_payment_attempts_amount_check", sql`${table.amountMwk} > 0`),
  check("subscription_payment_attempts_provider_check", sql`${table.provider} = 'paychangu'`),
  check("subscription_payment_attempts_currency_check", sql`${table.currency} = 'MWK'`),
  check("subscription_payment_attempts_status_check", sql`${table.status} in ('pending', 'succeeded', 'failed')`),
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

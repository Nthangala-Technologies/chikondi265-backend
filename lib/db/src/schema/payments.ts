import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  char,
  check,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { connectionsTable } from "./matching";
import { usersTable } from "./users";

export const paymentAttemptsTable = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connectionsTable.id),
    payerUserId: uuid("payer_user_id")
      .notNull()
      .references(() => usersTable.id),
    provider: text("provider").notNull(),
    txRef: text("tx_ref").notNull(),
    checkoutUrl: text("checkout_url"),
    providerTransactionId: text("provider_transaction_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    amountMwk: integer("amount_mwk").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("MWK"),
    status: text("status").notNull().default("pending"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    unique("payment_attempts_tx_ref_unique").on(table.txRef),
    unique("payment_attempts_payer_idempotency_unique").on(
      table.payerUserId,
      table.idempotencyKey,
    ),
    unique("payment_attempts_provider_transaction_unique").on(
      table.provider,
      table.providerTransactionId,
    ),
    uniqueIndex("payment_attempts_one_success_per_connection_idx")
      .on(table.connectionId)
      .where(sql`${table.status} = 'succeeded'`),
    index("payment_attempts_connection_id_idx").on(table.connectionId),
    check("payment_attempts_amount_check", sql`${table.amountMwk} > 0`),
    check(
      "payment_attempts_provider_check",
      sql`${table.provider} = 'paychangu'`,
    ),
    check(
      "payment_attempts_status_check",
      sql`${table.status} in ('pending', 'succeeded', 'failed', 'cancelled', 'reversed')`,
    ),
  ],
);

export const providerEventsTable = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    txRef: text("tx_ref").notNull(),
    eventType: text("event_type").notNull(),
    payloadSha256: char("payload_sha256", { length: 64 }).notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    processingStatus: text("processing_status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
  (table) => [
    unique("provider_events_dedupe_unique").on(
      table.provider,
      table.txRef,
      table.eventType,
      table.payloadSha256,
    ),
    check(
      "provider_events_processing_status_check",
      sql`${table.processingStatus} in ('received', 'processed', 'ignored', 'failed')`,
    ),
  ],
);

export const insertPaymentAttemptSchema = createInsertSchema(
  paymentAttemptsTable,
).omit({
  id: true,
  providerTransactionId: true,
  status: true,
  failureCode: true,
  createdAt: true,
  updatedAt: true,
  verifiedAt: true,
});
export const insertProviderEventSchema = createInsertSchema(
  providerEventsTable,
).omit({
  id: true,
  processingStatus: true,
  receivedAt: true,
  processedAt: true,
  errorCode: true,
});

export type InsertPaymentAttempt = z.infer<
  typeof insertPaymentAttemptSchema
>;
export type PaymentAttempt = typeof paymentAttemptsTable.$inferSelect;
export type InsertProviderEvent = z.infer<typeof insertProviderEventSchema>;
export type ProviderEvent = typeof providerEventsTable.$inferSelect;

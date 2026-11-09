import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authProvider: text("auth_provider").notNull(),
    authSubject: text("auth_subject").notNull(),
    email: varchar("email", { length: 320 }),
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("users_auth_provider_auth_subject_unique").on(
      table.authProvider,
      table.authSubject,
    ),
    unique("users_email_unique").on(table.email),
    check(
      "users_password_auth_fields_check",
      sql`${table.authProvider} <> 'password' OR (${table.email} IS NOT NULL AND ${table.passwordHash} IS NOT NULL)`,
    ),
    check(
      "users_status_check",
      sql`${table.status} in ('active', 'suspended', 'deleted')`,
    ),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

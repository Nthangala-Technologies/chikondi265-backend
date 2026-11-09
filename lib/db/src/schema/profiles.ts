import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  char,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const profilesTable = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    city: varchar("city", { length: 80 }).notNull(),
    countryCode: char("country_code", { length: 2 }).notNull().default("MW"),
    bio: varchar("bio", { length: 500 }).notNull().default(""),
    interests: text("interests")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    intention: varchar("intention", { length: 40 }).notNull(),
    visibilityStatus: text("visibility_status")
      .notNull()
      .default("active"),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
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
      "profiles_visibility_status_check",
      sql`${table.visibilityStatus} in ('active', 'paused', 'hidden', 'under_review', 'removed')`,
    ),
    check(
      "profiles_verification_status_check",
      sql`${table.verificationStatus} in ('unverified', 'pending', 'verified', 'rejected')`,
    ),
  ],
);

export const profilePhotosTable = pgTable(
  "profile_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    position: smallint("position").notNull(),
    moderationStatus: text("moderation_status")
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("profile_photos_object_key_unique").on(table.objectKey),
    unique("profile_photos_user_position_unique").on(
      table.userId,
      table.position,
    ),
    index("profile_photos_user_id_idx").on(table.userId),
    check(
      "profile_photos_moderation_status_check",
      sql`${table.moderationStatus} in ('pending', 'approved', 'rejected')`,
    ),
  ],
);

export const userPreferencesTable = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ageMin: smallint("age_min").notNull().default(18),
    ageMax: smallint("age_max").notNull().default(99),
    maxDistanceKm: integer("max_distance_km").notNull().default(100),
    intentions: text("intentions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    interests: text("interests")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    cities: text("cities")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("user_preferences_age_min_check", sql`${table.ageMin} >= 18`),
    check(
      "user_preferences_age_range_check",
      sql`${table.ageMax} >= ${table.ageMin}`,
    ),
    check(
      "user_preferences_max_distance_check",
      sql`${table.maxDistanceKm} > 0`,
    ),
  ],
);

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertProfilePhotoSchema = createInsertSchema(
  profilePhotosTable,
).omit({
  id: true,
  createdAt: true,
});
export const insertUserPreferencesSchema = createInsertSchema(
  userPreferencesTable,
).omit({
  updatedAt: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
export type InsertProfilePhoto = z.infer<typeof insertProfilePhotoSchema>;
export type ProfilePhoto = typeof profilePhotosTable.$inferSelect;
export type InsertUserPreferences = z.infer<
  typeof insertUserPreferencesSchema
>;
export type UserPreferences = typeof userPreferencesTable.$inferSelect;

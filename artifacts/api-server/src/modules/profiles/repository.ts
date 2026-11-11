import { and, eq } from "drizzle-orm";
import {
  db,
  profilesTable,
  userPreferencesTable,
  usersTable,
} from "@workspace/db";
import type {
  DiscoveryPreferencesInput,
  ProfileInput,
} from "@workspace/api-zod";

export async function getOwnProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);

  return profile ?? null;
}

export async function getOwnAccountEmail(userId: string) {
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return user?.email ?? null;
}

export async function saveOwnProfile(userId: string, input: ProfileInput) {
  const values = {
    displayName: input.displayName.trim(),
    birthDate: input.birthDate,
    city: input.city.trim(),
    countryCode: input.countryCode?.trim() ?? "MW",
    bio: input.bio?.trim() ?? "",
    interests: (input.interests ?? []).map((interest) => interest.trim()),
    intention: input.intention.trim(),
  };

  const [profile] = await db
    .insert(profilesTable)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: profilesTable.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  return profile;
}

export async function getOwnPreferences(userId: string) {
  const [preferences] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);

  return preferences ?? null;
}

export async function saveOwnPreferences(
  userId: string,
  input: DiscoveryPreferencesInput,
) {
  const values = {
    ageMin: input.ageMin,
    ageMax: input.ageMax,
    intentions: input.intentions.map((value) => value.trim()),
    interests: input.interests.map((value) => value.trim()),
    cities: input.cities.map((value) => value.trim()),
  };

  const [preferences] = await db
    .insert(userPreferencesTable)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();

  return preferences;
}

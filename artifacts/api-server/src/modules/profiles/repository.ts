import { and, eq } from "drizzle-orm";
import {
  db,
  profilesTable,
  usersTable,
} from "@workspace/db";
import type { ProfileInput } from "@workspace/api-zod";

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

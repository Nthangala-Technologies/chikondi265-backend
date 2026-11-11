import { and, eq } from "drizzle-orm";
import {
  db,
  profilePhotosTable,
  profilesTable,
  userPreferencesTable,
  usersTable,
} from "@workspace/db";
import type {
  DiscoveryPreferencesInput,
  ProfileInput,
} from "@workspace/api-zod";
import {
  avatarIdFromObjectKey,
  avatarObjectKey,
  defaultAvatarForUser,
  type GeneratedProfileAvatarId,
} from "./avatars";

export async function getOwnProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);

  return profile
    ? { ...profile, photoId: await getOwnProfilePhotoId(userId) }
    : null;
}

export async function getOwnProfilePhotoId(userId: string) {
  const [photo] = await db
    .select({ objectKey: profilePhotosTable.objectKey })
    .from(profilePhotosTable)
    .where(
      and(
        eq(profilePhotosTable.userId, userId),
        eq(profilePhotosTable.position, 0),
        eq(profilePhotosTable.moderationStatus, "approved"),
      ),
    )
    .limit(1);

  return avatarIdFromObjectKey(photo?.objectKey) ?? defaultAvatarForUser(userId);
}

export async function saveOwnProfilePhotoId(
  userId: string,
  avatarId: GeneratedProfileAvatarId,
) {
  await db
    .insert(profilePhotosTable)
    .values({
      userId,
      objectKey: avatarObjectKey(userId, avatarId),
      position: 0,
      moderationStatus: "approved",
    })
    .onConflictDoUpdate({
      target: [profilePhotosTable.userId, profilePhotosTable.position],
      set: {
        objectKey: avatarObjectKey(userId, avatarId),
        moderationStatus: "approved",
        createdAt: new Date(),
      },
    });
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

  if (input.photoId) {
    await saveOwnProfilePhotoId(userId, input.photoId);
  }

  return { ...profile, photoId: await getOwnProfilePhotoId(userId) };
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

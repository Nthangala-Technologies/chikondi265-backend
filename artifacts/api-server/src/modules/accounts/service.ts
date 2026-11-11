import { and, eq, isNull, ne } from "drizzle-orm";
import {
  authSessionsTable,
  db,
  profilesTable,
  usersTable,
} from "@workspace/db";
import { ApiError } from "../../middleware/error-handler";
import { hashPassword, verifyPassword } from "../auth/security";

export async function changeCurrentPassword(
  userId: string,
  currentSessionTokenHash: string,
  currentPassword: string,
  newPassword: string,
) {
  const [user] = await db
    .select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "The current password is incorrect.",
    );
  }

  if (currentPassword === newPassword) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Choose a new password different from the current password.",
      { newPassword: ["The new password must be different."] },
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    const [updatedUser] = await tx
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });

    if (!updatedUser) {
      throw new ApiError(404, "NOT_FOUND", "Account not found.");
    }

    await tx
      .delete(authSessionsTable)
      .where(
        and(
          eq(authSessionsTable.userId, userId),
          ne(authSessionsTable.tokenHash, currentSessionTokenHash),
        ),
      );
  });
}

export async function softDeleteCurrentAccount(userId: string) {
  const now = new Date();

  await db.transaction(async (tx) => {
    const [updatedUser] = await tx
      .update(usersTable)
      .set({ status: "deleted", deletedAt: now })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });

    if (!updatedUser) {
      throw new ApiError(404, "NOT_FOUND", "Account not found.");
    }

    const [updatedProfile] = await tx
      .update(profilesTable)
      .set({ visibilityStatus: "removed" })
      .where(eq(profilesTable.userId, userId))
      .returning({ userId: profilesTable.userId });

    if (!updatedProfile) {
      throw new ApiError(404, "NOT_FOUND", "Profile not found.");
    }

    await tx
      .update(authSessionsTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(authSessionsTable.userId, userId),
          isNull(authSessionsTable.revokedAt),
        ),
      );
  });

  return { deleted: true as const };
}

export async function setCurrentProfileVisibility(
  userId: string,
  visibilityStatus: "active" | "paused",
) {
  const [profile] = await db
    .update(profilesTable)
    .set({ visibilityStatus })
    .where(eq(profilesTable.userId, userId))
    .returning();

  if (!profile) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found.");
  }

  return profile;
}

import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { RegisterProfileInput } from "@workspace/api-zod";
import {
  authSessionsTable,
  db,
  profilesTable,
  usersTable,
} from "@workspace/db";
import { ApiError } from "../../middleware/error-handler";
import { assertValidRegistrationPassword } from "./registration-validation";
import { isAtLeast18 } from "../profiles/age-policy";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  sessionExpiry,
  verifyPassword,
} from "./security";

export type RegisterAccountInput = {
  identifier: string;
  password: string;
  profile: RegisterProfileInput;
};

export type LoginAccountInput = {
  identifier: string;
  password: string;
};

function normalizeIdentifier(value: string): { email: string | null; phone: string | null } {
  const identifier = value.trim();
  if (identifier.includes("@")) {
    const email = normalizeEmail(identifier);
    if (
      email.length <= 320 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return { email, phone: null };
    }
  } else {
    const compactPhone = identifier.replace(/[\s()-]/g, "");
    const phone = compactPhone.startsWith("+265")
      ? compactPhone
      : compactPhone.startsWith("265")
        ? `+${compactPhone}`
        : compactPhone.startsWith("0")
          ? `+265${compactPhone.slice(1)}`
          : "";
    if (/^\+265\d{9}$/.test(phone)) {
      return { email: null, phone };
    }
  }

  throw new ApiError(
    400,
    "BAD_REQUEST",
    "Enter a valid email address or Malawi phone number.",
    { identifier: ["Enter a valid email address or Malawi phone number."] },
  );
}

function normalizeProfile(profile: RegisterProfileInput) {
  const firstName = profile.firstName.trim();
  const lastName = profile.lastName.trim();
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, value] of [
    ["firstName", firstName],
    ["lastName", lastName],
  ] as const) {
    if (!value) fieldErrors[field] = [`${field === "firstName" ? "Name" : "Surname"} is required.`];
    else if (value.length > 50) {
      fieldErrors[field] = [`${field === "firstName" ? "Name" : "Surname"} must be 50 characters or fewer.`];
    } else if (/\d/.test(value)) {
      fieldErrors[field] = [`${field === "firstName" ? "Name" : "Surname"} cannot include numbers.`];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Enter a valid name and surname.",
      fieldErrors,
    );
  }

  return {
    displayName: `${firstName} ${lastName}`,
    birthDate: profile.birthDate,
    city: profile.city.trim(),
    countryCode: profile.countryCode?.trim() ?? "MW",
    bio: profile.bio?.trim() ?? "",
    interests: (profile.interests ?? []).map((interest) => interest.trim()),
    intention: profile.intention.trim(),
  };
}

function isEmailUniqueViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let candidate: unknown = error;

  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    const databaseError = candidate as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "users_email_unique"
    ) {
      return true;
    }
    candidate = databaseError.cause;
  }

  return false;
}

function isPhoneUniqueViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let candidate: unknown = error;

  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    const databaseError = candidate as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "users_phone_unique"
    ) {
      return true;
    }
    candidate = databaseError.cause;
  }

  return false;
}

async function saveSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = sessionExpiry();

  await db.insert(authSessionsTable).values({
    tokenHash,
    userId,
    expiresAt,
  });

  return { token, tokenHash, expiresAt };
}

export async function registerAccount(input: RegisterAccountInput) {
  assertValidRegistrationPassword(input.password);

  const { email, phone } = normalizeIdentifier(input.identifier);
  const passwordHash = await hashPassword(input.password);
  const profile = normalizeProfile(input.profile);

  if (!isAtLeast18(profile.birthDate)) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "You must be at least 18 to create an account.",
    );
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const [user] = await transaction
        .insert(usersTable)
        .values({
          authProvider: "password",
          authSubject: randomUUID(),
          email,
          phone,
          passwordHash,
        })
        .returning({
          id: usersTable.id,
          email: usersTable.email,
        });

      const [savedProfile] = await transaction
        .insert(profilesTable)
        .values({ userId: user.id, ...profile })
        .returning();

      const token = createSessionToken();
      const tokenHash = hashSessionToken(token);
      const expiresAt = sessionExpiry();
      await transaction.insert(authSessionsTable).values({
        tokenHash,
        userId: user.id,
        expiresAt,
      });

      return {
        token,
        expiresAt,
        userId: user.id,
        email: user.email,
        profile: savedProfile,
      };
    });

    return result;
  } catch (error) {
    if (isEmailUniqueViolation(error)) {
      throw new ApiError(
        409,
        "CONFLICT",
        "An account with this email address already exists.",
        { identifier: ["An account with this email address already exists."] },
      );
    }
    if (isPhoneUniqueViolation(error)) {
      throw new ApiError(
        409,
        "CONFLICT",
        "An account with this phone number already exists.",
        { identifier: ["An account with this phone number already exists."] },
      );
    }
    throw error;
  }
}

export async function loginAccount(input: LoginAccountInput) {
  const identifier = normalizeIdentifier(input.identifier);
  const query = db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      passwordHash: usersTable.passwordHash,
      status: usersTable.status,
      deletedAt: usersTable.deletedAt,
    })
    .from(usersTable);
  const accounts = identifier.email
    ? await query.where(eq(usersTable.email, identifier.email)).limit(1)
    : await query.where(eq(usersTable.phone, identifier.phone!)).limit(1);
  const [account] = accounts;

  const passwordMatches = await verifyPassword(
    input.password,
    account?.passwordHash ?? null,
  );

  if (!account || !account.passwordHash || !passwordMatches) {
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Email or phone number and password do not match.",
    );
  }

  if (account.status !== "active" || account.deletedAt) {
    throw new ApiError(403, "FORBIDDEN", "This account is not available.");
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, account.id))
    .limit(1);
  const session = await saveSession(account.id);

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    userId: account.id,
    email: account.email,
    profile: profile ?? null,
  };
}

export async function resolveSession(tokenHash: string) {
  const [session] = await db
    .select({
      userId: usersTable.id,
      status: usersTable.status,
      deletedAt: usersTable.deletedAt,
    })
    .from(authSessionsTable)
    .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(authSessionsTable.tokenHash, tokenHash),
        gt(authSessionsTable.expiresAt, new Date()),
        isNull(authSessionsTable.revokedAt),
      ),
    )
    .limit(1);

  return session ?? null;
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await db
    .update(authSessionsTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessionsTable.tokenHash, tokenHash),
        isNull(authSessionsTable.revokedAt),
      ),
    );
}

import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyPasswordHash: Promise<string> | undefined;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  let hash = passwordHash;
  if (!hash) {
    dummyPasswordHash ??= hashPassword(randomBytes(32).toString("base64url"));
    hash = await dummyPasswordHash;
  }
  const valid = await argon2.verify(hash, password);
  return Boolean(passwordHash) && valid;
}

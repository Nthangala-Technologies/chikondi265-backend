import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  sessionExpiry,
  verifyPassword,
} from "../src/modules/auth/security.ts";
import { ApiError } from "../src/middleware/error-handler.ts";
import { assertValidRegistrationPassword } from "../src/modules/auth/registration-validation.ts";
import { isAtLeast18 } from "../src/modules/profiles/age-policy.ts";

test("weak registration passwords fail with HTTP 400 and password field errors", () => {
  assert.throws(
    () => assertValidRegistrationPassword("weak-password"),
    (error) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      Boolean(error.fieldErrors?.password?.length),
  );
});

test("normalizes email before account lookup and uniqueness checks", () => {
  assert.equal(normalizeEmail("  PERSON@Example.COM "), "person@example.com");
});

test("creates opaque revocable session tokens and hashes them for storage", () => {
  const token = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
  assert.notEqual(hashSessionToken(token), token);
  assert.notEqual(hashSessionToken(token), hashSessionToken(createSessionToken()));
});

test("hashes passwords with Argon2id and rejects incorrect passwords", async () => {
  const hash = await hashPassword("a-long-password-for-testing");
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword("a-long-password-for-testing", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword("wrong-password", null), false);
});

test("session expiration is thirty days after creation", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    sessionExpiry(now).toISOString(),
    "2026-01-31T00:00:00.000Z",
  );
});

test("registration age policy rejects underage, future, and malformed dates", () => {
  assert.equal(isAtLeast18("2008-01-01", new Date("2026-01-01T12:00:00Z")), true);
  assert.equal(isAtLeast18("2008-01-02", new Date("2026-01-01T12:00:00Z")), false);
  assert.equal(isAtLeast18("2027-01-01", new Date("2026-01-01T12:00:00Z")), false);
  assert.equal(isAtLeast18("not-a-date", new Date("2026-01-01T12:00:00Z")), false);
});

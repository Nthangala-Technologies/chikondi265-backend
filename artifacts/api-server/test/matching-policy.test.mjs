import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalUserPair,
  isEligibleViewer,
  isPositiveSwipe,
} from "../src/modules/matching/policy.ts";

const eligibleViewer = {
  userId: "00000000-0000-0000-0000-000000000001",
  userStatus: "active",
  deletedAt: null,
  age: 18,
  profile: {
    displayName: "Test",
    birthDate: "2008-01-01",
    city: "Lilongwe",
    countryCode: "MW",
    bio: "",
    interests: [],
    intention: "long-term",
    visibilityStatus: "active",
  },
  preferences: {
    ageMin: 18,
    ageMax: 99,
    intentions: [],
    interests: [],
    cities: [],
  },
};

test("requires an active, visible adult profile", () => {
  assert.equal(isEligibleViewer(eligibleViewer), true);
  assert.equal(isEligibleViewer(null), false);
  assert.equal(
    isEligibleViewer({ ...eligibleViewer, userStatus: "suspended" }),
    false,
  );
  assert.equal(
    isEligibleViewer({ ...eligibleViewer, deletedAt: new Date() }),
    false,
  );
  assert.equal(
    isEligibleViewer({
      ...eligibleViewer,
      profile: { ...eligibleViewer.profile, visibilityStatus: "paused" },
    }),
    false,
  );
  assert.equal(isEligibleViewer({ ...eligibleViewer, age: 17 }), false);
});

test("treats like and super as positive swipes, but not pass", () => {
  assert.equal(isPositiveSwipe("like"), true);
  assert.equal(isPositiveSwipe("super"), true);
  assert.equal(isPositiveSwipe("pass"), false);
});

test("canonicalizes a pair consistently regardless of swipe direction", () => {
  const first = "00000000-0000-0000-0000-000000000001";
  const second = "00000000-0000-0000-0000-000000000002";
  assert.deepEqual(canonicalUserPair(first, second), [first, second]);
  assert.deepEqual(canonicalUserPair(second, first), [first, second]);
});

export interface MatchingViewer {
  userId: string;
  userStatus: string;
  deletedAt: Date | null;
  age: number;
  profile: {
    displayName: string;
    birthDate: string;
    city: string;
    countryCode: string;
    bio: string;
    interests: string[];
    intention: string;
    visibilityStatus: string;
  };
  preferences: {
    ageMin: number;
    ageMax: number;
    intentions: string[];
    interests: string[];
    cities: string[];
  };
}

const legacyProfileIntentions: Record<string, string> = {
  LONG: "long-term",
  "LONG-TERM": "long-term",
  SHORT: "short-term",
  "SHORT-TERM": "short-term",
  CASUAL: "casual",
  FRIENDSHIP: "friendship",
  MARRIAGE: "marriage",
  UNSURE: "unsure",
};

export function normalizeProfileIntention(value: string): string {
  const trimmed = value.trim();
  return legacyProfileIntentions[trimmed.toUpperCase()] ?? trimmed;
}

export function isEligibleViewer(
  viewer: MatchingViewer | null,
): viewer is MatchingViewer {
  return Boolean(
    viewer &&
      viewer.userStatus === "active" &&
      viewer.deletedAt === null &&
      viewer.profile.visibilityStatus === "active" &&
      viewer.age >= 18,
  );
}

export function isPositiveSwipe(action: "like" | "pass" | "super"): boolean {
  return action === "like" || action === "super";
}

export function canonicalUserPair(
  firstUserId: string,
  secondUserId: string,
): [string, string] {
  return firstUserId < secondUserId
    ? [firstUserId, secondUserId]
    : [secondUserId, firstUserId];
}

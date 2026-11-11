import type {
  DiscoveryPreferencesInput,
  ProfileInput,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import {
  getOwnAccountEmail,
  getOwnPreferences,
  getOwnProfile,
  saveOwnPreferences,
  saveOwnProfile,
} from "./repository";
import { isAtLeast18 } from "./age-policy";

export { isAtLeast18 } from "./age-policy";

export async function getCurrentUserProfile(userId: string) {
  return {
    userId,
    email: await getOwnAccountEmail(userId),
    profile: await getOwnProfile(userId),
  };
}

export async function saveCurrentUserProfile(
  userId: string,
  input: ProfileInput,
) {
  const normalized = {
    ...input,
    displayName: input.displayName.trim(),
    city: input.city.trim(),
    bio: input.bio?.trim() ?? "",
    intention: input.intention.trim(),
    interests: input.interests?.map((interest) => interest.trim()) ?? [],
  };

  const fieldErrors: Record<string, string[]> = {};
  if (!normalized.displayName) {
    fieldErrors.displayName = ["Enter a display name."];
  }
  if (!normalized.city) {
    fieldErrors.city = ["Enter a city."];
  }
  if (!normalized.intention) {
    fieldErrors.intention = ["Choose an intention."];
  }
  if (normalized.interests.some((interest) => !interest)) {
    fieldErrors.interests = ["Remove blank interests."];
  } else if (new Set(normalized.interests).size !== normalized.interests.length) {
    fieldErrors.interests = ["Each interest must be unique."];
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Some profile fields need attention.",
      fieldErrors,
    );
  }

  if (!isAtLeast18(normalized.birthDate)) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "You must be at least 18 to create a profile.",
      { birthDate: ["You must be at least 18 years old."] },
    );
  }

  return saveOwnProfile(userId, normalized);
}

export async function getCurrentPreferences(userId: string) {
  const preferences = await getOwnPreferences(userId);
  return {
    ageMin: preferences?.ageMin ?? 18,
    ageMax: preferences?.ageMax ?? 99,
    intentions: preferences?.intentions ?? [],
    interests: preferences?.interests ?? [],
    cities: preferences?.cities ?? [],
    updatedAt: preferences?.updatedAt?.toISOString() ?? null,
  };
}

export async function saveCurrentPreferences(
  userId: string,
  input: DiscoveryPreferencesInput,
) {
  if (input.ageMax < input.ageMin) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The maximum age must be greater than or equal to the minimum age.",
      { ageMax: ["Choose an age at or above the minimum."] },
    );
  }

  const normalizeUnique = (values: string[]) => {
    const normalized = values.map((value) => value.trim());
    if (normalized.some((value) => value.length === 0)) return null;
    if (new Set(normalized.map((value) => value.toLowerCase())).size !== normalized.length) {
      return null;
    }
    return normalized;
  };
  const intentions = normalizeUnique(input.intentions);
  const interests = normalizeUnique(input.interests);
  const cities = normalizeUnique(input.cities);
  if (!intentions || !interests || !cities) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Preference values must be non-empty and unique.",
    );
  }

  const saved = await saveOwnPreferences(userId, {
    ageMin: input.ageMin,
    ageMax: input.ageMax,
    intentions,
    interests,
    cities,
  });
  return {
    ageMin: saved.ageMin,
    ageMax: saved.ageMax,
    intentions: saved.intentions,
    interests: saved.interests,
    cities: saved.cities,
    updatedAt: saved.updatedAt.toISOString(),
  };
}


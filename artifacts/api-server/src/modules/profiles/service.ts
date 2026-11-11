import type { ProfileInput } from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import {
  getOwnAccountEmail,
  getOwnProfile,
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


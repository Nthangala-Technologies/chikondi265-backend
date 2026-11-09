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
  };

  if (
    !normalized.displayName ||
    !normalized.city ||
    !normalized.intention
  ) {
    throw new ApiError(400, "BAD_REQUEST", "Required profile fields are empty.");
  }

  if (!isAtLeast18(normalized.birthDate)) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "You must be at least 18 to create a profile.",
    );
  }

  return saveOwnProfile(userId, normalized);
}


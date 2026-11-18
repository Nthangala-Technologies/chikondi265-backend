export const generatedProfileAvatarIds = [
  "woman-01",
  "woman-02",
  "woman-03",
  "man-01",
  "man-02",
  "man-03",
] as const;

export type GeneratedProfileAvatarId =
  (typeof generatedProfileAvatarIds)[number];

export function defaultAvatarForUser(userId: string): GeneratedProfileAvatarId {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return generatedProfileAvatarIds[hash % generatedProfileAvatarIds.length];
}

export function avatarIdFromObjectKey(
  objectKey: string | null | undefined,
): GeneratedProfileAvatarId | null {
  const avatarId = objectKey?.split(":").at(-1);
  return generatedProfileAvatarIds.find((candidate) => candidate === avatarId) ?? null;
}

export function profilePhotoUrlFromObjectKey(
  objectKey: string | null | undefined,
): string | null {
  if (!objectKey) return null;
  if (objectKey.startsWith("db-photo:")) {
    const dataMarker = objectKey.indexOf(":data:");
    const dataUrl = dataMarker >= 0 ? objectKey.slice(dataMarker + 1) : "";
    return /^data:image\/(?:jpeg|png|webp);base64,/.test(dataUrl)
      ? dataUrl
      : null;
  }
  if (/^data:image\/(?:jpeg|png|webp);base64,/.test(objectKey)) {
    return objectKey;
  }
  if (!objectKey?.startsWith("profile-photos/")) return null;
  return `/uploads/${objectKey}`;
}

export function avatarObjectKey(
  userId: string,
  avatarId: GeneratedProfileAvatarId,
): string {
  return `chikondi-ai-avatar:${userId}:${avatarId}`;
}

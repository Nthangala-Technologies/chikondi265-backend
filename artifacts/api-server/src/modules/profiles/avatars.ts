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

export function avatarObjectKey(
  userId: string,
  avatarId: GeneratedProfileAvatarId,
): string {
  return `chikondi-ai-avatar:${userId}:${avatarId}`;
}

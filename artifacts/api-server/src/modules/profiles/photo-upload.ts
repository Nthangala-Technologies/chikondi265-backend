import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ApiError } from "../../middleware/error-handler";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ProfilePhotoMimeType = keyof typeof imageTypes;

export function profilePhotoUploadDirectory(): string {
  const configured = process.env.PROFILE_PHOTO_UPLOAD_DIR?.trim();
  return configured
    ? resolve(configured)
    : resolve(tmpdir(), "chikondi265-profile-uploads");
}

function assertImageData(
  data: Buffer,
  mimeType: string,
): asserts mimeType is ProfilePhotoMimeType {
  if (!(mimeType in imageTypes)) {
    throw new ApiError(
      415,
      "BAD_REQUEST",
      "Choose a JPEG, PNG, or WebP image.",
      { photo: ["Only JPEG, PNG, and WebP images are supported."] },
    );
  }
  if (data.byteLength === 0) {
    throw new ApiError(400, "BAD_REQUEST", "The selected image is empty.", {
      photo: ["Choose a non-empty image."],
    });
  }
  if (data.byteLength > MAX_PROFILE_PHOTO_BYTES) {
    throw new ApiError(413, "BAD_REQUEST", "The image must be 5 MB or smaller.", {
      photo: ["The image must be 5 MB or smaller."],
    });
  }

  const validSignature =
    (mimeType === "image/jpeg" &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff) ||
    (mimeType === "image/png" &&
      data.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )) ||
    (mimeType === "image/webp" &&
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP");

  if (!validSignature) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The image content does not match its file type.",
      { photo: ["Choose a valid JPEG, PNG, or WebP image."] },
    );
  }
}

export async function storeProfilePhotoFile(
  userId: string,
  data: Buffer,
  mimeType: string,
): Promise<{ objectKey: string; filePath: string }> {
  assertImageData(data, mimeType);
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw new ApiError(400, "BAD_REQUEST", "The account identifier is invalid.");
  }

  const objectKey = `profile-photos/${userId}/${randomUUID()}.${imageTypes[mimeType]}`;
  const filePath = join(profilePhotoUploadDirectory(), ...objectKey.split("/"));
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, data, { flag: "wx", mode: 0o640 });
  return { objectKey, filePath };
}

export async function removeStoredProfilePhoto(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

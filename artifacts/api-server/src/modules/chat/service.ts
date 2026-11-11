import { ApiError } from "../../middleware/error-handler";
import {
  findChatAccess,
  listConnectionMessages,
  markIncomingMessagesRead,
  saveConnectionMessage,
  type MessageCursor,
} from "./repository";

const pageSize = 30;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SerializedConnectionMessage = {
  id: string;
  connectionId: string;
  senderUserId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function serializeMessage(
  message: Awaited<ReturnType<typeof listConnectionMessages>>[number],
): SerializedConnectionMessage {
  return {
    id: message.id,
    connectionId: message.connectionId,
    senderUserId: message.senderUserId,
    clientMessageId: message.clientMessageId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
  };
}

function encodeCursor(message: { id: string; createdAt: Date }): string {
  return Buffer.from(
    JSON.stringify({
      id: message.id,
      createdAt: message.createdAt.toISOString(),
    }),
  ).toString("base64url");
}

function decodeCursor(value: string): MessageCursor {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Message cursor is invalid.");
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { id?: unknown; createdAt?: unknown };
    if (
      typeof parsed.id !== "string" ||
      !uuidPattern.test(parsed.id) ||
      typeof parsed.createdAt !== "string"
    ) {
      throw new Error("Invalid cursor fields");
    }

    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime())) {
      throw new Error("Invalid cursor date");
    }
    return { id: parsed.id, createdAt };
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Message cursor is invalid.");
  }
}

export async function assertChatAccess(
  userId: string,
  connectionId: string,
): Promise<void> {
  if (!(await findChatAccess(userId, connectionId))) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Chat is unavailable for this connection.",
    );
  }
}

export async function getConnectionMessagePage(
  userId: string,
  connectionId: string,
  cursorValue?: string,
) {
  await assertChatAccess(userId, connectionId);
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  const rows = await listConnectionMessages(connectionId, cursor);
  const page = rows.slice(0, pageSize);
  const unreadIds = page
    .filter((message) => message.senderUserId !== userId && !message.readAt)
    .map((message) => message.id);
  const readAt = unreadIds.length > 0 ? new Date() : null;
  await markIncomingMessagesRead(userId, unreadIds);
  return {
    items: page.map((message) =>
      serializeMessage({
        ...message,
        readAt:
          message.readAt ??
          (message.senderUserId !== userId && unreadIds.includes(message.id)
            ? readAt
            : null),
      }),
    ),
    nextCursor:
      rows.length > pageSize && page.length > 0
        ? encodeCursor(page[page.length - 1]!)
        : null,
  };
}

export async function createConnectionMessage(input: {
  userId: string;
  connectionId: string;
  clientMessageId: string;
  body: string;
}) {
  await assertChatAccess(input.userId, input.connectionId);
  const saved = await saveConnectionMessage({
    connectionId: input.connectionId,
    senderUserId: input.userId,
    clientMessageId: input.clientMessageId,
    body: input.body.trim(),
  });

  if (!saved.message) {
    throw new ApiError(
      409,
      "CONFLICT",
      "This client message ID was already used.",
    );
  }

  return {
    message: serializeMessage(saved.message),
    created: saved.created,
  };
}
export {};

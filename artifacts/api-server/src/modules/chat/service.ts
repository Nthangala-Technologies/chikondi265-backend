import { ApiError } from "../../middleware/error-handler";
import {
  clearConnectionMessagesForEveryone,
  clearConnectionMessagesForUser,
  deleteConnectionMessageForEveryone,
  findMessageForAction,
  findChatAccess,
  hideConnectionMessageForUser,
  listConnectionMessages,
  markIncomingMessagesRead,
  saveConnectionMessage,
  type MessageCursor,
  updateConnectionMessage,
} from "./repository";
import { publishUserDataUpdates } from "../realtime/service";
import { findActiveSubscription } from "../subscriptions/repository";
import {
  publishConnectionEvent,
  publishConnectionMessage,
} from "./realtime";

const pageSize = 30;
const messageActionWindowMs = 2 * 60 * 60 * 1000;
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
) {
  const access = await findChatAccess(userId, connectionId);
  if (!access) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Chat is unavailable for this connection.",
    );
  }
  const subscription = await findActiveSubscription(userId);
  if (!subscription) {
    throw new ApiError(403, "FORBIDDEN", "An active chat subscription is required.");
  }
  return { ...access, subscriptionExpiresAt: subscription.expiresAt };
}

function assertMessageActionWindow(
  createdAt: Date,
  action: "delete" | "edit",
): void {
  if (Date.now() - createdAt.getTime() > messageActionWindowMs) {
    throw new ApiError(
      409,
      "CONFLICT",
      action === "delete"
        ? "Messages older than 2 hours cannot be deleted."
        : "Messages older than 2 hours cannot be edited.",
    );
  }
}

export async function getConnectionMessagePage(
  userId: string,
  connectionId: string,
  cursorValue?: string,
) {
  const access = await assertChatAccess(userId, connectionId);
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  const rows = await listConnectionMessages(
    userId,
    connectionId,
    access.clearedAt,
    cursor,
  );
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
  const access = await assertChatAccess(input.userId, input.connectionId);
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
  if (saved.created) {
    await publishUserDataUpdates(access.participants);
  }

  return {
    message: serializeMessage(saved.message),
    created: saved.created,
  };
}

export async function editConnectionMessage(input: {
  userId: string;
  messageId: string;
  body: string;
}) {
  const message = await findMessageForAction(input.messageId);
  if (!message) {
    throw new ApiError(404, "NOT_FOUND", "Message not found.");
  }
  const access = await assertChatAccess(input.userId, message.connectionId);
  if (message.senderUserId !== input.userId) {
    throw new ApiError(403, "FORBIDDEN", "Only the sender can edit this message.");
  }
  assertMessageActionWindow(message.createdAt, "edit");

  const updated = await updateConnectionMessage({
    messageId: message.id,
    senderUserId: input.userId,
    body: input.body.trim(),
  });
  if (!updated) {
    throw new ApiError(409, "CONFLICT", "The message can no longer be edited.");
  }

  const serialized = serializeMessage(updated);
  publishConnectionMessage(message.connectionId, serialized);
  await publishUserDataUpdates(access.participants);
  return serialized;
}

export async function deleteConnectionMessage(input: {
  userId: string;
  messageId: string;
  scope: "me" | "everyone";
}) {
  const message = await findMessageForAction(input.messageId);
  if (!message) {
    throw new ApiError(404, "NOT_FOUND", "Message not found.");
  }
  const access = await assertChatAccess(input.userId, message.connectionId);
  assertMessageActionWindow(message.createdAt, "delete");

  if (input.scope === "everyone") {
    if (message.senderUserId !== input.userId) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only the sender can delete this message for everyone.",
      );
    }
    const deleted = await deleteConnectionMessageForEveryone(
      message.id,
      input.userId,
    );
    if (!deleted) {
      throw new ApiError(409, "CONFLICT", "The message can no longer be deleted.");
    }
    publishConnectionEvent(message.connectionId, {
      type: "message-deleted",
      messageId: message.id,
      scope: "everyone",
      userId: input.userId,
    });
    await publishUserDataUpdates(access.participants);
  } else {
    const hidden = await hideConnectionMessageForUser(
      message.id,
      input.userId,
    );
    if (!hidden) {
      throw new ApiError(409, "CONFLICT", "The message can no longer be deleted.");
    }
    publishConnectionEvent(message.connectionId, {
      type: "message-deleted",
      messageId: message.id,
      scope: "me",
      userId: input.userId,
    });
    await publishUserDataUpdates([input.userId]);
  }

  return { changed: true as const };
}

export async function clearConnectionMessages(input: {
  userId: string;
  connectionId: string;
  scope: "me" | "everyone";
}) {
  const access = await assertChatAccess(input.userId, input.connectionId);
  if (input.scope === "me") {
    const cleared = await clearConnectionMessagesForUser(
      input.connectionId,
      input.userId,
      access.userLowId,
    );
    if (!cleared) {
      throw new ApiError(404, "NOT_FOUND", "Connection not found.");
    }
    publishConnectionEvent(input.connectionId, {
      type: "chat-cleared",
      scope: "me",
      userId: input.userId,
    });
    await publishUserDataUpdates([input.userId]);
  } else {
    await clearConnectionMessagesForEveryone(input.connectionId);
    publishConnectionEvent(input.connectionId, {
      type: "chat-cleared",
      scope: "everyone",
      userId: input.userId,
    });
    await publishUserDataUpdates(access.participants);
  }
  return { changed: true as const };
}
export {};

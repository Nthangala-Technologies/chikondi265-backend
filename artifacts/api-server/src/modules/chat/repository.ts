import { and, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import {
  blocksTable,
  connectionsTable,
  db,
  messagesTable,
  type Message,
} from "@workspace/db";

export type MessageCursor = {
  createdAt: Date;
  id: string;
};

export async function findChatAccess(
  userId: string,
  connectionId: string,
): Promise<string[] | null> {
  const [connection] = await db
    .select({
      userLowId: connectionsTable.userLowId,
      userHighId: connectionsTable.userHighId,
      status: connectionsTable.status,
      closedAt: connectionsTable.closedAt,
    })
    .from(connectionsTable)
    .where(eq(connectionsTable.id, connectionId))
    .limit(1);

  if (
    !connection ||
    (connection.userLowId !== userId && connection.userHighId !== userId) ||
    connection.status !== "chat_enabled" ||
    connection.closedAt
  ) {
    return null;
  }

  const [block] = await db
    .select({ blockerUserId: blocksTable.blockerUserId })
    .from(blocksTable)
    .where(
      or(
        and(
          eq(blocksTable.blockerUserId, connection.userLowId),
          eq(blocksTable.blockedUserId, connection.userHighId),
        ),
        and(
          eq(blocksTable.blockerUserId, connection.userHighId),
          eq(blocksTable.blockedUserId, connection.userLowId),
        ),
      ),
    )
    .limit(1);

  if (block) return null;
  return [connection.userLowId, connection.userHighId];
}

export async function listConnectionMessages(
  connectionId: string,
  cursor: MessageCursor | null,
): Promise<Message[]> {
  const cursorCondition = cursor
    ? or(
        lt(messagesTable.createdAt, cursor.createdAt),
        and(
          eq(messagesTable.createdAt, cursor.createdAt),
          lt(messagesTable.id, cursor.id),
        ),
      )
    : undefined;

  return db
    .select()
    .from(messagesTable)
    .where(
      cursorCondition
        ? and(eq(messagesTable.connectionId, connectionId), cursorCondition)
        : eq(messagesTable.connectionId, connectionId),
    )
    .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
    .limit(31);
}

export async function markIncomingMessagesRead(
  userId: string,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  await db
    .update(messagesTable)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(messagesTable.id, messageIds),
        ne(messagesTable.senderUserId, userId),
        isNull(messagesTable.readAt),
      ),
    );
}

export async function saveConnectionMessage(input: {
  connectionId: string;
  senderUserId: string;
  clientMessageId: string;
  body: string;
}): Promise<{ message: Message | null; created: boolean }> {
  const [inserted] = await db
    .insert(messagesTable)
    .values(input)
    .onConflictDoNothing({
      target: [messagesTable.senderUserId, messagesTable.clientMessageId],
    })
    .returning();

  if (inserted) return { message: inserted, created: true };

  const [existing] = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.senderUserId, input.senderUserId),
        eq(messagesTable.clientMessageId, input.clientMessageId),
      ),
    )
    .limit(1);

  if (!existing || existing.connectionId !== input.connectionId) {
    return { message: null, created: false };
  }

  return { message: existing, created: false };
}

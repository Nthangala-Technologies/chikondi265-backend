import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
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

export type ChatAccess = {
  participants: string[];
  userLowId: string;
  clearedAt: Date | null;
};

export async function findChatAccess(
  userId: string,
  connectionId: string,
): Promise<ChatAccess | null> {
  const [connection] = await db
    .select({
      userLowId: connectionsTable.userLowId,
      userHighId: connectionsTable.userHighId,
      status: connectionsTable.status,
      closedAt: connectionsTable.closedAt,
      clearedAtUserLow: connectionsTable.clearedAtUserLow,
      clearedAtUserHigh: connectionsTable.clearedAtUserHigh,
    })
    .from(connectionsTable)
    .where(eq(connectionsTable.id, connectionId))
    .limit(1);

  if (
    !connection ||
    (connection.userLowId !== userId && connection.userHighId !== userId) ||
    !["matched", "chat_enabled"].includes(connection.status) ||
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
  return {
    participants: [connection.userLowId, connection.userHighId],
    userLowId: connection.userLowId,
    clearedAt:
      connection.userLowId === userId
        ? connection.clearedAtUserLow
        : connection.clearedAtUserHigh,
  };
}

export async function listConnectionMessages(
  userId: string,
  connectionId: string,
  clearedAt: Date | null,
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

  const filters = [
    eq(messagesTable.connectionId, connectionId),
    sql`not (${messagesTable.deletedForUserIds} @> ${JSON.stringify([userId])}::jsonb)`,
  ];
  if (clearedAt) filters.push(gt(messagesTable.createdAt, clearedAt));
  if (cursorCondition) filters.push(cursorCondition);

  return db
    .select()
    .from(messagesTable)
    .where(and(...filters))
    .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
    .limit(31);
}

export async function findMessageForAction(messageId: string) {
  const [message] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, messageId))
    .limit(1);
  return message ?? null;
}

export async function updateConnectionMessage(input: {
  messageId: string;
  senderUserId: string;
  body: string;
}): Promise<Message | null> {
  const [message] = await db
    .update(messagesTable)
    .set({ body: input.body })
    .where(
      and(
        eq(messagesTable.id, input.messageId),
        eq(messagesTable.senderUserId, input.senderUserId),
        sql`${messagesTable.createdAt} >= now() - interval '2 hours'`,
      ),
    )
    .returning();
  return message ?? null;
}

export async function hideConnectionMessageForUser(
  messageId: string,
  userId: string,
): Promise<boolean> {
  const [hidden] = await db
    .update(messagesTable)
    .set({
      deletedForUserIds: sql<string[]>`case
        when ${messagesTable.deletedForUserIds} @> jsonb_build_array(${userId})
        then ${messagesTable.deletedForUserIds}
        else ${messagesTable.deletedForUserIds} || jsonb_build_array(${userId})
      end`,
    })
    .where(
      and(
        eq(messagesTable.id, messageId),
        sql`${messagesTable.createdAt} >= now() - interval '2 hours'`,
      ),
    )
    .returning({ id: messagesTable.id });
  return Boolean(hidden);
}

export async function deleteConnectionMessageForEveryone(
  messageId: string,
  senderUserId: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(messagesTable)
    .where(
      and(
        eq(messagesTable.id, messageId),
        eq(messagesTable.senderUserId, senderUserId),
        sql`${messagesTable.createdAt} >= now() - interval '2 hours'`,
      ),
    )
    .returning({ id: messagesTable.id });
  return Boolean(deleted);
}

export async function clearConnectionMessagesForUser(
  connectionId: string,
  userId: string,
  userLowId: string,
): Promise<boolean> {
  const changes =
    userId === userLowId
      ? { clearedAtUserLow: sql`clock_timestamp()` }
      : { clearedAtUserHigh: sql`clock_timestamp()` };
  const [updated] = await db
    .update(connectionsTable)
    .set(changes)
    .where(eq(connectionsTable.id, connectionId))
    .returning({ id: connectionsTable.id });
  return Boolean(updated);
}

export async function clearConnectionMessagesForEveryone(
  connectionId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(messagesTable)
      .where(eq(messagesTable.connectionId, connectionId));
    await tx
      .update(connectionsTable)
      .set({ clearedAtUserLow: null, clearedAtUserHigh: null })
      .where(eq(connectionsTable.id, connectionId));
  });
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

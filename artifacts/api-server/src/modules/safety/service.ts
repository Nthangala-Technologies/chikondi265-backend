import { and, eq, or } from "drizzle-orm";
import {
  blocksTable,
  connectionsTable,
  db,
  reportsTable,
  usersTable,
} from "@workspace/db";
import type { CreateSafetyReportInput } from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";

export async function createUserBlock(
  blockerUserId: string,
  blockedUserId: string,
) {
  if (blockerUserId === blockedUserId) {
    throw new ApiError(400, "BAD_REQUEST", "You cannot block your own account.");
  }

  const [target] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, blockedUserId))
    .limit(1);
  if (!target) {
    throw new ApiError(404, "NOT_FOUND", "The profile is unavailable.");
  }

  await db
    .insert(blocksTable)
    .values({ blockerUserId, blockedUserId })
    .onConflictDoNothing();
  return { blocked: true as const };
}

export async function removeUserBlock(
  blockerUserId: string,
  blockedUserId: string,
) {
  await db
    .delete(blocksTable)
    .where(
      and(
        eq(blocksTable.blockerUserId, blockerUserId),
        eq(blocksTable.blockedUserId, blockedUserId),
      ),
    );
  return { unblocked: true as const };
}

export async function createUserSafetyReport(
  reporterUserId: string,
  input: CreateSafetyReportInput,
) {
  if (reporterUserId === input.reportedUserId) {
    throw new ApiError(400, "BAD_REQUEST", "You cannot report your own account.");
  }

  const [reportedUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, input.reportedUserId))
    .limit(1);
  if (!reportedUser) {
    throw new ApiError(404, "NOT_FOUND", "The profile is unavailable.");
  }

  if (input.connectionId) {
    const [connection] = await db
      .select({
        userLowId: connectionsTable.userLowId,
        userHighId: connectionsTable.userHighId,
      })
      .from(connectionsTable)
      .where(
        and(
          eq(connectionsTable.id, input.connectionId),
          or(
            and(
              eq(connectionsTable.userLowId, reporterUserId),
              eq(connectionsTable.userHighId, input.reportedUserId),
            ),
            and(
              eq(connectionsTable.userLowId, input.reportedUserId),
              eq(connectionsTable.userHighId, reporterUserId),
            ),
          ),
        ),
      )
      .limit(1);
    if (!connection) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "The connection is not available for this report.",
      );
    }
  }

  const [report] = await db
    .insert(reportsTable)
    .values({
      reporterUserId,
      reportedUserId: input.reportedUserId,
      connectionId: input.connectionId ?? null,
      category: input.category,
      details: input.details?.trim() || null,
    })
    .returning({
      id: reportsTable.id,
      status: reportsTable.status,
      createdAt: reportsTable.createdAt,
    });

  return {
    id: report.id,
    status: report.status as "open",
    createdAt: report.createdAt.toISOString(),
  };
}

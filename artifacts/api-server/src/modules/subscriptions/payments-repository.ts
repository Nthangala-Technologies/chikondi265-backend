import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  providerEventsTable,
  subscriptionPaymentAttemptsTable,
  subscriptionPlansTable,
  subscriptionsTable,
} from "@workspace/db";
import { ApiError } from "../../middleware/error-handler";

export type SubscriptionPaymentAttempt = {
  id: string;
  userId: string;
  plan: "daily" | "weekly" | "monthly";
  txRef: string;
  amountMwk: number;
  currency: string;
  status: string;
  checkoutUrl: string | null;
  providerTransactionId?: string | null;
};

export type PayChanguAttempt =
  | {
      kind: "chat";
      id: string;
      connectionId: string;
      txRef: string;
      amountMwk: number;
      currency: string;
      status: string;
    }
  | {
      kind: "subscription";
      id: string;
      userId: string;
      txRef: string;
      amountMwk: number;
      currency: string;
      status: string;
    };

export async function findSubscriptionPlan(
  plan: SubscriptionPaymentAttempt["plan"],
) {
  const [record] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.plan, plan))
    .limit(1);
  return record ?? null;
}

export async function reserveSubscriptionPaymentAttempt(input: {
  userId: string;
  plan: "daily" | "weekly" | "monthly";
  amountMwk: number;
  idempotencyKey: string;
  txRef: string;
}): Promise<SubscriptionPaymentAttempt> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(subscriptionPaymentAttemptsTable)
      .values({
        userId: input.userId,
        plan: input.plan,
        provider: "paychangu",
        txRef: input.txRef,
        amountMwk: input.amountMwk,
        currency: "MWK",
        idempotencyKey: input.idempotencyKey,
        status: "pending",
      })
      .onConflictDoNothing({
        target: [
          subscriptionPaymentAttemptsTable.userId,
          subscriptionPaymentAttemptsTable.idempotencyKey,
        ],
      })
      .returning({
        id: subscriptionPaymentAttemptsTable.id,
        userId: subscriptionPaymentAttemptsTable.userId,
        plan: subscriptionPaymentAttemptsTable.plan,
        txRef: subscriptionPaymentAttemptsTable.txRef,
        amountMwk: subscriptionPaymentAttemptsTable.amountMwk,
        currency: subscriptionPaymentAttemptsTable.currency,
        status: subscriptionPaymentAttemptsTable.status,
        checkoutUrl: subscriptionPaymentAttemptsTable.checkoutUrl,
      });

    if (created) return created;

    const [existing] = await tx
      .select({
        id: subscriptionPaymentAttemptsTable.id,
        userId: subscriptionPaymentAttemptsTable.userId,
        plan: subscriptionPaymentAttemptsTable.plan,
        txRef: subscriptionPaymentAttemptsTable.txRef,
        amountMwk: subscriptionPaymentAttemptsTable.amountMwk,
        currency: subscriptionPaymentAttemptsTable.currency,
        status: subscriptionPaymentAttemptsTable.status,
        checkoutUrl: subscriptionPaymentAttemptsTable.checkoutUrl,
      })
      .from(subscriptionPaymentAttemptsTable)
      .where(
        and(
          eq(subscriptionPaymentAttemptsTable.userId, input.userId),
          eq(
            subscriptionPaymentAttemptsTable.idempotencyKey,
            input.idempotencyKey,
          ),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new ApiError(
        409,
        "CONFLICT",
        "The checkout request could not be reserved.",
      );
    }
    if (
      existing.plan !== input.plan ||
      existing.amountMwk !== input.amountMwk
    ) {
      throw new ApiError(
        409,
        "CONFLICT",
        "The idempotency key was already used for another plan.",
      );
    }
    if (existing.status !== "pending" || !existing.checkoutUrl) {
      throw new ApiError(
        409,
        "CONFLICT",
        "The existing checkout attempt is no longer available.",
      );
    }
    return existing;
  });
}
export async function storeSubscriptionCheckoutUrl(
  attemptId: string,
  checkoutUrl: string,
): Promise<void> {
  const [updated] = await db
    .update(subscriptionPaymentAttemptsTable)
    .set({ checkoutUrl })
    .where(
      and(
        eq(subscriptionPaymentAttemptsTable.id, attemptId),
        eq(subscriptionPaymentAttemptsTable.status, "pending"),
      ),
    )
    .returning({ id: subscriptionPaymentAttemptsTable.id });

  if (!updated) {
    throw new ApiError(
      409,
      "CONFLICT",
      "The checkout attempt is no longer pending.",
    );
  }
}

export async function markSubscriptionPaymentFailed(
  attemptId: string,
  failureCode: string,
): Promise<void> {
  await db
    .update(subscriptionPaymentAttemptsTable)
    .set({ status: "failed", failureCode, updatedAt: new Date() })
    .where(
      and(
        eq(subscriptionPaymentAttemptsTable.id, attemptId),
        eq(subscriptionPaymentAttemptsTable.status, "pending"),
      ),
    );
}

export async function findSubscriptionPaymentAttempt(
  txRef: string,
  userId?: string,
): Promise<SubscriptionPaymentAttempt | null> {
  const [attempt] = await db
    .select({
      id: subscriptionPaymentAttemptsTable.id,
      userId: subscriptionPaymentAttemptsTable.userId,
      plan: subscriptionPaymentAttemptsTable.plan,
      txRef: subscriptionPaymentAttemptsTable.txRef,
      amountMwk: subscriptionPaymentAttemptsTable.amountMwk,
      currency: subscriptionPaymentAttemptsTable.currency,
      status: subscriptionPaymentAttemptsTable.status,
      checkoutUrl: subscriptionPaymentAttemptsTable.checkoutUrl,
      providerTransactionId:
        subscriptionPaymentAttemptsTable.providerTransactionId,
    })
    .from(subscriptionPaymentAttemptsTable)
    .where(
      userId
        ? and(
            eq(subscriptionPaymentAttemptsTable.txRef, txRef),
            eq(subscriptionPaymentAttemptsTable.userId, userId),
          )
        : eq(subscriptionPaymentAttemptsTable.txRef, txRef),
    )
    .limit(1);
  return attempt ?? null;
}

export async function findLatestSubscriptionExpiry(userId: string) {
  const [subscription] = await db
    .select({ expiresAt: subscriptionsTable.expiresAt })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "active"),
      ),
    )
    .orderBy(desc(subscriptionsTable.expiresAt))
    .limit(1);
  return subscription?.expiresAt ?? null;
}

function addPlanDuration(start: Date, plan: SubscriptionPaymentAttempt["plan"]) {
  const end = new Date(start);
  if (plan === "daily") {
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (plan === "weekly") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
  }
  return end;
}

export async function completePayChanguSubscriptionPayment(input: {
  attemptId: string;
  providerTransactionId: string | null;
  eventId?: string | null;
}): Promise<{ userId: string; succeeded: boolean }> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select({
        id: subscriptionPaymentAttemptsTable.id,
        userId: subscriptionPaymentAttemptsTable.userId,
        plan: subscriptionPaymentAttemptsTable.plan,
        status: subscriptionPaymentAttemptsTable.status,
      })
      .from(subscriptionPaymentAttemptsTable)
      .where(eq(subscriptionPaymentAttemptsTable.id, input.attemptId))
      .for("update")
      .limit(1);

    if (!attempt) {
      throw new ApiError(404, "NOT_FOUND", "Subscription checkout was not found.");
    }
    if (attempt.status === "succeeded") {
      if (input.eventId) {
        await tx
          .update(providerEventsTable)
          .set({
            processingStatus: "ignored",
            errorCode: "ATTEMPT_ALREADY_COMPLETED",
            processedAt: new Date(),
          })
          .where(eq(providerEventsTable.id, input.eventId));
      }
      return { userId: attempt.userId, succeeded: true };
    }
    if (attempt.status !== "pending") {
      if (input.eventId) {
        await tx
          .update(providerEventsTable)
          .set({
            processingStatus: "ignored",
            errorCode: "ATTEMPT_NOT_PENDING",
            processedAt: new Date(),
          })
          .where(eq(providerEventsTable.id, input.eventId));
      }
      return { userId: attempt.userId, succeeded: false };
    }

    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${attempt.userId}))`,
    );
    const now = new Date();
    const [existing] = await tx
      .select({ expiresAt: subscriptionsTable.expiresAt })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, attempt.userId),
          eq(subscriptionsTable.status, "active"),
          sql`${subscriptionsTable.startedAt} <= ${now}`,
          sql`${subscriptionsTable.expiresAt} > ${now}`,
        ),
      )
      .orderBy(desc(subscriptionsTable.expiresAt))
      .limit(1)
      .for("update");

    const startedAt =
      existing && existing.expiresAt > now ? existing.expiresAt : now;
    const expiresAt = addPlanDuration(startedAt, attempt.plan);
    await tx.insert(subscriptionsTable).values({
      userId: attempt.userId,
      plan: attempt.plan,
      status: "active",
      startedAt,
      expiresAt,
      provider: "paychangu",
    });
    await tx
      .update(subscriptionPaymentAttemptsTable)
      .set({
        status: "succeeded",
        verifiedAt: now,
        providerTransactionId: input.providerTransactionId,
        failureCode: null,
        updatedAt: now,
      })
      .where(eq(subscriptionPaymentAttemptsTable.id, attempt.id));
    if (input.eventId) {
      await tx
        .update(providerEventsTable)
        .set({
          processingStatus: "processed",
          processedAt: now,
          errorCode: null,
        })
        .where(eq(providerEventsTable.id, input.eventId));
    }
    return { userId: attempt.userId, succeeded: true };
  });
}

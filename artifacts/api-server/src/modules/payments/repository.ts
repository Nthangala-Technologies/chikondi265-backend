import { and, eq, inArray, ne } from "drizzle-orm";
import {
  connectionsTable,
  db,
  paymentAttemptsTable,
  providerEventsTable,
} from "@workspace/db";
import { ApiError } from "../../middleware/error-handler";

type PaymentAttemptView = {
  id: string;
  connectionId: string;
  payerUserId: string;
  txRef: string;
  status: string;
  checkoutUrl: string | null;
};

export async function reservePaymentAttempt(input: {
  connectionId: string;
  payerUserId: string;
  idempotencyKey: string;
  txRef: string;
}): Promise<PaymentAttemptView> {
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select({
        id: connectionsTable.id,
        userLowId: connectionsTable.userLowId,
        userHighId: connectionsTable.userHighId,
        status: connectionsTable.status,
      })
      .from(connectionsTable)
      .where(eq(connectionsTable.id, input.connectionId))
      .for("update")
      .limit(1);

    if (!connection) {
      throw new ApiError(404, "NOT_FOUND", "Connection was not found.");
    }
    if (
      connection.userLowId !== input.payerUserId &&
      connection.userHighId !== input.payerUserId
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only connection participants can create a payment.",
      );
    }
    if (connection.status !== "matched") {
      throw new ApiError(
        409,
        "CONFLICT",
        "This connection is not eligible for a payment.",
      );
    }

    const [succeeded] = await tx
      .select({ id: paymentAttemptsTable.id })
      .from(paymentAttemptsTable)
      .where(
        and(
          eq(paymentAttemptsTable.connectionId, input.connectionId),
          eq(paymentAttemptsTable.status, "succeeded"),
        ),
      )
      .limit(1);
    if (succeeded) {
      throw new ApiError(
        409,
        "CONFLICT",
        "This connection has already been paid.",
      );
    }

    const findByIdempotencyKey = () =>
      tx
        .select({
          id: paymentAttemptsTable.id,
          connectionId: paymentAttemptsTable.connectionId,
          payerUserId: paymentAttemptsTable.payerUserId,
          txRef: paymentAttemptsTable.txRef,
          status: paymentAttemptsTable.status,
          checkoutUrl: paymentAttemptsTable.checkoutUrl,
        })
        .from(paymentAttemptsTable)
        .where(
          and(
            eq(paymentAttemptsTable.payerUserId, input.payerUserId),
            eq(paymentAttemptsTable.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

    const [existing] = await findByIdempotencyKey();
    if (existing) {
      if (existing.connectionId !== input.connectionId) {
        throw new ApiError(
          409,
          "CONFLICT",
          "The idempotency key was already used for another connection.",
        );
      }
      if (existing.status !== "pending") {
        throw new ApiError(
          409,
          "CONFLICT",
          "The existing payment attempt is no longer pending.",
        );
      }
      return existing;
    }

    const [created] = await tx
      .insert(paymentAttemptsTable)
      .values({
        connectionId: input.connectionId,
        payerUserId: input.payerUserId,
        provider: "paychangu",
        txRef: input.txRef,
        idempotencyKey: input.idempotencyKey,
        amountMwk: 5000,
        currency: "MWK",
        status: "pending",
      })
      .onConflictDoNothing({
        target: [
          paymentAttemptsTable.payerUserId,
          paymentAttemptsTable.idempotencyKey,
        ],
      })
      .returning({
        id: paymentAttemptsTable.id,
        connectionId: paymentAttemptsTable.connectionId,
        payerUserId: paymentAttemptsTable.payerUserId,
        txRef: paymentAttemptsTable.txRef,
        status: paymentAttemptsTable.status,
        checkoutUrl: paymentAttemptsTable.checkoutUrl,
      });

    if (created) return created;

    const [concurrentReplay] = await findByIdempotencyKey();
    if (
      concurrentReplay?.connectionId === input.connectionId &&
      concurrentReplay.status === "pending"
    ) {
      return concurrentReplay;
    }

    throw new ApiError(
      409,
      "CONFLICT",
      "The idempotency key could not be reserved.",
    );
  });
}

export async function storeCheckoutUrl(
  paymentAttemptId: string,
  checkoutUrl: string,
): Promise<void> {
  const [updated] = await db
    .update(paymentAttemptsTable)
    .set({ checkoutUrl })
    .where(
      and(
        eq(paymentAttemptsTable.id, paymentAttemptId),
        eq(paymentAttemptsTable.status, "pending"),
      ),
    )
    .returning({ id: paymentAttemptsTable.id });

  if (!updated) {
    throw new ApiError(
      409,
      "CONFLICT",
      "The payment attempt is no longer pending.",
    );
  }
}

export async function recordPayChanguWebhookEvent(input: {
  txRefCandidates: string[];
  eventType: string;
  payloadSha256: string;
}) {
  const [attempt] = await db
    .select({
      id: paymentAttemptsTable.id,
      connectionId: paymentAttemptsTable.connectionId,
      txRef: paymentAttemptsTable.txRef,
      status: paymentAttemptsTable.status,
    })
    .from(paymentAttemptsTable)
    .where(inArray(paymentAttemptsTable.txRef, input.txRefCandidates))
    .limit(1);

  const eventTxRef = attempt?.txRef ?? input.txRefCandidates[0];
  const isIgnored = !attempt;
  const now = new Date();
  const [event] = await db
    .insert(providerEventsTable)
    .values({
      provider: "paychangu",
      txRef: eventTxRef,
      eventType: input.eventType,
      payloadSha256: input.payloadSha256,
      signatureValid: true,
      processingStatus: isIgnored ? "ignored" : "received",
      processedAt: isIgnored ? now : null,
    })
    .onConflictDoNothing({
      target: [
        providerEventsTable.provider,
        providerEventsTable.txRef,
        providerEventsTable.eventType,
        providerEventsTable.payloadSha256,
      ],
    })
    .returning({ id: providerEventsTable.id });

  return {
    attempt: attempt ?? null,
    eventId: event?.id ?? null,
  };
}

export async function markPayChanguWebhookFailed(
  eventId: string,
  errorCode: string,
): Promise<void> {
  await db
    .update(providerEventsTable)
    .set({
      processingStatus: "failed",
      errorCode,
      processedAt: new Date(),
    })
    .where(eq(providerEventsTable.id, eventId));
}

export async function completePayChanguPayment(input: {
  attemptId: string;
  eventId: string;
  providerTransactionId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .select({
        id: paymentAttemptsTable.id,
        connectionId: paymentAttemptsTable.connectionId,
        status: paymentAttemptsTable.status,
      })
      .from(paymentAttemptsTable)
      .where(eq(paymentAttemptsTable.id, input.attemptId))
      .for("update")
      .limit(1);

    const now = new Date();
    if (!attempt || attempt.status !== "pending") {
      await tx
        .update(providerEventsTable)
        .set({
          processingStatus: "ignored",
          errorCode: "ATTEMPT_NOT_PENDING",
          processedAt: now,
        })
        .where(eq(providerEventsTable.id, input.eventId));
      return;
    }

    const [connection] = await tx
      .select({
        id: connectionsTable.id,
        status: connectionsTable.status,
      })
      .from(connectionsTable)
      .where(eq(connectionsTable.id, attempt.connectionId))
      .for("update")
      .limit(1);

    if (!connection || !["matched", "chat_enabled"].includes(connection.status)) {
      await tx
        .update(providerEventsTable)
        .set({
          processingStatus: "failed",
          errorCode: "CONNECTION_NOT_PAYABLE",
          processedAt: now,
        })
        .where(eq(providerEventsTable.id, input.eventId));
      return;
    }

    const [otherSucceededAttempt] = await tx
      .select({ id: paymentAttemptsTable.id })
      .from(paymentAttemptsTable)
      .where(
        and(
          eq(paymentAttemptsTable.connectionId, attempt.connectionId),
          eq(paymentAttemptsTable.status, "succeeded"),
          ne(paymentAttemptsTable.id, attempt.id),
        ),
      )
      .limit(1);

    if (otherSucceededAttempt) {
      await tx
        .update(providerEventsTable)
        .set({
          processingStatus: "ignored",
          errorCode: "CONNECTION_ALREADY_PAID",
          processedAt: now,
        })
        .where(eq(providerEventsTable.id, input.eventId));
      return;
    }

    await tx
      .update(paymentAttemptsTable)
      .set({
        status: "succeeded",
        verifiedAt: now,
        providerTransactionId: input.providerTransactionId,
      })
      .where(eq(paymentAttemptsTable.id, attempt.id));

    if (connection.status === "matched") {
      await tx
        .update(connectionsTable)
        .set({
          status: "chat_enabled",
          chatEnabledAt: now,
          updatedAt: now,
        })
        .where(eq(connectionsTable.id, connection.id));
    }

    await tx
      .update(providerEventsTable)
      .set({
        processingStatus: "processed",
        processedAt: now,
        errorCode: null,
      })
      .where(eq(providerEventsTable.id, input.eventId));
  });
}

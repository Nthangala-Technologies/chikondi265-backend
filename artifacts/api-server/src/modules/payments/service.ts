import { publishUserDataUpdates } from "../realtime/service";
import { verifyPayChanguTransaction } from "./paychangu-provider";
import {
  completePayChanguSubscriptionPayment,
} from "../subscriptions/payments-repository";
import {
  completePayChanguPayment,
  findConnectionParticipantIds,
  listPaymentHistoryForUser,
  markPayChanguWebhookFailed,
  recordPayChanguWebhookEvent,
} from "./repository";
import { processPayChanguWebhook } from "./webhook";
import type { PayChanguWebhookAttempt } from "./webhook";

export async function getCurrentUserPaymentHistory(payerUserId: string) {
  const items = await listPaymentHistoryForUser(payerUserId);
  return {
    items: items.map((item) => ({
      ...item,
      description: "Chat unlock",
    })),
  };
}

export async function receivePayChanguWebhook(
  rawBody: Buffer,
  signature: string,
): Promise<void> {
  await processPayChanguWebhook(rawBody, signature, {
    webhookSecret: process.env.PAYCHANGU_WEBHOOK_SECRET,
    recordEvent: recordPayChanguWebhookEvent,
    verifyTransaction: verifyPayChanguTransaction,
    markEventFailed: markPayChanguWebhookFailed,
    async completePayment({ attempt, eventId, providerTransactionId }) {
      if (attempt.kind === "subscription") {
        await completePayChanguSubscriptionPayment({
          attemptId: attempt.id,
          eventId,
          providerTransactionId,
        });
        return;
      }
      await completePayChanguPayment({
        attemptId: attempt.id,
        eventId,
        providerTransactionId,
      });
    },
    async findAffectedUserIds(attempt: PayChanguWebhookAttempt) {
      if (attempt.kind === "subscription") return [attempt.userId];
      return findConnectionParticipantIds(attempt.connectionId);
    },
    publishUpdates: publishUserDataUpdates,
  });
}

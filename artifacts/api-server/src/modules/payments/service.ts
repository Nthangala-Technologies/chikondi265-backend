import { publishUserDataUpdates } from "../realtime/service";
import { verifyPayChanguTransaction } from "./paychangu-provider";
import {
  completePayChanguPayment,
  findConnectionParticipantIds,
  listPaymentHistoryForUser,
  markPayChanguWebhookFailed,
  recordPayChanguWebhookEvent,
} from "./repository";
import { processPayChanguWebhook } from "./webhook";

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
    completePayment: completePayChanguPayment,
    findParticipantIds: findConnectionParticipantIds,
    publishUpdates: publishUserDataUpdates,
  });
}

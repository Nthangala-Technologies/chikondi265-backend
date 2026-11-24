import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "../../middleware/error-handler";
import { PayChanguProviderError, type PayChanguVerification } from "./paychangu-provider";
import type { PayChanguAttempt } from "../subscriptions/payments-repository";

export type PayChanguWebhookAttempt = PayChanguAttempt;

export type PayChanguWebhookDependencies = {
  webhookSecret: string | undefined;
  recordEvent(input: {
    txRefCandidates: string[];
    eventType: string;
    payloadSha256: string;
  }): Promise<{
    attempt: PayChanguWebhookAttempt | null;
    eventId: string | null;
  }>;
  verifyTransaction(txRef: string): Promise<PayChanguVerification>;
  markEventFailed(eventId: string, errorCode: string): Promise<void>;
  completePayment(input: {
    attempt: PayChanguWebhookAttempt;
    eventId: string;
    providerTransactionId: string | null;
  }): Promise<void>;
  findAffectedUserIds(attempt: PayChanguWebhookAttempt): Promise<string[]>;
  publishUpdates(userIds: string[]): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStringField(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function webhookTxRefCandidates(payload: Record<string, unknown>): string[] {
  const data = isRecord(payload.data) ? payload.data : null;
  const nestedData = data && isRecord(data.data) ? data.data : null;
  return [
    readStringField(payload, "tx_ref"),
    readStringField(data, "tx_ref"),
    readStringField(nestedData, "tx_ref"),
    readStringField(payload, "reference"),
    readStringField(data, "reference"),
    readStringField(nestedData, "reference"),
  ].filter((value, index, all): value is string => {
    return value !== null && all.indexOf(value) === index;
  });
}

function webhookEventType(payload: Record<string, unknown>): string {
  const data = isRecord(payload.data) ? payload.data : null;
  const value =
    readStringField(payload, "event_type") ??
    readStringField(data, "event_type") ??
    readStringField(payload, "event") ??
    readStringField(data, "event") ??
    readStringField(payload, "type") ??
    readStringField(data, "type");
  return value?.slice(0, 120) ?? "unknown";
}

export async function processPayChanguWebhook(
  rawBody: Buffer,
  signature: string,
  dependencies: PayChanguWebhookDependencies,
): Promise<void> {
  const { webhookSecret } = dependencies;
  if (!webhookSecret) {
    throw new ApiError(
      503,
      "PAYMENT_PROVIDER_ERROR",
      "PAYCHANGU_WEBHOOK_SECRET is not configured.",
    );
  }

  const normalizedSignature = signature.trim();
  if (!/^[a-f\d]{64}$/i.test(normalizedSignature)) {
    throw new ApiError(403, "FORBIDDEN", "Webhook signature is invalid.");
  }

  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest();
  const receivedSignature = Buffer.from(normalizedSignature, "hex");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new ApiError(403, "FORBIDDEN", "Webhook signature is invalid.");
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Webhook payload is invalid JSON.");
  }
  if (!isRecord(parsedPayload)) {
    throw new ApiError(400, "BAD_REQUEST", "Webhook payload must be an object.");
  }

  const txRefCandidates = webhookTxRefCandidates(parsedPayload);
  if (txRefCandidates.length === 0) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Webhook payload does not include a transaction reference.",
    );
  }

  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const { attempt, eventId } = await dependencies.recordEvent({
    txRefCandidates,
    eventType: webhookEventType(parsedPayload),
    payloadSha256,
  });

  if (!eventId || !attempt) return;

  let verification: PayChanguVerification;
  try {
    verification = await dependencies.verifyTransaction(attempt.txRef);
  } catch (error) {
    await dependencies.markEventFailed(eventId, "PROVIDER_VERIFY_FAILED");
    if (error instanceof PayChanguProviderError) {
      throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", error.message);
    }
    throw new ApiError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      "PayChangu transaction verification failed.",
    );
  }

  if (
    verification.txRef !== attempt.txRef ||
    verification.status !== "success" ||
    verification.amount !== attempt.amountMwk ||
    verification.currency !== attempt.currency
  ) {
    await dependencies.markEventFailed(eventId, "VERIFICATION_MISMATCH");
    return;
  }

  await dependencies.completePayment({
    attempt,
    eventId,
    providerTransactionId: verification.providerTransactionId,
  });
  await dependencies.publishUpdates(
    await dependencies.findAffectedUserIds(attempt),
  );
}

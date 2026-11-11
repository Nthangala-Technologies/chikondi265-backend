import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "../../middleware/error-handler";
import { publishUserDataUpdates } from "../realtime/service";
import {
  createPayChanguCheckout,
  PayChanguProviderError,
  verifyPayChanguTransaction,
} from "./paychangu-provider";
import {
  completePayChanguPayment,
  findConnectionParticipantIds,
  listPaymentHistoryForUser,
  markPayChanguWebhookFailed,
  recordPayChanguWebhookEvent,
  reservePaymentAttempt,
  storeCheckoutUrl,
} from "./repository";

export async function getCurrentUserPaymentHistory(payerUserId: string) {
  const items = await listPaymentHistoryForUser(payerUserId);
  return {
    items: items.map((item) => ({
      ...item,
      description: "Chat unlock",
    })),
  };
}

export async function createPaymentIntent(input: {
  connectionId: string;
  payerUserId: string;
  idempotencyKey?: string;
}) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const attempt = await reservePaymentAttempt({
    connectionId: input.connectionId,
    payerUserId: input.payerUserId,
    idempotencyKey,
    txRef: `kw_${randomUUID()}`,
  });

  let checkoutUrl = attempt.checkoutUrl;
  if (!checkoutUrl) {
    try {
      checkoutUrl = await createPayChanguCheckout({
        amountMwk: 5000,
        txRef: attempt.txRef,
        callbackUrl: process.env.PAYCHANGU_WEBHOOK_URL ?? "",
      });
    } catch (error) {
      if (error instanceof PayChanguProviderError) {
        throw new ApiError(
          error.httpStatus === 503 ? 503 : 502,
          "PAYMENT_PROVIDER_ERROR",
          error.message,
        );
      }
      throw new ApiError(
        502,
        "PAYMENT_PROVIDER_ERROR",
        "PayChangu checkout initialization failed.",
      );
    }

    await storeCheckoutUrl(attempt.id, checkoutUrl);
  }

  return {
    checkoutUrl,
    txRef: attempt.txRef,
    paymentAttemptId: attempt.id,
  };
}

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
    readStringField(payload, "type") ??
    readStringField(data, "type");
  return value?.slice(0, 120) ?? "unknown";
}

export async function receivePayChanguWebhook(
  rawBody: Buffer,
  signature: string,
): Promise<void> {
  const webhookSecret = process.env.PAYCHANGU_WEBHOOK_SECRET;
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
  const { attempt, eventId } = await recordPayChanguWebhookEvent({
    txRefCandidates,
    eventType: webhookEventType(parsedPayload),
    payloadSha256,
  });

  if (!eventId || !attempt) return;

  let verification;
  try {
    verification = await verifyPayChanguTransaction(attempt.txRef);
  } catch (error) {
    await markPayChanguWebhookFailed(eventId, "PROVIDER_VERIFY_FAILED");
    if (error instanceof PayChanguProviderError) {
      throw new ApiError(
        502,
        "PAYMENT_PROVIDER_ERROR",
        error.message,
      );
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
    verification.amount !== 5000 ||
    verification.currency !== "MWK"
  ) {
    await markPayChanguWebhookFailed(eventId, "VERIFICATION_MISMATCH");
    return;
  }

  await completePayChanguPayment({
    attemptId: attempt.id,
    eventId,
    providerTransactionId: verification.providerTransactionId,
  });
  const participants = await findConnectionParticipantIds(attempt.connectionId);
  await publishUserDataUpdates(participants);
}

import { randomUUID } from "node:crypto";
import { ApiError } from "../../middleware/error-handler";
import { publishUserDataUpdates } from "../realtime/service";
import {
  createPayChanguCheckout,
  PayChanguProviderError,
  verifyPayChanguTransaction,
} from "../payments/paychangu-provider";
import {
  completePayChanguSubscriptionPayment,
  findLatestSubscriptionExpiry,
  findSubscriptionPaymentAttempt,
  findSubscriptionPlan,
  markSubscriptionPaymentFailed,
  reserveSubscriptionPaymentAttempt,
  storeSubscriptionCheckoutUrl,
} from "./payments-repository";

export type SubscriptionPlanName = "daily" | "weekly" | "monthly";

export async function createSubscriptionCheckout(input: {
  userId: string;
  plan: SubscriptionPlanName;
  amountMwk: number;
  idempotencyKey: string;
}) {
  const plan = await findSubscriptionPlan(input.plan);
  if (!plan) {
    throw new ApiError(404, "NOT_FOUND", "That subscription plan is unavailable.");
  }
  if (input.amountMwk !== plan.amountMwk) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The plan price changed. Refresh the plans and try again.",
    );
  }

  const attempt = await reserveSubscriptionPaymentAttempt({
    userId: input.userId,
    plan: input.plan,
    amountMwk: plan.amountMwk,
    idempotencyKey: input.idempotencyKey,
    txRef: `sub_${randomUUID()}`,
  });
  if (attempt.checkoutUrl) {
    return {
      checkoutUrl: attempt.checkoutUrl,
      txRef: attempt.txRef,
      paymentAttemptId: attempt.id,
      amountMwk: attempt.amountMwk,
    };
  }

  try {
    const checkoutUrl = await createPayChanguCheckout({
      amountMwk: plan.amountMwk,
      txRef: attempt.txRef,
    });
    await storeSubscriptionCheckoutUrl(attempt.id, checkoutUrl);
    return {
      checkoutUrl,
      txRef: attempt.txRef,
      paymentAttemptId: attempt.id,
      amountMwk: attempt.amountMwk,
    };
  } catch (error) {
    await markSubscriptionPaymentFailed(
      attempt.id,
      error instanceof PayChanguProviderError
        ? `PAYCHANGU_${error.httpStatus}`
        : "CHECKOUT_CREATE_FAILED",
    );
    if (error instanceof PayChanguProviderError) {
      throw new ApiError(
        error.httpStatus >= 500 ? error.httpStatus : 502,
        "PAYMENT_PROVIDER_ERROR",
        error.message,
      );
    }
    throw error;
  }
}

export type SubscriptionVerificationResult = {
  status: "pending" | "succeeded" | "failed";
  activeUntil: string | null;
};

async function verifyAndActivateSubscriptionPayment(
  txRef: string,
  userId?: string,
): Promise<SubscriptionVerificationResult> {
  const attempt = await findSubscriptionPaymentAttempt(txRef, userId);
  if (!attempt) {
    throw new ApiError(
      404,
      "NOT_FOUND",
      "The subscription payment was not found.",
    );
  }
  if (attempt.status === "succeeded") {
    await publishUserDataUpdates([attempt.userId]);
    const activeUntil = await findLatestSubscriptionExpiry(attempt.userId);
    return {
      status: "succeeded",
      activeUntil: activeUntil?.toISOString() ?? null,
    };
  }
  if (attempt.status === "failed") {
    return { status: "failed", activeUntil: null };
  }

  let verification;
  try {
    verification = await verifyPayChanguTransaction(attempt.txRef);
  } catch (error) {
    if (error instanceof PayChanguProviderError) {
      throw new ApiError(
        error.httpStatus >= 500 ? error.httpStatus : 502,
        "PAYMENT_PROVIDER_ERROR",
        error.message,
      );
    }
    throw error;
  }

  if (verification.status?.toLowerCase() !== "success") {
    if (
      ["failed", "cancelled", "canceled", "declined", "reversed"].includes(
        verification.status?.toLowerCase() ?? "",
      )
    ) {
      await markSubscriptionPaymentFailed(attempt.id, "PAYMENT_NOT_SUCCESSFUL");
      return { status: "failed", activeUntil: null };
    }
    return { status: "pending", activeUntil: null };
  }

  if (
    verification.txRef !== attempt.txRef ||
    verification.amount !== attempt.amountMwk ||
    verification.currency !== attempt.currency
  ) {
    await markSubscriptionPaymentFailed(attempt.id, "VERIFICATION_MISMATCH");
    return { status: "failed", activeUntil: null };
  }

  const completion = await completePayChanguSubscriptionPayment({
    attemptId: attempt.id,
    providerTransactionId: verification.providerTransactionId,
  });
  if (!completion.succeeded) {
    return { status: "failed", activeUntil: null };
  }
  await publishUserDataUpdates([attempt.userId]);
  const activeUntil = await findLatestSubscriptionExpiry(attempt.userId);
  return {
    status: "succeeded",
    activeUntil: activeUntil?.toISOString() ?? null,
  };
}

export function verifySubscriptionCheckoutForUser(
  txRef: string,
  userId: string,
) {
  return verifyAndActivateSubscriptionPayment(txRef, userId);
}

export async function verifySubscriptionCheckoutReturn(txRef: string) {
  try {
    const result = await verifyAndActivateSubscriptionPayment(txRef);
    return result.status === "succeeded";
  } catch {
    return false;
  }
}

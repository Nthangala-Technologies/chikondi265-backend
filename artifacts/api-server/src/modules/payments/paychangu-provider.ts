export class PayChanguProviderError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PayChanguProviderError";
  }
}

type CheckoutResponse = {
  status?: string;
  message?: string;
  data?: {
    checkout_url?: string;
  };
};

function getSafeProviderMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if ("message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message
        .replace(
          /\b(authorization|secret|token|api[_ -]?key)\b\s*[:=]\s*\S+/gi,
          "$1=[redacted]",
        )
        .slice(0, 200);
    }
  }

  if (!("errors" in value)) return null;
  const errors = (value as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return null;
  }
  const fields = Object.keys(errors).slice(0, 5);
  return fields.length
    ? `Provider validation failed for: ${fields.join(", ")}`
    : null;
}

function getPaymentRedirectUrls(): { callbackUrl: string; returnUrl: string } {
  let webhookUrl: URL;
  try {
    webhookUrl = new URL(process.env.PAYCHANGU_WEBHOOK_URL ?? "");
  } catch {
    throw new PayChanguProviderError(
      "PAYCHANGU_WEBHOOK_URL must be a valid HTTPS URL.",
      503,
    );
  }
  if (webhookUrl.protocol !== "https:") {
    throw new PayChanguProviderError(
      "PAYCHANGU_WEBHOOK_URL must use HTTPS.",
      503,
    );
  }

  return {
    callbackUrl: new URL(
      "/api/v1/payments/paychangu/return/success",
      webhookUrl.origin,
    ).toString(),
    returnUrl: new URL(
      "/api/v1/payments/paychangu/return/failure",
      webhookUrl.origin,
    ).toString(),
  };
}

export async function createPayChanguCheckout(input: {
  amountMwk: number;
  txRef: string;
}): Promise<string> {
  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) {
    throw new PayChanguProviderError(
      "PAYCHANGU_SECRET_KEY is not configured.",
      503,
    );
  }

  const { callbackUrl, returnUrl } = getPaymentRedirectUrls();

  let response: Response;
  try {
    response = await fetch("https://api.paychangu.com/payment", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(input.amountMwk),
        currency: "MWK",
        tx_ref: input.txRef,
        callback_url: callbackUrl,
        return_url: returnUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PayChanguProviderError(
      "Could not reach PayChangu checkout.",
      502,
    );
  }

  let payload: CheckoutResponse;
  try {
    payload = (await response.json()) as CheckoutResponse;
  } catch {
    throw new PayChanguProviderError(
      `PayChangu returned HTTP ${response.status} with an invalid response.`,
      response.status,
    );
  }

  if (!response.ok || payload.status !== "success") {
    const providerMessage = getSafeProviderMessage(payload);
    throw new PayChanguProviderError(
      providerMessage
        ? `PayChangu returned HTTP ${response.status}: ${providerMessage}`
        : `PayChangu returned HTTP ${response.status}.`,
      response.status,
    );
  }

  const checkoutUrl = payload.data?.checkout_url;
  if (typeof checkoutUrl !== "string") {
    throw new PayChanguProviderError(
      "PayChangu response did not include a checkout URL.",
      response.status,
    );
  }

  let parsedCheckoutUrl: URL;
  try {
    parsedCheckoutUrl = new URL(checkoutUrl);
  } catch {
    throw new PayChanguProviderError(
      "PayChangu returned an invalid checkout URL.",
      response.status,
    );
  }

  if (parsedCheckoutUrl.protocol !== "https:") {
    throw new PayChanguProviderError(
      "PayChangu returned a non-HTTPS checkout URL.",
      response.status,
    );
  }

  return parsedCheckoutUrl.toString();
}

type VerifyResponse = {
  status?: string;
  message?: string;
  data?: {
    tx_ref?: string;
    status?: string;
    amount?: number | string;
    currency?: string;
    reference?: string;
    charge_id?: string;
  };
};

export type PayChanguVerification = {
  txRef: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  providerTransactionId: string | null;
};

export async function verifyPayChanguTransaction(
  txRef: string,
): Promise<PayChanguVerification> {
  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  if (!secretKey) {
    throw new PayChanguProviderError(
      "PAYCHANGU_SECRET_KEY is not configured.",
      503,
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.paychangu.com/verify-payment/${encodeURIComponent(txRef)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${secretKey}`,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new PayChanguProviderError(
      "Could not reach PayChangu transaction verification.",
      502,
    );
  }

  let payload: VerifyResponse;
  try {
    payload = (await response.json()) as VerifyResponse;
  } catch {
    throw new PayChanguProviderError(
      `PayChangu verification returned HTTP ${response.status} with an invalid response.`,
      response.status,
    );
  }

  if (!response.ok) {
    const providerMessage = getSafeProviderMessage(payload);
    throw new PayChanguProviderError(
      providerMessage
        ? `PayChangu verification returned HTTP ${response.status}: ${providerMessage}`
        : `PayChangu verification returned HTTP ${response.status}.`,
      response.status,
    );
  }

  const data = payload.data;
  const rawAmount = data?.amount;
  const amount =
    typeof rawAmount === "number" || typeof rawAmount === "string"
      ? Number(rawAmount)
      : null;

  return {
    txRef: typeof data?.tx_ref === "string" ? data.tx_ref : null,
    status: typeof data?.status === "string" ? data.status : null,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: typeof data?.currency === "string" ? data.currency : null,
    providerTransactionId:
      typeof data?.reference === "string"
        ? data.reference
        : typeof data?.charge_id === "string"
          ? data.charge_id
          : null,
  };
}

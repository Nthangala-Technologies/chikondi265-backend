import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const providerSource = await readFile(
  new URL("../src/modules/payments/paychangu-provider.ts", import.meta.url),
  "utf8",
);
const { code } = await transform(providerSource, {
  loader: "ts",
  format: "esm",
});
const { createPayChanguCheckout } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

test("PayChangu uses HTTPS app-return endpoints, separate from the webhook", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.PAYCHANGU_SECRET_KEY;
  const originalWebhook = process.env.PAYCHANGU_WEBHOOK_URL;
  let requestBody;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.PAYCHANGU_SECRET_KEY;
    else process.env.PAYCHANGU_SECRET_KEY = originalSecret;
    if (originalWebhook === undefined) delete process.env.PAYCHANGU_WEBHOOK_URL;
    else process.env.PAYCHANGU_WEBHOOK_URL = originalWebhook;
  });

  process.env.PAYCHANGU_SECRET_KEY = "test-only";
  process.env.PAYCHANGU_WEBHOOK_URL =
    "https://chikondi265-chikondi265-dfwtab-894778-102-202-46-218.sslip.io/api/v1/payments/paychangu/webhook";
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        status: "success",
        data: { checkout_url: "https://checkout.paychangu.com/test-only" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const checkoutUrl = await createPayChanguCheckout({
    amountMwk: 5000,
    txRef: "test-only",
  });

  assert.equal(checkoutUrl, "https://checkout.paychangu.com/test-only");
  assert.equal(
    requestBody.callback_url,
    "https://chikondi265-chikondi265-dfwtab-894778-102-202-46-218.sslip.io/api/v1/payments/paychangu/return/success?tx_ref=test-only",
  );
  assert.equal(
    requestBody.return_url,
    "https://chikondi265-chikondi265-dfwtab-894778-102-202-46-218.sslip.io/api/v1/payments/paychangu/return/failure?tx_ref=test-only",
  );
  assert.ok(!requestBody.callback_url.endsWith("/webhook"));
  assert.ok(!requestBody.return_url.endsWith("/webhook"));
});

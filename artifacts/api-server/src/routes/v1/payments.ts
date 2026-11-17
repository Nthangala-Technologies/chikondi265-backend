import { Router } from "express";
import {
  CreatePaymentIntentBody,
  CreatePaymentIntentParams,
  CreatePaymentIntentResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  createPaymentIntent,
  receivePayChanguWebhook,
} from "../../modules/payments/service";

const router = Router();
export const payChanguWebhookRouter = Router();
export const payChanguReturnRouter = Router();

function paymentReturnPage(success: boolean): string {
  const title = success ? "Payment Successful!" : "Payment not completed";
  const description = success
    ? "Your chat is now unlocked."
    : "No payment was confirmed. You can return to the app and try again.";
  const icon = success ? "✓" : "×";
  const iconClass = success ? "success" : "failure";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#f7efeb">
    <title>${title} · Chikondi265</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px 18px; background: #f7efeb; color: #2d2332; }
      main { width: min(100%, 420px); padding: 36px 26px 28px; border: 1px solid #e5d8d4; border-radius: 28px; background: #fffaf7; box-shadow: 0 18px 55px rgba(45, 35, 50, .12); text-align: center; }
      .brand { margin: 0 0 28px; color: #806d7a; font-size: 13px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
      .icon { width: 78px; height: 78px; margin: 0 auto 22px; display: grid; place-items: center; border-radius: 50%; font-size: 42px; font-weight: 700; }
      .success { background: #e6f5ed; color: #218150; }
      .failure { background: #fbe8e9; color: #bd4d5e; }
      h1 { margin: 0; font-size: clamp(25px, 7vw, 32px); line-height: 1.15; letter-spacing: -.035em; }
      .description { margin: 12px 0 28px; color: #806d7a; font-size: 16px; line-height: 1.55; }
      .return { min-height: 54px; display: flex; align-items: center; justify-content: center; border-radius: 16px; background: #df4e78; color: #fff; font-size: 16px; font-weight: 700; text-decoration: none; box-shadow: 0 8px 18px rgba(223, 78, 120, .24); }
      .note { margin: 18px 0 0; color: #806d7a; font-size: 12px; line-height: 1.5; }
      @media (prefers-reduced-motion: no-preference) { .icon { animation: pop .35s ease-out both; } @keyframes pop { from { opacity: .35; transform: scale(.72); } to { opacity: 1; transform: scale(1); } } }
    </style>
  </head>
  <body>
    <main>
      <p class="brand">Chikondi265</p>
      <div class="icon ${iconClass}" role="img" aria-label="${success ? "Success" : "Not completed"}">${icon}</div>
      <h1>${title}</h1>
      <p class="description">${description}</p>
      <a class="return" href="chikondi265://">Return to App</a>
      <p class="note">If the app does not open, close this page and return to Chikondi265.</p>
    </main>
  </body>
</html>`;
}

payChanguReturnRouter.get("/success", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(paymentReturnPage(true));
});

payChanguReturnRouter.get("/failure", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(paymentReturnPage(false));
});

router.post(
  "/connections/:id/payment-intents",
  requireUser,
  async (req, res, next): Promise<void> => {
    const params = CreatePaymentIntentParams.safeParse(req.params);
    if (!params.success) {
      next(new ApiError(400, "BAD_REQUEST", "Connection ID is invalid."));
      return;
    }

    const body = CreatePaymentIntentBody.safeParse(req.body ?? {});
    if (!body.success) {
      next(
        new ApiError(400, "BAD_REQUEST", "Payment intent request is invalid."),
      );
      return;
    }

    try {
      const result = await createPaymentIntent({
        connectionId: params.data.id,
        payerUserId: res.locals.userId as string,
        idempotencyKey: body.data.idempotencyKey,
      });
      res.json(CreatePaymentIntentResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

payChanguWebhookRouter.post(
  "/",
  async (req, res, next): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) {
      next(new ApiError(400, "BAD_REQUEST", "Webhook body is required."));
      return;
    }

    try {
      await receivePayChanguWebhook(
        req.body,
        req.header("Signature") ?? "",
      );
      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

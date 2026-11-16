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

payChanguReturnRouter.get("/success", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Payment returned</title><body style=\"font-family:system-ui,sans-serif;padding:2rem;max-width:36rem;margin:auto\"><h1>Payment flow complete</h1><p>You can close this page and return to Chikondi265. Chat access updates after the server confirms payment.</p></body></html>",
  );
});

payChanguReturnRouter.get("/failure", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Payment not completed</title><body style=\"font-family:system-ui,sans-serif;padding:2rem;max-width:36rem;margin:auto\"><h1>Payment not completed</h1><p>You can close this page and return to Chikondi265. No chat access was changed.</p></body></html>",
  );
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

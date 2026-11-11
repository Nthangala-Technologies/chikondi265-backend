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

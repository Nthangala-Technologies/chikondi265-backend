import { Router } from "express";
import {
  CreateSubscriptionCheckoutBody,
  CreateSubscriptionCheckoutResponse,
  GetSubscriptionPlansResponse,
  VerifySubscriptionCheckoutParams,
  VerifySubscriptionCheckoutResponse,
} from "@workspace/api-zod";
import { requireUser } from "../../middleware/require-user";
import { findActiveSubscription, listSubscriptionPlans } from "../../modules/subscriptions/repository";
import {
  createSubscriptionCheckout,
  verifySubscriptionCheckoutForUser,
} from "../../modules/subscriptions/payments-service";
import { ApiError } from "../../middleware/error-handler";

const router = Router();
router.get("/subscriptions/plans", requireUser, async (_req, res) => {
  const [items, subscription] = await Promise.all([
    listSubscriptionPlans(),
    findActiveSubscription(res.locals.userId as string),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetSubscriptionPlansResponse.parse({
    items,
    activeUntil: subscription?.expiresAt.toISOString() ?? null,
  }));
});

router.post("/subscriptions/checkout", requireUser, async (req, res, next) => {
  const parsed = CreateSubscriptionCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Subscription checkout details are invalid."));
    return;
  }

  try {
    const result = await createSubscriptionCheckout({
      ...parsed.data,
      userId: res.locals.userId as string,
    });
    res.status(201).json(CreateSubscriptionCheckoutResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/subscriptions/checkout/:txRef/verify",
  requireUser,
  async (req, res, next) => {
    const parsed = VerifySubscriptionCheckoutParams.safeParse({
      txRef: req.params.txRef,
    });
    if (!parsed.success) {
      next(new ApiError(400, "BAD_REQUEST", "The payment reference is invalid."));
      return;
    }
    try {
      const result = await verifySubscriptionCheckoutForUser(
        parsed.data.txRef,
        res.locals.userId as string,
      );
      res.json(VerifySubscriptionCheckoutResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

export default router;

import { Router } from "express";
import { GetSubscriptionPlansResponse } from "@workspace/api-zod";
import { requireUser } from "../../middleware/require-user";
import { findActiveSubscription, listSubscriptionPlans } from "../../modules/subscriptions/repository";

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

export default router;

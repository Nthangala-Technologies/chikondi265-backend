import { Router } from "express";
import { GetNotificationsResponse } from "@workspace/api-zod";
import { requireUser } from "../../middleware/require-user";
import { getUserNotifications } from "../../modules/matching/service";

const router = Router();

router.use(requireUser);

router.get("/notifications", async (_req, res, next) => {
  try {
    const items = await getUserNotifications(res.locals.userId as string);
    res.json(
      GetNotificationsResponse.parse({
        items: items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      }),
    );
  } catch (error) {
    next(error);
  }
});

export default router;

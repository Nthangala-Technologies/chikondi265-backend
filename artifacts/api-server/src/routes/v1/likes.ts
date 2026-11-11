import { Router } from "express";
import { GetIncomingLikesResponse } from "@workspace/api-zod";
import { requireUser } from "../../middleware/require-user";
import { getIncomingLikes } from "../../modules/matching/service";

const router = Router();

router.use(requireUser);

router.get("/likes", async (_req, res, next) => {
  try {
    const items = await getIncomingLikes(res.locals.userId as string);
    res.json(
      GetIncomingLikesResponse.parse({
        items: items.map((item) => ({
          action: item.action,
          createdAt: item.createdAt.toISOString(),
          profile: item.profile,
        })),
      }),
    );
  } catch (error) {
    next(error);
  }
});

export default router;

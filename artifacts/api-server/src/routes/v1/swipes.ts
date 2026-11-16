import { Router } from "express";
import { RecordSwipeBody, RecordSwipeResponse } from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { recordUserSwipe } from "../../modules/matching/service";

const router = Router();

router.use(requireUser);

router.post("/swipes", async (req, res, next): Promise<void> => {
  const parsed = RecordSwipeBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Swipe data is invalid."));
    return;
  }

  try {
    const result = await recordUserSwipe(
      res.locals.userId as string,
      parsed.data.targetUserId,
      parsed.data.action,
    );
    res.json(RecordSwipeResponse.parse(result));
  } catch (error) {
    console.error("[swipes] Swipe transaction failed", {
      requestId: String(req.id ?? ""),
      targetUserId: parsed.data.targetUserId,
      error,
    });
    next(error);
  }
});

export default router;

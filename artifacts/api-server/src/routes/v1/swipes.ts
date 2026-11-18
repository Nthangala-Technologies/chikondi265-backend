import { Router } from "express";
import { RecordSwipeBody, RecordSwipeResponse } from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { recordUserSwipe } from "../../modules/matching/service";

const router = Router();

router.get("/swipes/_health", (_req, res) => {
  res.json({
    ok: true,
    route: "swipes",
    pid: process.pid,
    uptime: process.uptime(),
  });
});

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

// Alias + health probe (temporary: unblocks client if /swipes is unavailable at runtime)
router.post("/swipe", async (req, res, next): Promise<void> => {
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
    console.error("[swipe-alias] failed", {
      requestId: String(req.id ?? ""),
      error,
    });
    next(error);
  }
});

export default router;

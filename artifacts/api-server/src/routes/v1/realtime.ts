import { Router } from "express";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { createRealtimeTokenRequest } from "../../modules/realtime/service";

const router = Router();

router.use(requireUser);

router.post("/realtime/token", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(
      await createRealtimeTokenRequest(res.locals.userId as string),
    );
  } catch (error) {
    next(
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "INTERNAL_ERROR",
            "Realtime updates are temporarily unavailable.",
          ),
    );
  }
});

export default router;

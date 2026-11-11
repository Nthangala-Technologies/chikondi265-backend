import { Router } from "express";
import {
  GetCurrentPreferencesResponse,
  SaveCurrentPreferencesBody,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  getCurrentPreferences,
  saveCurrentPreferences,
} from "../../modules/profiles/service";

const router = Router();

router.use(requireUser);

router.get("/me/preferences", async (_req, res, next) => {
  try {
    res.json(
      GetCurrentPreferencesResponse.parse(
        await getCurrentPreferences(res.locals.userId as string),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.put("/me/preferences", async (req, res, next) => {
  const parsed = SaveCurrentPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Discovery preferences are invalid."));
    return;
  }

  try {
    res.json(
      GetCurrentPreferencesResponse.parse(
        await saveCurrentPreferences(
          res.locals.userId as string,
          parsed.data,
        ),
      ),
    );
  } catch (error) {
    next(error);
  }
});

export default router;

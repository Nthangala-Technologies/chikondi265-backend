import { Router } from "express";
import { SaveCurrentUserProfileBody } from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  getCurrentUserProfile,
  saveCurrentUserProfile,
} from "../../modules/profiles/service";

const router = Router();

router.use(requireUser);

router.get("/me", async (_req, res, next) => {
  try {
    res.json(await getCurrentUserProfile(res.locals.userId as string));
  } catch (error) {
    next(error);
  }
});

router.put("/me/profile", async (req, res, next) => {
  const parsed = SaveCurrentUserProfileBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Profile data is invalid."));
    return;
  }

  try {
    const profile = await saveCurrentUserProfile(
      res.locals.userId as string,
      parsed.data,
    );
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

export default router;

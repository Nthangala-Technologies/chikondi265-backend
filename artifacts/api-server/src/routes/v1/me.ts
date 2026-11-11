import { Router } from "express";
import {
  ChangeCurrentPasswordBody,
  SaveCurrentUserProfileBody,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  changeCurrentPassword,
  setCurrentProfileVisibility,
  softDeleteCurrentAccount,
} from "../../modules/accounts/service";
import {
  getCurrentUserProfile,
  saveCurrentUserProfile,
} from "../../modules/profiles/service";
import { getCurrentUserPaymentHistory } from "../../modules/payments/service";

const router = Router();

router.use(requireUser);

function collectFieldErrors(
  issues: readonly { path: readonly (string | number)[]; message: string }[],
) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.path.length
      ? issue.path.map(String).join(".")
      : "_form";
    (fieldErrors[field] ??= []).push(issue.message);
  }
  return fieldErrors;
}

router.get("/me", async (_req, res, next) => {
  try {
    res.json(await getCurrentUserProfile(res.locals.userId as string));
  } catch (error) {
    next(error);
  }
});

router.get("/me/payment-history", async (_req, res, next) => {
  try {
    res.json(
      await getCurrentUserPaymentHistory(res.locals.userId as string),
    );
  } catch (error) {
    next(error);
  }
});

router.put("/me/profile", async (req, res, next) => {
  const parsed = SaveCurrentUserProfileBody.safeParse(req.body);
  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "BAD_REQUEST",
        "Profile data is invalid.",
        collectFieldErrors(parsed.error.issues),
      ),
    );
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

router.delete("/me", async (_req, res, next) => {
  try {
    res.json(
      await softDeleteCurrentAccount(res.locals.userId as string),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/me/deactivate", async (_req, res, next) => {
  try {
    res.json(
      await setCurrentProfileVisibility(
        res.locals.userId as string,
        "paused",
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/me/activate", async (_req, res, next) => {
  try {
    res.json(
      await setCurrentProfileVisibility(
        res.locals.userId as string,
        "active",
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.put("/me/password", async (req, res, next) => {
  const parsed = ChangeCurrentPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "BAD_REQUEST",
        "Password details are invalid.",
        collectFieldErrors(parsed.error.issues),
      ),
    );
    return;
  }

  try {
    await changeCurrentPassword(
      res.locals.userId as string,
      res.locals.authSessionTokenHash as string,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    res.json({ changed: true });
  } catch (error) {
    next(error);
  }
});

export default router;

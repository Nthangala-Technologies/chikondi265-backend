import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  LoginAccountBody,
  RegisterAccountBody,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  loginAccount,
  registerAccount,
  revokeSession,
} from "../../modules/auth/service";

const router: IRouter = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again later.",
        requestId: String(req.id ?? ""),
      },
    });
  },
});

router.post("/auth/register", authRateLimit, async (req, res, next) => {
  const parsed = RegisterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Registration details are invalid."));
    return;
  }

  try {
    res.status(201).json(await registerAccount(parsed.data));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", authRateLimit, async (req, res, next) => {
  const parsed = LoginAccountBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Email or password is invalid."));
    return;
  }

  try {
    res.json(await loginAccount(parsed.data));
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", requireUser, async (_req, res, next) => {
  try {
    const tokenHash = res.locals.authSessionTokenHash as string;
    await revokeSession(tokenHash);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;

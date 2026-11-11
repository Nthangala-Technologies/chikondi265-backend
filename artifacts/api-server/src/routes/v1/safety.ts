import { Router } from "express";
import {
  CreateBlockBody,
  CreateBlockResponse,
  CreateSafetyReportBody,
  CreateSafetyReportResponse,
  RemoveBlockParams,
  RemoveBlockResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  createUserBlock,
  createUserSafetyReport,
  removeUserBlock,
} from "../../modules/safety/service";

const router = Router();

router.use(requireUser);

router.post("/blocks", async (req, res, next) => {
  const parsed = CreateBlockBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Block details are invalid."));
    return;
  }
  try {
    res.json(
      CreateBlockResponse.parse(
        await createUserBlock(
          res.locals.userId as string,
          parsed.data.blockedUserId,
        ),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/blocks/:userId", async (req, res, next) => {
  const parsed = RemoveBlockParams.safeParse(req.params);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "The blocked user ID is invalid."));
    return;
  }
  try {
    res.json(
      RemoveBlockResponse.parse(
        await removeUserBlock(
          res.locals.userId as string,
          parsed.data.userId,
        ),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/reports", async (req, res, next) => {
  const parsed = CreateSafetyReportBody.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Report details are invalid."));
    return;
  }
  try {
    res.status(201).json(
      CreateSafetyReportResponse.parse(
        await createUserSafetyReport(
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

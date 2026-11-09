import { Router } from "express";
import {
  GetDiscoveryQueryParams,
  GetDiscoveryResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { getDiscovery } from "../../modules/matching/service";

const router = Router();

router.use(requireUser);

router.get("/discovery", async (req, res, next): Promise<void> => {
  const parsed = GetDiscoveryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Discovery pagination is invalid."));
    return;
  }

  try {
    const result = await getDiscovery(
      res.locals.userId as string,
      parsed.data.limit,
      parsed.data.after,
    );
    res.json(GetDiscoveryResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

export default router;

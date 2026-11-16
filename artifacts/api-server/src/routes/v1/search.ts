import { Router } from "express";
import {
  SearchUsersQueryParams,
  SearchUsersResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { searchPublicProfiles } from "../../modules/matching/service";

const router = Router();

router.use(requireUser);

router.get("/search/users", async (req, res, next): Promise<void> => {
  const parsed = SearchUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "BAD_REQUEST",
        "Enter at least 3 characters to search.",
      ),
    );
    return;
  }

  try {
    const items = await searchPublicProfiles(
      res.locals.userId as string,
      parsed.data.q,
    );
    res.json(SearchUsersResponse.parse({ items }));
  } catch (error) {
    next(error);
  }
});

export default router;

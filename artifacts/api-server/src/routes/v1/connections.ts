import { Router } from "express";
import {
  GetConnectionParams,
  GetConnectionResponse,
  GetConnectionsResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import {
  getUserConnection,
  getUserConnections,
} from "../../modules/matching/service";

const router = Router();

router.use(requireUser);

router.get("/connections", async (_req, res, next): Promise<void> => {
  try {
    const connections = await getUserConnections(
      res.locals.userId as string,
    );
    res.json(GetConnectionsResponse.parse(connections));
  } catch (error) {
    next(error);
  }
});

router.get("/connections/:id", async (req, res, next): Promise<void> => {
  const parsed = GetConnectionParams.safeParse(req.params);
  if (!parsed.success) {
    next(new ApiError(400, "BAD_REQUEST", "Connection ID is invalid."));
    return;
  }

  try {
    const connection = await getUserConnection(
      res.locals.userId as string,
      parsed.data.id,
    );
    res.json(GetConnectionResponse.parse(connection));
  } catch (error) {
    next(error);
  }
});

export default router;

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
import { findActiveSubscription } from "../../modules/subscriptions/repository";

const router = Router();

router.use(requireUser);

function serializeConnection(
  connection: Awaited<ReturnType<typeof getUserConnection>>,
  subscription: Awaited<ReturnType<typeof findActiveSubscription>>,
) {
  const { isChatEligible, ...publicConnection } = connection;
  const entitlement = isChatEligible ? subscription : null;
  return {
    ...publicConnection,
    lastMessage: entitlement ? connection.lastMessage : null,
    matchedAt: connection.matchedAt.toISOString(),
    chatAccess: !isChatEligible ? "unavailable" : entitlement ? "available" : "subscription_required",
    chatEnabledAt: entitlement?.startedAt.toISOString() ?? null,
    chatAccessExpiresAt: entitlement?.expiresAt.toISOString() ?? null,
  };
}

router.get("/connections", async (_req, res, next): Promise<void> => {
  try {
    const userId = res.locals.userId as string;
    const [connections, subscription] = await Promise.all([
      getUserConnections(userId),
      findActiveSubscription(userId),
    ]);
    const serialized = connections.map((connection) => serializeConnection(connection, subscription));
    res.json(GetConnectionsResponse.parse(serialized));
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
    const userId = res.locals.userId as string;
    const [connection, subscription] = await Promise.all([
      getUserConnection(userId, parsed.data.id),
      findActiveSubscription(userId),
    ]);
    res.json(GetConnectionResponse.parse(serializeConnection(connection, subscription)));
  } catch (error) {
    next(error);
  }
});

export default router;

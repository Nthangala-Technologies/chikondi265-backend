import { Rest } from "ably";
import { ApiError } from "../../middleware/error-handler";

const userChannel = (userId: string) => `user:${userId}`;
let restClient: Rest | null = null;
let configuredKey: string | null = null;

function getRestClient() {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    throw new ApiError(
      503,
      "INTERNAL_ERROR",
      "Realtime updates are temporarily unavailable.",
    );
  }

  if (!restClient || configuredKey !== key) {
    configuredKey = key;
    restClient = new Rest({ key });
  }
  return restClient;
}

export async function createRealtimeTokenRequest(userId: string) {
  const channel = userChannel(userId);
  return getRestClient().auth.createTokenRequest({
    clientId: userId,
    ttl: 60 * 60 * 1000,
    capability: { [channel]: ["subscribe"] },
  });
}

export async function publishUserDataUpdates(userIds: string[]) {
  if (!process.env.ABLY_API_KEY) return;

  try {
    const client = getRestClient();
    const recipients = [...new Set(userIds.filter(Boolean))];
    const results = await Promise.allSettled(
      recipients.map((userId) =>
        client.channels.get(userChannel(userId)).publish("data-updated", {
          version: 1,
        }),
      ),
    );
    const failures = results.filter(
      (result) => result.status === "rejected",
    ).length;
    if (failures > 0) {
      console.warn("[realtime] Ably update publish failed", { failures });
    }
  } catch (error) {
    console.warn("[realtime] Ably update publish failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

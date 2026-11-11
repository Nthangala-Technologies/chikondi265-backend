import { db } from "@workspace/db";
import { ApiError } from "../../middleware/error-handler";
import { publishUserDataUpdates } from "../realtime/service";
import {
  findConnectionForUser,
  findConnectionsForUser,
  findDiscoveryPage,
  findIncomingLikes,
  findUserNotifications,
  getMatchingViewer,
  recordSwipe as persistSwipe,
} from "./repository";
import { isEligibleViewer } from "./policy";

export async function getDiscovery(
  userId: string,
  limit: number,
  after?: string,
) {
  const viewer = await getMatchingViewer(db, userId);
  if (!isEligibleViewer(viewer)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "An active profile for an adult account is required for discovery.",
    );
  }

  return findDiscoveryPage(viewer, limit, after);
}

export async function recordUserSwipe(
  userId: string,
  targetUserId: string,
  action: "like" | "pass" | "super",
) {
  const result = await persistSwipe(userId, targetUserId, action);
  if ("error" in result) {
    if (result.error === "viewer_ineligible") {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "An active profile for an adult account is required to swipe.",
      );
    }
    throw new ApiError(404, "NOT_FOUND", "The target profile is not available.");
  }
  await publishUserDataUpdates([userId, targetUserId]);
  return result;
}

export async function getUserConnections(userId: string) {
  return findConnectionsForUser(userId);
}

export async function getIncomingLikes(userId: string) {
  return findIncomingLikes(userId);
}

export async function getUserNotifications(userId: string) {
  return findUserNotifications(userId);
}

export async function getUserConnection(userId: string, connectionId: string) {
  const connection = await findConnectionForUser(userId, connectionId);
  if (!connection) {
    throw new ApiError(
      404,
      "NOT_FOUND",
      "Connection not found or not accessible.",
    );
  }
  return connection;
}

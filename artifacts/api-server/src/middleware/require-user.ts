import type { Request, RequestHandler } from "express";
import { hashSessionToken } from "../modules/auth/security";
import { resolveSession } from "../modules/auth/service";
import { ApiError } from "./error-handler";

type ResolvedSession = {
  userId: string;
  status: string;
  deletedAt: Date | null;
};

export interface AuthSessionProvider {
  resolveSession(tokenHash: string): Promise<ResolvedSession | null>;
}

function readBearerToken(req: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(
    req.header("authorization") ?? "",
  );
  return match?.[1] ?? null;
}

export function createRequireUser(
  sessionProvider: AuthSessionProvider,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      const token = readBearerToken(req);
      if (!token) {
        next(
          new ApiError(
            401,
            "UNAUTHENTICATED",
            "A valid bearer token is required.",
          ),
        );
        return;
      }

      const tokenHash = hashSessionToken(token);
      const session = await sessionProvider.resolveSession(tokenHash);
      if (!session) {
        next(
          new ApiError(
            401,
            "UNAUTHENTICATED",
            "A valid bearer token is required.",
          ),
        );
        return;
      }

      if (session.status !== "active" || session.deletedAt) {
        next(new ApiError(403, "FORBIDDEN", "This account is not available."));
        return;
      }

      res.locals.userId = session.userId;
      res.locals.authSessionTokenHash = tokenHash;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireUser = createRequireUser({ resolveSession });

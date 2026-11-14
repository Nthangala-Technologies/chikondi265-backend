import type {
  ErrorRequestHandler,
  RequestHandler,
} from "express";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "USER_NOT_PROVISIONED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, "NOT_FOUND", "Route not found."));
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: String(req.id),
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
    });
    return;
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 413
  ) {
    res.status(413).json({
      error: {
        code: "BAD_REQUEST",
        message: "The image must be 5 MB or smaller.",
        requestId: String(req.id),
        fieldErrors: { photo: ["The image must be 5 MB or smaller."] },
      },
    });
    return;
  }

  req.log.error({ err: error }, "Unhandled API error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: String(req.id),
    },
  });
};

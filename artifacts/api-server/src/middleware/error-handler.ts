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

  req.log.error({ err: error }, "Unhandled API error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: String(req.id),
    },
  });
};

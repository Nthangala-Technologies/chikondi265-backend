import express, { type Express, type Request } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import router from "./routes";
import { payChanguWebhookRouter } from "./routes/v1/payments";
import { isAllowedCorsOrigin } from "./lib/config";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    genReqId() {
      return randomUUID();
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  res.setHeader("x-request-id", String(req.id));
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, false);
        return;
      }

      callback(null, isAllowedCorsOrigin(origin));
    },
  }),
);
app.use(
  "/api/v1/payments/paychangu/webhook",
  express.raw({ type: "application/json", limit: "64kb" }),
  payChanguWebhookRouter,
);
app.use(
  express.json({
    limit: "64kb",
    verify(req, _res, buffer) {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

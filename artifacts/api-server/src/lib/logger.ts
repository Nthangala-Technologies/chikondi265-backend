import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers.signature",
    "req.headers.x-paychangu-signature",
    "req.headers.x-paychangu-api-key",
    "req.headers.x-api-key",
    "provider_key",
    "provider_secret",
    "webhook_secret",
    "payment_payload",
    "req.body",
    "req.rawBody",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

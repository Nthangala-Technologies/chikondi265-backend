import { createServer } from "node:http";
import { pool } from "@workspace/db";
import app from "./app";
import { runtimeConfig } from "./lib/config";
import { logger } from "./lib/logger";
import { attachChatWebSocket } from "./modules/chat/realtime";

const server = createServer(app);
attachChatWebSocket(server);
server.listen(runtimeConfig.port, "0.0.0.0", () => {
  logger.info({ port: runtimeConfig.port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exitCode = 1;
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, "Shutting down API server");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Error closing HTTP server");
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      logger.error({ err: poolError }, "Error closing database pool");
      process.exitCode = 1;
    }

    clearTimeout(forceExit);
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

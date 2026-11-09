import { performance } from "node:perf_hooks";
import { Router, type IRouter, type Request } from "express";
import { pool } from "@workspace/db";
import { getRecentProcessErrors, safeDiagnosticError } from "../lib/process-errors";

const router: IRouter = Router();
const DATABASE_CHECK_TIMEOUT_MS = 3_000;

router.get("/debug/status", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  let databaseConnected = false;
  let databaseError: string | null = null;
  let databaseLatencyMs: number | null = null;
  const databaseStartedAt = performance.now();
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`database check timed out after ${DATABASE_CHECK_TIMEOUT_MS}ms`)),
          DATABASE_CHECK_TIMEOUT_MS,
        );
        timeout.unref();
      }),
    ]);
    databaseConnected = true;
  } catch (error) {
    databaseError = safeDiagnosticError(error);
  } finally {
    if (timeout) clearTimeout(timeout);
    databaseLatencyMs = Math.round(performance.now() - databaseStartedAt);
  }

  const memory = process.memoryUsage();
  const port = req.socket.localPort ?? null;

  res.json({
    timestamp: new Date().toISOString(),
    serverListening: port !== null,
    port,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    env: {
      PORT: process.env.PORT ?? null,
    },
    database: {
      connected: databaseConnected,
      error: databaseError,
      latencyMs: databaseLatencyMs,
    },
    memory: {
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
    },
    lastErrors: getRecentProcessErrors(),
    requestInfo: {
      ip: req.ip || req.socket.remoteAddress || null,
      userAgent: getUserAgent(req),
      reachedNode: true,
    },
  });
});

function getUserAgent(req: Request): string | null {
  const value = req.get("user-agent");
  return value ? value.slice(0, 300) : null;
}

export default router;

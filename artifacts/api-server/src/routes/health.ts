import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

router.get("/admin/user-count", async (_req, res) => {
  if (process.env.ENABLE_ADMIN_COUNT !== "true") {
    res.status(404).end();
    return;
  }

  try {
    const result = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    res.json({ count: result.rows[0].n });
  } catch {
    res.status(500).json({ error: "Unable to read user count." });
  }
});

export default router;

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// Simple health endpoint - return minimal runtime-safe response.
const healthHandler = (_req: any, res: any) => {
  res.json({ status: "ok" });
};

router.get("/healthz", healthHandler);
router.get("/health", healthHandler);

router.get("/db/ping", async (_req: any, res: any) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database connection failed";
    res.status(503).json({ status: "error", db: "disconnected", message });
  }
});

export default router;

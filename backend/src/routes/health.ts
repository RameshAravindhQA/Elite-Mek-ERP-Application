import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// Simple health endpoint — return minimal runtime-safe response to avoid
// depending on generated Zod types during typecheck/build.
router.get("/healthz", (_req: any, res: any) => {
  res.json({ status: "ok" });
});

router.get("/db/ping", async (_req: any, res: any) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok", db: "connected" });
});

export default router;

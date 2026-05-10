import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/db/ping", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok", db: "connected" });
});

export default router;

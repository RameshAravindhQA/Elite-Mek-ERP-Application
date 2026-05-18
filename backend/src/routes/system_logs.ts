import { Router } from "express";
import { logger, systemLogFile } from "../lib/logger.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const sanitizeString = (value: unknown, max = 500) => {
  if (typeof value !== "string") return value;
  return value.replace(/\s+/g, " ").trim().slice(0, max);
};

router.get("/system-logs/status", requireAuth, (_req, res) => {
  res.json({
    enabled: Boolean(systemLogFile),
    file: systemLogFile,
    format: "jsonl",
  });
});

router.post("/system-logs/client", requireAuth, (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  if (!events.length) {
    res.status(400).json({ error: "No log events provided" });
    return;
  }

  for (const rawEvent of events.slice(0, 50)) {
    const level = rawEvent?.level === "error" ? "error" : rawEvent?.level === "warn" ? "warn" : "info";
    const event = {
      source: "frontend",
      type: sanitizeString(rawEvent?.type, 80),
      message: sanitizeString(rawEvent?.message, 500),
      path: sanitizeString(rawEvent?.path, 300),
      target: sanitizeString(rawEvent?.target, 160),
      method: sanitizeString(rawEvent?.method, 12),
      status: rawEvent?.status,
      duration: rawEvent?.duration,
      stack: sanitizeString(rawEvent?.stack, 2000),
      userId: req.user?.id,
      userName: req.user?.name,
      userAgent: req.get("user-agent"),
      timestamp: rawEvent?.timestamp,
    };

    logger[level](event, `Frontend ${event.type || "event"}: ${event.message || event.target || event.path || "captured"}`);
  }

  res.status(202).json({ accepted: Math.min(events.length, 50), file: systemLogFile });
});

export default router;

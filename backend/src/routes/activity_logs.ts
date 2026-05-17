import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// In-memory activity store (for demonstration; consider using database for production)
interface ActivityLog {
  id: string;
  userId?: string;
  action: string;
  module: string;
  details?: Record<string, any>;
  timestamp: number;
  userAgent?: string;
  ipAddress?: string;
}

const activityLogs: ActivityLog[] = [];
const MAX_ACTIVITY_LOGS = 5000;

// POST endpoint to log activities from frontend
router.post("/activity-logs", requireAuth, async (req, res) => {
  try {
    const { action, module, details } = req.body;
    
    if (!action || !module) {
      res.status(400).json({ error: "Missing required fields: action, module" });
      return;
    }

    const activity: ActivityLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: (req as any).user?.id || "unknown",
      action,
      module,
      details,
      timestamp: Date.now(),
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    };

    activityLogs.push(activity);
    
    // Keep only last N activities in memory
    if (activityLogs.length > MAX_ACTIVITY_LOGS) {
      activityLogs.splice(0, activityLogs.length - MAX_ACTIVITY_LOGS);
    }

    // Also log to server logs
    logger.info({
      userId: activity.userId,
      details,
    }, `Activity: ${action} in ${module}`);

    res.status(201).json({ id: activity.id, message: "Activity logged" });
  } catch (err) {
    logger.error({ err });
    res.status(500).json({ error: "Failed to log activity" });
  }
});

// GET endpoint to retrieve activities
router.get("/activity-logs", requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    const action = req.query.action as string;
    const module = req.query.module as string;

    let filtered = activityLogs;

    // Filter by action or module if specified
    if (action) {
      filtered = filtered.filter((log) => log.action === action);
    }
    if (module) {
      filtered = filtered.filter((log) => log.module === module);
    }

    // Return newest first, with pagination
    const paginated = filtered
      .reverse()
      .slice(offset, offset + limit);

    res.json({
      data: paginated,
      pagination: {
        limit,
        offset,
        total: filtered.length,
      },
    });
  } catch (err) {
    logger.error({ err });
    res.status(500).json({ error: "Failed to retrieve activity logs" });
  }
});

// GET endpoint for activity statistics
router.get("/activity-logs/stats", requireAuth, async (req, res) => {
  try {
    const actions = new Map<string, number>();
    const modules = new Map<string, number>();

    activityLogs.forEach((log) => {
      actions.set(log.action, (actions.get(log.action) || 0) + 1);
      modules.set(log.module, (modules.get(log.module) || 0) + 1);
    });

    res.json({
      totalActivities: activityLogs.length,
      actionBreakdown: Object.fromEntries(actions),
      moduleBreakdown: Object.fromEntries(modules),
      oldestActivity: activityLogs.length > 0 ? activityLogs[0].timestamp : null,
      newestActivity: activityLogs.length > 0 ? activityLogs[activityLogs.length - 1].timestamp : null,
    });
  } catch (err) {
    logger.error({ err });
    res.status(500).json({ error: "Failed to retrieve stats" });
  }
});

// DELETE endpoint to clear all activities
router.delete("/activity-logs", requireAuth, async (req, res) => {
  try {
    // Only allow admins to clear logs (you might want to add role check)
    activityLogs.length = 0;
    logger.info("Activity logs cleared");
    res.json({ message: "All activity logs cleared" });
  } catch (err) {
    logger.error({ err });
    res.status(500).json({ error: "Failed to clear activity logs" });
  }
});

export default router;

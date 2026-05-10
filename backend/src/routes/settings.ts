import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const ALLOWED_FIELDS = [
  "companyName", "companyLogo", "companyAddress", "companyPhone", "companyPhone2",
  "companyEmail", "companyWebsite", "gstNumber", "panNumber", "cinNumber",
  "bankName", "bankAccount", "bankIfsc", "currency", "timezone",
  "themeColor", "themeMode", "headerFont", "bodyFont", "buttonColor", "fieldColor",
  "pdfHeaderContent", "pdfFooterContent", "excelHeaderContent", "excelFooterContent",
  "pdfFormatting", "smtpHost", "smtpPort", "smtpUser", "smtpFromEmail",
  "whatsappApiKey", "payslipWhatsappEnabled", "payslipWhatsappMode",
  "payslipWhatsappSenderPhone", "payslipMessageTemplate",
  "payslipDefaultWorkingDays", "payslipIncludeLeaveDetails",
  "smsApiKey"
];

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) {
      const [created] = await db.insert(settingsTable).values({}).returning();
      res.json(created); return;
    }
    res.json(settings);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const updates: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body && body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    updates.updatedAt = new Date();

    const [existing] = await db.select().from(settingsTable).limit(1);
    let settings;
    if (!existing) {
      [settings] = await db.insert(settingsTable).values(updates as any).returning();
    } else {
      [settings] = await db.update(settingsTable).set(updates).where(sql`id = ${existing.id}`).returning();
    }
    res.json(settings);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;

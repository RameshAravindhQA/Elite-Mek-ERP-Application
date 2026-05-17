import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { sql } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAuditLog } from "../lib/audit.js";

const router = Router();
const dataDir = path.resolve(process.cwd(), "backend", "data");
const soundSettingsFile = path.join(dataDir, "sound-settings.json");

const ALLOWED_FIELDS = [
  "companyName", "companyLogo", "companyAddress", "companyPhone", "companyPhone2",
  "companyEmail", "companyWebsite", "gstNumber", "panNumber", "cinNumber",
  "bankName", "bankAccount", "bankIfsc", "currency", "timezone",
  "themeColor", "themeMode", "headerFont", "bodyFont", "buttonColor", "fieldColor",
  "pdfHeaderContent", "pdfFooterContent", "excelHeaderContent", "excelFooterContent",
  "pdfFormatting", "smtpHost", "smtpPort", "smtpUser", "smtpFromEmail",
  "whatsappApiKey", "openwaApiUrl", "openwaApiKey", "openwaSessionId",
  "payslipWhatsappEnabled", "payslipWhatsappMode",
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
    await createAuditLog({ module: "settings", action: existing ? "update" : "create", recordId: settings.id, userId: req.user!.id, userName: req.user!.name, description: "Updated system settings", oldValues: existing as any, newValues: updates });
    res.json(settings);
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

async function readSoundSettings() {
  try {
    return JSON.parse(await readFile(soundSettingsFile, "utf8"));
  } catch {
    return { enabled: true, preset: "0", events: {}, customSounds: {} };
  }
}

async function writeSoundSettings(settings: any) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(soundSettingsFile, JSON.stringify(settings, null, 2));
}

router.get("/settings/sounds", requireAuth, async (req, res) => {
  try {
    res.json(await readSoundSettings());
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/settings/sounds", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const oldSettings = await readSoundSettings();
    const settings = {
      enabled: body.enabled !== false,
      preset: typeof body.preset === "string" ? body.preset : "0",
      events: typeof body.events === "object" && body.events ? body.events : {},
      customSounds: typeof body.customSounds === "object" && body.customSounds ? body.customSounds : {},
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.name || "System",
    };
    await writeSoundSettings(settings);
    await createAuditLog({ module: "settings", action: "update", userId: req.user!.id, userName: req.user!.name, description: "Updated sound settings", oldValues: oldSettings, newValues: settings });
    res.json(settings);
  } catch (err) {
    req.log.error({ err });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

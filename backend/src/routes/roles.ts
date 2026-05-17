import { Router } from "express";
import { db, rolesTable } from "@workspace/db";
import { desc, eq } from "@workspace/db/drizzle";
import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.get("/roles", requireAuth, async (req, res) => {
  try {
    const data = await db.select().from(rolesTable).orderBy(desc(rolesTable.createdAt), desc(rolesTable.id));
    res.json({ data: data.map(r => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/roles", requireAuth, async (req, res) => {
  try {
    const [r] = await db.insert(rolesTable).values({ ...req.body, permissions: req.body.permissions || [] }).returning();
    await createAuditLog({ module: "roles", action: "create", recordId: r.id, userId: req.user!.id, userName: req.user!.name, description: `Created role ${r.name}`, newValues: req.body });
    res.status(201).json({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/roles/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [old] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const [r] = await db.update(rolesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(rolesTable.id, id)).returning();
    await createAuditLog({ module: "roles", action: "update", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Updated role ${r.name}`, oldValues: old as any, newValues: req.body });
    res.json({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/roles/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [r] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
    if (!r) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(rolesTable).where(eq(rolesTable.id, id));
    await createAuditLog({ module: "roles", action: "delete", recordId: id, userId: req.user!.id, userName: req.user!.name, description: `Deleted role ${r.name}`, oldValues: r as any });
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;

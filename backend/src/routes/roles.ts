import { Router } from "express";
import { db, rolesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

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
    res.status(201).json({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/roles/:id", requireAuth, async (req, res) => {
  try {
    const [r] = await db.update(rolesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(rolesTable.id, Number(req.params.id))).returning();
    res.json({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/roles/:id", requireAuth, async (req, res) => {
  try {
    await db.delete(rolesTable).where(eq(rolesTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

export default router;

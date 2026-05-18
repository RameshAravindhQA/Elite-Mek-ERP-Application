import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema/users";
import { eq } from "@workspace/db/drizzle";
import { hashPassword, verifyPassword, generateToken } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.post("/auth/login", async (req: any, res: any) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = generateToken(user.id, user.email);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, phone: user.phone, createdAt: user.createdAt } });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (_req: any, res: any) => {
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req: any, res: any) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, phone: user.phone, createdAt: user.createdAt });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/auth/me", requireAuth, async (req: any, res: any) => {
  try {
    const { name, phone, avatar } = req.body;
    const [user] = await db.update(usersTable).set({ name, phone, avatar, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.id)).returning();
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, phone: user.phone, createdAt: user.createdAt });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Update profile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/change-password", requireAuth, async (req: any, res: any) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }
    await db.update(usersTable).set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() }).where(eq(usersTable.id, req.user!.id));
    res.json({ success: true });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Change password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

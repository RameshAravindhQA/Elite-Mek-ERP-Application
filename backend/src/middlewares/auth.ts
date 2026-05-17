import type { Request, Response, NextFunction } from "express";
import { parseToken } from "../lib/auth.js";
import { db, usersTable, rolesTable } from "@workspace/db";
import { eq } from "@workspace/db/drizzle";

type PermissionAction = "view" | "create" | "edit" | "delete";

type RolePermission = {
  module: string;
  actions: PermissionAction[];
};

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: RolePermission[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const normalizeRoleKey = (role: string) => role.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeModuleKey = (module: string) => module.trim().toLowerCase().replace(/[\s-]+/g, "_");

const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermission[]> = {
  admin: [
    { module: "employees", actions: ["view", "create", "edit", "delete"] },
    { module: "attendance", actions: ["view", "create", "edit", "delete"] },
    { module: "payroll", actions: ["view", "create", "edit", "delete"] },
    { module: "leaves", actions: ["view", "create", "edit", "delete"] },
    { module: "customers", actions: ["view", "create", "edit", "delete"] },
    { module: "vendors", actions: ["view", "create", "edit", "delete"] },
    { module: "projects", actions: ["view", "create", "edit", "delete"] },
    { module: "purchase_orders", actions: ["view", "create", "edit", "delete"] },
    { module: "ledger", actions: ["view", "create", "edit", "delete"] },
    { module: "inventory", actions: ["view", "create", "edit", "delete"] },
    { module: "expenses", actions: ["view", "create", "edit", "delete"] },
    { module: "revenue", actions: ["view", "create", "edit", "delete"] },
    { module: "invoices", actions: ["view", "create", "edit", "delete"] },
    { module: "documents", actions: ["view", "create", "edit", "delete"] },
    { module: "reports", actions: ["view", "create", "edit", "delete"] },
    { module: "settings", actions: ["view", "edit"] },
    { module: "roles", actions: ["view", "create", "edit", "delete"] },
  ],
  administrator: [
    { module: "employees", actions: ["view", "create", "edit", "delete"] },
    { module: "attendance", actions: ["view", "create", "edit", "delete"] },
    { module: "payroll", actions: ["view", "create", "edit", "delete"] },
    { module: "leaves", actions: ["view", "create", "edit", "delete"] },
    { module: "customers", actions: ["view", "create", "edit", "delete"] },
    { module: "vendors", actions: ["view", "create", "edit", "delete"] },
    { module: "projects", actions: ["view", "create", "edit", "delete"] },
    { module: "purchase_orders", actions: ["view", "create", "edit", "delete"] },
    { module: "ledger", actions: ["view", "create", "edit", "delete"] },
    { module: "inventory", actions: ["view", "create", "edit", "delete"] },
    { module: "expenses", actions: ["view", "create", "edit", "delete"] },
    { module: "revenue", actions: ["view", "create", "edit", "delete"] },
    { module: "invoices", actions: ["view", "create", "edit", "delete"] },
    { module: "documents", actions: ["view", "create", "edit", "delete"] },
    { module: "reports", actions: ["view", "create", "edit", "delete"] },
    { module: "settings", actions: ["view", "edit"] },
    { module: "roles", actions: ["view", "create", "edit", "delete"] },
  ],
  manager: [
    { module: "employees", actions: ["view", "create", "edit"] },
    { module: "attendance", actions: ["view", "create", "edit"] },
    { module: "payroll", actions: ["view", "create", "edit"] },
    { module: "leaves", actions: ["view", "create", "edit"] },
    { module: "customers", actions: ["view", "create", "edit"] },
    { module: "vendors", actions: ["view", "create", "edit"] },
    { module: "projects", actions: ["view", "create", "edit"] },
    { module: "purchase_orders", actions: ["view", "create", "edit"] },
    { module: "inventory", actions: ["view", "create", "edit"] },
    { module: "expenses", actions: ["view", "create", "edit"] },
    { module: "revenue", actions: ["view", "create", "edit"] },
    { module: "invoices", actions: ["view", "create", "edit"] },
    { module: "documents", actions: ["view", "create", "edit"] },
    { module: "reports", actions: ["view", "create", "edit"] },
  ],
  employee: [
    { module: "employees", actions: ["view"] },
    { module: "attendance", actions: ["view"] },
    { module: "payroll", actions: ["view"] },
    { module: "leaves", actions: ["view"] },
  ],
  accountant: [
    { module: "invoices", actions: ["view", "create", "edit"] },
    { module: "expenses", actions: ["view", "create", "edit"] },
    { module: "revenue", actions: ["view", "create", "edit"] },
    { module: "payroll", actions: ["view", "create", "edit"] },
  ],
  "hr manager": [
    { module: "employees", actions: ["view", "create", "edit"] },
    { module: "attendance", actions: ["view", "create", "edit"] },
    { module: "payroll", actions: ["view", "create", "edit"] },
    { module: "leaves", actions: ["view", "create", "edit"] },
  ],
};

const normalizePermissions = (permissions: unknown): RolePermission[] => {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((item) => typeof item === "object" && item !== null).map((item: any) => ({
    module: normalizeModuleKey(String(item.module || "")),
    actions: Array.isArray(item.actions) ? item.actions.filter((action: unknown) => ["view", "create", "edit", "delete"].includes(String(action))) as PermissionAction[] : [],
  }));
};

const loadPermissionsForRole = async (role: string): Promise<RolePermission[]> => {
  const normalizedRole = normalizeRoleKey(role);
  try {
    const roles = await db.select().from(rolesTable);
    const matched = roles.find((r) => normalizeRoleKey(r.name) === normalizedRole);
    if (matched) {
      return normalizePermissions(matched.permissions as unknown);
    }
  } catch {
    // ignore DB role lookup failure and fallback to defaults
  }
  return DEFAULT_ROLE_PERMISSIONS[normalizedRole] ?? [];
};

const userHasPermission = (user: AuthUser | undefined, module: string, action: PermissionAction) => {
  const moduleKey = normalizeModuleKey(module);
  return !!user?.permissions?.some((permission) => normalizeModuleKey(permission.module) === moduleKey && permission.actions.includes(action));
};

export const requirePermission = (module: string, action: PermissionAction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!userHasPermission(req.user, module, action)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const parsed = parseToken(token);
  if (!parsed) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const permissions = await loadPermissionsForRole(user.role);
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role, permissions };
    next();
  } catch (err) {
    req.log?.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
  }
}

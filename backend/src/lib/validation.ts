import { type Request, type Response, type NextFunction } from "express";
import { z, type ZodTypeAny, type ZodError } from "zod";
import {
  insertAttendanceSchema,
  insertAttendanceCategorySchema,
  insertEmployeeSchema,
  insertPayrollSchema,
  insertOvertimeSchema,
  insertAdvancePaymentSchema,
  insertPayrollAdjustmentSchema,
  insertLeaveSchema,
  insertCustomerSchema,
  insertVendorSchema,
  insertProjectSchema,
  insertProjectTaskSchema,
  insertPurchaseOrderSchema,
  insertInventorySchema,
  insertInventoryMovementSchema,
  insertExpenseSchema,
  insertExpenseCategorySchema,
  insertRevenueSchema,
  insertInvoiceSchema,
  insertDocumentSchema,
  insertRoleSchema,
  insertSettingsSchema,
  insertReminderSchema,
  insertLedgerSchema,
  insertLedgerTransactionSchema,
  insertWorkAllocationSchema,
} from "@workspace/db";

interface RouteSchema {
  path: string;
  method: string;
  body?: any;
  params?: any;
  query?: any;
}

const ROUTE_SCHEMAS: RouteSchema[] = [
  { method: "post", path: "/auth/login", body: z.object({ email: z.string().email(), password: z.string().min(1) }) },
  { method: "put", path: "/auth/me", body: z.object({ name: z.string().optional(), phone: z.string().optional(), avatar: z.string().optional() }) },
  { method: "post", path: "/auth/change-password", body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }) },

  { method: "post", path: "/employees", body: insertEmployeeSchema },
  { method: "put", path: "/employees/:id", params: z.object({ id: z.coerce.number() }), body: insertEmployeeSchema.partial() },
  { method: "post", path: "/employees/:id/salary-hikes", params: z.object({ id: z.coerce.number() }), body: z.object({ newSalary: z.coerce.number().gt(0), effectiveDate: z.string().optional(), reason: z.string().optional(), approvedBy: z.string().optional() }) },

  { method: "post", path: "/attendance", body: insertAttendanceSchema },
  { method: "put", path: "/attendance/:id", params: z.object({ id: z.coerce.number() }), body: insertAttendanceSchema.partial() },
  { method: "post", path: "/attendance-categories", body: insertAttendanceCategorySchema },
  { method: "put", path: "/attendance-categories/:id", params: z.object({ id: z.coerce.number() }), body: insertAttendanceCategorySchema.partial() },

  { method: "post", path: "/payroll", body: insertPayrollSchema },
  { method: "put", path: "/payroll/:id", params: z.object({ id: z.coerce.number() }), body: insertPayrollSchema.partial() },

  { method: "post", path: "/overtime", body: insertOvertimeSchema },
  { method: "put", path: "/overtime/:id", params: z.object({ id: z.coerce.number() }), body: insertOvertimeSchema.partial() },
  { method: "post", path: "/advance-payments", body: insertAdvancePaymentSchema },
  { method: "put", path: "/advance-payments/:id", params: z.object({ id: z.coerce.number() }), body: insertAdvancePaymentSchema.partial() },
  { method: "post", path: "/payroll-adjustments", body: insertPayrollAdjustmentSchema },

  { method: "post", path: "/leaves", body: insertLeaveSchema },
  { method: "put", path: "/leaves/:id", params: z.object({ id: z.coerce.number() }), body: insertLeaveSchema.partial() },

  { method: "post", path: "/customers", body: insertCustomerSchema },
  { method: "put", path: "/customers/:id", params: z.object({ id: z.coerce.number() }), body: insertCustomerSchema.partial() },

  { method: "post", path: "/vendors", body: insertVendorSchema },
  { method: "put", path: "/vendors/:id", params: z.object({ id: z.coerce.number() }), body: insertVendorSchema.partial() },

  { method: "post", path: "/projects", body: insertProjectSchema },
  { method: "put", path: "/projects/:id", params: z.object({ id: z.coerce.number() }), body: insertProjectSchema.partial() },
  { method: "post", path: "/projects/:id/tasks", params: z.object({ id: z.coerce.number() }), body: insertProjectTaskSchema },
  { method: "put", path: "/projects/:projectId/tasks/:taskId", params: z.object({ projectId: z.coerce.number(), taskId: z.coerce.number() }), body: insertProjectTaskSchema.partial() },

  { method: "post", path: "/purchase-orders", body: insertPurchaseOrderSchema },
  { method: "put", path: "/purchase-orders/:id", params: z.object({ id: z.coerce.number() }), body: insertPurchaseOrderSchema.partial() },

  { method: "post", path: "/inventory", body: insertInventorySchema },
  { method: "put", path: "/inventory/:id", params: z.object({ id: z.coerce.number() }), body: insertInventorySchema.partial() },
  { method: "post", path: "/inventory-movements", body: insertInventoryMovementSchema },

  { method: "post", path: "/expenses", body: insertExpenseSchema },
  { method: "put", path: "/expenses/:id", params: z.object({ id: z.coerce.number() }), body: insertExpenseSchema.partial() },
  { method: "post", path: "/expense-categories", body: insertExpenseCategorySchema },
  { method: "put", path: "/expense-categories/:id", params: z.object({ id: z.coerce.number() }), body: insertExpenseCategorySchema.partial() },

  { method: "post", path: "/revenue", body: insertRevenueSchema },
  { method: "put", path: "/revenue/:id", params: z.object({ id: z.coerce.number() }), body: insertRevenueSchema.partial() },

  { method: "post", path: "/invoices", body: insertInvoiceSchema },
  { method: "put", path: "/invoices/:id", params: z.object({ id: z.coerce.number() }), body: insertInvoiceSchema.partial() },

  { method: "post", path: "/documents", body: insertDocumentSchema },
  { method: "put", path: "/documents/:id", params: z.object({ id: z.coerce.number() }), body: insertDocumentSchema.partial() },

  { method: "post", path: "/roles", body: insertRoleSchema },
  { method: "put", path: "/roles/:id", params: z.object({ id: z.coerce.number() }), body: insertRoleSchema.partial() },

  { method: "put", path: "/settings", body: insertSettingsSchema },

  { method: "post", path: "/reminders", body: insertReminderSchema },
  { method: "put", path: "/reminders/:id", params: z.object({ id: z.coerce.number() }), body: insertReminderSchema.partial() },

  { method: "post", path: "/ledger", body: insertLedgerSchema },
  { method: "put", path: "/ledger/:id", params: z.object({ id: z.coerce.number() }), body: insertLedgerSchema.partial() },
  { method: "post", path: "/ledger/:id/transactions", params: z.object({ id: z.coerce.number() }), body: insertLedgerTransactionSchema },

  { method: "post", path: "/work-allocation", body: insertWorkAllocationSchema },
];

const PATH_CACHE = new Map<string, RegExp>();

function buildPathRegex(pathPattern: string) {
  if (PATH_CACHE.has(pathPattern)) return PATH_CACHE.get(pathPattern)!;
  const regex = new RegExp(`^${pathPattern.replace(/:[^/]+/g, "[^/]+")}$`);
  PATH_CACHE.set(pathPattern, regex);
  return regex;
}

function findRouteSchema(req: Request) {
  const method = req.method.toLowerCase();
  const path = req.path;

  return ROUTE_SCHEMAS.find((route) => route.method === method && buildPathRegex(route.path).test(path));
}

function createValidationErrorResponse(error: ZodError) {
  const issues = error.issues.map((issue: { path: (string | number)[]; message: string }) => ({ path: issue.path.join("."), message: issue.message }));
  return { error: "Validation failed", details: issues };
}

function validateStandardFormats(body: any) {
  const issues: Array<{ path: string; message: string }> = [];
  const validators: Record<string, z.ZodTypeAny> = {
    email: z.string().email(),
    phone: z.string().regex(/^\+?[0-9\s\-]{7,20}$/, "Invalid phone format"),
    panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, "Invalid PAN format"),
    aadharNumber: z.string().regex(/^[0-9]{12}$/, "Invalid Aadhar format"),
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, "Invalid IFSC code format"),
    joiningDate: z.string().refine((v: string) => !Number.isNaN(Date.parse(v)), "Invalid date format"),
    invoiceDate: z.string().refine((v: string) => !Number.isNaN(Date.parse(v)), "Invalid date format"),
    dueDate: z.string().refine((v: string) => !Number.isNaN(Date.parse(v)), "Invalid date format"),
  };

  for (const [key, validator] of Object.entries(validators)) {
    const value = body?.[key];
    if (value === undefined || value === null) continue;
    const result = validator.safeParse(value);
    if (!result.success) {
      issues.push({ path: key, message: result.error.issues.map((issue: { message: string }) => issue.message).join(", ") });
    }
  }

  return issues;
}

export function validateRequest(req: Request, res: Response, next: NextFunction) {
  const route = findRouteSchema(req);
  if (!route) return next();

  if (route.params) {
    const result = route.params.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json(createValidationErrorResponse(result.error));
    }
    req.params = result.data as any;
  }

  if (route.query) {
    const result = route.query.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json(createValidationErrorResponse(result.error));
    }
    req.query = result.data as any;
  }

  if (route.body) {
    const result = route.body.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(createValidationErrorResponse(result.error));
    }
    const body = result.data;
    const formatIssues = validateStandardFormats(body);
    if (formatIssues.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: formatIssues });
    }
    req.body = body;
  }

  return next();
}

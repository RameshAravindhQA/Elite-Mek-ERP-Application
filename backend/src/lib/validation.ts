import { type Request, type Response, type NextFunction } from "express";
import { z, type ZodTypeAny, type ZodError } from "zod";
import { insertAttendanceCategorySchema, insertAttendanceSchema } from "@workspace/db/schema/attendance";
import { insertEmployeeSchema } from "@workspace/db/schema/employees";
import { insertAdvancePaymentSchema, insertOvertimeSchema, insertPayrollAdjustmentSchema, insertPayrollSchema } from "@workspace/db/schema/payroll";
import { insertLeaveSchema } from "@workspace/db/schema/leaves";
import { insertCustomerSchema } from "@workspace/db/schema/customers";
import { insertVendorSchema } from "@workspace/db/schema/vendors";
import { insertProjectSchema, insertProjectTaskSchema } from "@workspace/db/schema/projects";
import { insertPurchaseOrderSchema } from "@workspace/db/schema/purchase_orders";
import { insertInventorySchema } from "@workspace/db/schema/inventory";
import { insertInventoryMovementSchema } from "@workspace/db/schema/inventory_movements";
import { insertExpenseCategorySchema, insertExpenseSchema } from "@workspace/db/schema/expenses";
import { insertRevenueSchema } from "@workspace/db/schema/revenue";
import { insertInvoiceSchema } from "@workspace/db/schema/invoices";
import { insertDocumentSchema } from "@workspace/db/schema/documents";
import { insertRoleSchema } from "@workspace/db/schema/roles";
import { insertSettingsSchema } from "@workspace/db/schema/settings";
import { insertReminderSchema } from "@workspace/db/schema/reminders";
import { insertLedgerSchema, insertLedgerTransactionSchema } from "@workspace/db/schema/ledger";
import { insertWorkAllocationSchema } from "@workspace/db/schema/work_allocations";

interface RouteSchema {
  path: string;
  method: string;
  body?: any;
  params?: any;
  query?: any;
  normalizeBody?: (body: any) => any;
}

const ROUTE_SCHEMAS: RouteSchema[] = [
  { method: "post", path: "/auth/login", body: z.object({ email: z.string().email(), password: z.string().min(1) }) },
  { method: "put", path: "/auth/me", body: z.object({ name: z.string().optional(), phone: z.string().optional(), avatar: z.string().optional() }) },
  { method: "post", path: "/auth/change-password", body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }) },

  { method: "post", path: "/employees", body: insertEmployeeSchema, normalizeBody: normalizeEmployeeBody },
  { method: "put", path: "/employees/:id", params: z.object({ id: z.coerce.number() }), body: insertEmployeeSchema.partial(), normalizeBody: normalizeEmployeeBody },
  { method: "post", path: "/employees/:id/salary-hikes", params: z.object({ id: z.coerce.number() }), body: z.object({ newSalary: z.coerce.number().gt(0), effectiveDate: z.string().optional(), reason: z.string().optional(), approvedBy: z.string().optional() }) },

  { method: "post", path: "/attendance", body: insertAttendanceSchema, normalizeBody: normalizeNumericBody(["hoursWorked"]) },
  { method: "put", path: "/attendance/:id", params: z.object({ id: z.coerce.number() }), body: insertAttendanceSchema.partial(), normalizeBody: normalizeNumericBody(["hoursWorked"]) },
  { method: "post", path: "/attendance-categories", body: insertAttendanceCategorySchema },
  { method: "put", path: "/attendance-categories/:id", params: z.object({ id: z.coerce.number() }), body: insertAttendanceCategorySchema.partial() },

  { method: "post", path: "/payroll", body: insertPayrollSchema, normalizeBody: normalizeNumericBody(["basicSalary", "hra", "allowances", "deductions", "overtimeHours", "overtimeAmount", "advanceDeduction", "bonusAmount", "otherPayments", "pf", "esic", "netSalary"]) },
  { method: "put", path: "/payroll/:id", params: z.object({ id: z.coerce.number() }), body: insertPayrollSchema.partial(), normalizeBody: normalizeNumericBody(["basicSalary", "hra", "allowances", "deductions", "overtimeHours", "overtimeAmount", "advanceDeduction", "bonusAmount", "otherPayments", "pf", "esic", "netSalary"]) },

  { method: "post", path: "/overtime", body: insertOvertimeSchema, normalizeBody: composeNormalizers(normalizeIdBody(["employeeId", "projectId"]), normalizeNumericBody(["hours", "basicSalary", "hourlyRate", "amount"])) },
  { method: "put", path: "/overtime/:id", params: z.object({ id: z.coerce.number() }), body: insertOvertimeSchema.partial(), normalizeBody: composeNormalizers(normalizeIdBody(["employeeId", "projectId"]), normalizeNumericBody(["hours", "basicSalary", "hourlyRate", "amount"])) },
  { method: "post", path: "/advance-payments", body: insertAdvancePaymentSchema, normalizeBody: composeNormalizers(normalizeIdBody(["employeeId"]), normalizeNumericBody(["amount"])) },
  { method: "put", path: "/advance-payments/:id", params: z.object({ id: z.coerce.number() }), body: insertAdvancePaymentSchema.partial(), normalizeBody: composeNormalizers(normalizeIdBody(["employeeId"]), normalizeNumericBody(["amount"])) },
  { method: "post", path: "/payroll-adjustments", body: insertPayrollAdjustmentSchema, normalizeBody: normalizeNumericBody(["amount"]) },

  { method: "post", path: "/leaves", body: insertLeaveSchema, normalizeBody: normalizeNumericBody(["days"]) },
  { method: "put", path: "/leaves/:id", params: z.object({ id: z.coerce.number() }), body: insertLeaveSchema.partial(), normalizeBody: normalizeNumericBody(["days"]) },

  { method: "post", path: "/customers", body: insertCustomerSchema, normalizeBody: normalizeNumericBody(["totalRevenue"]) },
  { method: "put", path: "/customers/:id", params: z.object({ id: z.coerce.number() }), body: insertCustomerSchema.partial(), normalizeBody: normalizeNumericBody(["totalRevenue"]) },

  { method: "post", path: "/vendors", body: insertVendorSchema },
  { method: "put", path: "/vendors/:id", params: z.object({ id: z.coerce.number() }), body: insertVendorSchema.partial() },

  { method: "post", path: "/projects", body: insertProjectSchema, normalizeBody: normalizeNumericBody(["budget", "spent"]) },
  { method: "put", path: "/projects/:id", params: z.object({ id: z.coerce.number() }), body: insertProjectSchema.partial(), normalizeBody: normalizeNumericBody(["budget", "spent"]) },
  { method: "post", path: "/projects/:id/tasks", params: z.object({ id: z.coerce.number() }), body: insertProjectTaskSchema },
  { method: "put", path: "/projects/:projectId/tasks/:taskId", params: z.object({ projectId: z.coerce.number(), taskId: z.coerce.number() }), body: insertProjectTaskSchema.partial() },

  { method: "post", path: "/purchase-orders", body: z.object({}).passthrough(), normalizeBody: normalizeNumericBody(["totalAmount"]) },
  { method: "put", path: "/purchase-orders/:id", params: z.object({ id: z.coerce.number() }), body: insertPurchaseOrderSchema.partial(), normalizeBody: normalizeNumericBody(["totalAmount"]) },

  { method: "post", path: "/inventory", body: insertInventorySchema, normalizeBody: normalizeNumericBody(["quantity", "reorderLevel", "costPrice", "sellingPrice"]) },
  { method: "put", path: "/inventory/:id", params: z.object({ id: z.coerce.number() }), body: insertInventorySchema.partial(), normalizeBody: normalizeNumericBody(["quantity", "reorderLevel", "costPrice", "sellingPrice"]) },
  { method: "post", path: "/inventory-movements", body: insertInventoryMovementSchema, normalizeBody: normalizeNumericBody(["quantity", "previousStock", "currentStock"]) },

  { method: "post", path: "/expenses", body: insertExpenseSchema, normalizeBody: normalizeNumericBody(["amount"]) },
  { method: "put", path: "/expenses/:id", params: z.object({ id: z.coerce.number() }), body: insertExpenseSchema.partial(), normalizeBody: normalizeNumericBody(["amount"]) },
  { method: "post", path: "/expense-categories", body: insertExpenseCategorySchema },
  { method: "put", path: "/expense-categories/:id", params: z.object({ id: z.coerce.number() }), body: insertExpenseCategorySchema.partial() },

  { method: "post", path: "/revenue", body: insertRevenueSchema, normalizeBody: normalizeNumericBody(["amount"]) },
  { method: "put", path: "/revenue/:id", params: z.object({ id: z.coerce.number() }), body: insertRevenueSchema.partial(), normalizeBody: normalizeNumericBody(["amount"]) },

  { method: "post", path: "/invoices", body: z.object({}).passthrough(), normalizeBody: normalizeNumericBody(["subtotal", "taxAmount", "totalAmount", "paidAmount"]) },
  { method: "put", path: "/invoices/:id", params: z.object({ id: z.coerce.number() }), body: insertInvoiceSchema.partial(), normalizeBody: normalizeNumericBody(["subtotal", "taxAmount", "totalAmount", "paidAmount"]) },

  { method: "post", path: "/documents", body: insertDocumentSchema },
  { method: "put", path: "/documents/:id", params: z.object({ id: z.coerce.number() }), body: insertDocumentSchema.partial() },

  { method: "post", path: "/roles", body: insertRoleSchema },
  { method: "put", path: "/roles/:id", params: z.object({ id: z.coerce.number() }), body: insertRoleSchema.partial() },

  { method: "put", path: "/settings", body: insertSettingsSchema },

  { method: "post", path: "/reminders", body: insertReminderSchema, normalizeBody: normalizeReminderBody },
  { method: "put", path: "/reminders/:id", params: z.object({ id: z.coerce.number() }), body: insertReminderSchema.partial(), normalizeBody: normalizeReminderBody },

  { method: "post", path: "/ledger", body: insertLedgerSchema.partial({ startDate: true }), normalizeBody: normalizeNumericBody(["openingBalance", "closingBalance", "currentBalance"]) },
  { method: "put", path: "/ledger/:id", params: z.object({ id: z.coerce.number() }), body: insertLedgerSchema.partial(), normalizeBody: normalizeNumericBody(["openingBalance", "closingBalance", "currentBalance"]) },
  { method: "post", path: "/ledger/:id/transactions", params: z.object({ id: z.coerce.number() }), body: insertLedgerTransactionSchema, normalizeBody: normalizeNumericBody(["debit", "credit"]) },

  { method: "post", path: "/work-allocation", body: z.object({ projectId: z.coerce.number().int().positive(), employeeIds: z.array(z.coerce.number().int().positive()).default([]) }) },
];

const PATH_CACHE = new Map<string, RegExp>();

function buildPathRegex(pathPattern: string) {
  if (PATH_CACHE.has(pathPattern)) return PATH_CACHE.get(pathPattern)!;
  const regex = new RegExp(`^${pathPattern.replace(/:([^/]+)/g, (_match, name) => `(?<${name}>[^/]+)`)}$`);
  PATH_CACHE.set(pathPattern, regex);
  return regex;
}

function findRouteSchema(req: Request) {
  const method = req.method.toLowerCase();
  const path = req.path;

  for (const route of ROUTE_SCHEMAS) {
    if (route.method !== method) continue;
    const match = buildPathRegex(route.path).exec(path);
    if (match) return { route, pathParams: match.groups || {} };
  }
  return null;
}

function createValidationErrorResponse(error: ZodError) {
  const issues = error.issues.map((issue: { path: (string | number)[]; message: string; code?: string }) => {
    const field = issue.path.join(".");
    return { field, path: field, message: issue.message, type: issue.code };
  });
  return { error: "Validation failed", details: issues };
}

function normalizeNumericBody(fields: string[]) {
  return (body: any) => {
    if (!body || typeof body !== "object") return body;

    const normalized = { ...body };
    for (const field of fields) {
      if (normalized[field] === "" || normalized[field] === null) {
        normalized[field] = undefined;
        continue;
      }

      if (typeof normalized[field] === "number") {
        normalized[field] = String(normalized[field]);
      }
    }

    return normalized;
  };
}

function normalizeIdBody(fields: string[]) {
  return (body: any) => {
    if (!body || typeof body !== "object") return body;

    const normalized = { ...body };
    for (const field of fields) {
      if (normalized[field] === "" || normalized[field] === null || normalized[field] === undefined || normalized[field] === "none") {
        normalized[field] = undefined;
        continue;
      }
      if (typeof normalized[field] === "string" && normalized[field].trim() !== "") {
        normalized[field] = Number(normalized[field]);
      }
    }
    return normalized;
  };
}

function composeNormalizers(...normalizers: Array<(body: any) => any>) {
  return (body: any) => normalizers.reduce((current, normalize) => normalize(current), body);
}

function normalizeReminderBody(body: any) {
  if (!body || typeof body !== "object") return body;
  const normalized = { ...body };
  if (typeof normalized.remindAt === "string") {
    const parsed = new Date(normalized.remindAt);
    if (!Number.isNaN(parsed.getTime())) normalized.remindAt = parsed;
  }
  return normalized;
}

function normalizeEmployeeBody(body: any) {
  if (!body || typeof body !== "object") return body;

  const normalized = { ...body };
  const optionalTextFields = [
    "phone",
    "panNumber",
    "aadharNumber",
    "bankAccount",
    "bankName",
    "ifscCode",
    "address",
    "emergencyContact",
    "imageUrl",
    "salaryFormula",
  ];

  for (const field of optionalTextFields) {
    if (normalized[field] === "") normalized[field] = undefined;
  }

  Object.assign(normalized, normalizeNumericBody(["salary", "basicPercent", "hraPercent", "allowancesPercent"])(normalized));

  if (typeof normalized.email === "string") normalized.email = normalized.email.trim().toLowerCase();
  if (typeof normalized.employeeId === "string") normalized.employeeId = normalized.employeeId.trim();
  if (typeof normalized.panNumber === "string") normalized.panNumber = normalized.panNumber.trim().toUpperCase();
  if (typeof normalized.ifscCode === "string") normalized.ifscCode = normalized.ifscCode.trim().toUpperCase();

  return normalized;
}

function validateStandardFormats(body: any) {
  const issues: Array<{ path: string; message: string }> = [];
  const validators: Record<string, z.ZodTypeAny> = {
    email: z.string().email().toLowerCase(),
    phone: z.string().regex(/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/, "Invalid phone format (use format: 9876543210 or +919876543210)"),
    panNumber: z.string().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format (use format: ABCDE1234F)"),
    gstNumber: z.string().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GST number format"),
    aadharNumber: z.string().regex(/^[0-9]{12}$/, "Invalid Aadhar format (must be 12 digits)"),
    ifscCode: z.string().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format (use format: SBIN0001234)"),
    joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD, e.g., 2025-06-14)"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (use YYYY-MM-DD)"),
  };

  for (const [key, validator] of Object.entries(validators)) {
    const value = body?.[key];
    if (value === undefined || value === null) continue;
    const result = validator.safeParse(value);
    if (!result.success) {
      issues.push({ path: key, message: result.error.issues.map((issue: { message: string }) => issue.message).join(", ") });
    }
  }

  const requiredTextFields = ["firstName", "lastName", "employeeId", "name", "sku", "title", "category", "designation", "department"];
  for (const key of requiredTextFields) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key) && typeof body[key] === "string" && body[key].trim() === "") {
      issues.push({ path: key, message: `${key} is required` });
    }
  }

  const numericFields = [
    "amount", "allowances", "basicSalary", "budget", "costPrice", "credit", "debit", "deductions", "hours",
    "hoursWorked", "netSalary", "paidAmount", "previousStock", "currentStock", "quantity", "reorderLevel",
    "salary", "sellingPrice", "spent", "subtotal", "taxAmount", "totalAmount", "unitPrice",
    "days", "hra", "totalRevenue", "openingBalance", "closingBalance", "currentBalance",
  ];
  for (const key of numericFields) {
    if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      issues.push({ path: key, message: `${key} must be a valid number` });
    } else if (numericValue < 0) {
      issues.push({ path: key, message: `${key} cannot be negative` });
    }
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, "tags") && !Array.isArray(body.tags)) {
    issues.push({ path: "tags", message: "tags must be an array" });
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, "permissions")) {
    if (!Array.isArray(body.permissions)) {
      issues.push({ path: "permissions", message: "permissions must be an array" });
    } else {
      body.permissions.forEach((permission: any, index: number) => {
        if (!permission || typeof permission !== "object") {
          issues.push({ path: `permissions.${index}`, message: "permission must be an object" });
          return;
        }
        if (typeof permission.module !== "string" || permission.module.trim() === "") {
          issues.push({ path: `permissions.${index}.module`, message: "permission module is required" });
        }
        if (!Array.isArray(permission.actions)) {
          issues.push({ path: `permissions.${index}.actions`, message: "permission actions must be an array" });
        }
      });
    }
  }

  return issues;
}

export function validateRequest(req: Request, res: Response, next: NextFunction) {
  const matched = findRouteSchema(req);
  if (!matched) return next();
  const { route, pathParams } = matched;

  if (route.params) {
    const result = route.params.safeParse(pathParams);
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
    const requestBody = route.normalizeBody ? route.normalizeBody(req.body) : req.body;
    const result = route.body.safeParse(requestBody);
    if (!result.success) {
      return res.status(400).json(createValidationErrorResponse(result.error));
    }
    const body = result.data;
    const formatIssues = validateStandardFormats(body);
    if (formatIssues.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        details: formatIssues.map((issue) => ({ ...issue, field: issue.path, type: "invalid_format" })),
      });
    }
    req.body = body;
  }

  return next();
}

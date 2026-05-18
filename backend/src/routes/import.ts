import { Router } from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { db, attendanceTable, customersTable, documentsTable, employeesTable, expenseCategoriesTable, expensesTable, invoicesTable, inventoryMovementsTable, inventoryTable, leavesTable, payrollTable, projectsTable, purchaseOrdersTable, revenueTable, rolesTable, settingsTable, vendorsTable } from "@workspace/db";
import { inArray, or } from "@workspace/db/drizzle";

import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const upload = multer({
  dest: process.env.VERCEL ? path.join(os.tmpdir(), "uploads") : "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
        file.mimetype === "application/vnd.ms-excel" ||
        file.mimetype === "text/csv") {
      cb(null, true);
    } else {
      cb(new Error("Only Excel or CSV files allowed"), false);
    }
  },
});

const router = Router();

const jsonFields = new Set(["items", "dependencies", "additionalContent", "tags", "permissions"]);
const numericFields = new Set([
  "vendorId", "customerId", "projectId", "employeeId", "itemId", "quantity", "reorderLevel", "costPrice",
  "sellingPrice", "amount", "salary", "budget", "spent", "progress", "subtotal", "taxAmount",
  "totalAmount", "paidAmount", "basicSalary", "hra", "allowances", "deductions", "pf", "esic",
  "netSalary", "presentDays", "absentDays", "totalWorkingDays", "hoursWorked", "days",
  "previousStock", "currentStock", "parentId", "smtpPort", "payslipDefaultWorkingDays",
]);
const dateFields = new Set([
  "joiningDate", "startDate", "endDate", "orderDate", "deliveryDate", "date", "issueDate",
  "dueDate", "paidAt",
]);
const booleanFields = new Set(["isDefault", "payslipWhatsappEnabled", "payslipIncludeLeaveDetails"]);
const nullableNumericFields = new Set(["projectId", "parentId", "smtpPort"]);
const requiredFieldsByModule: Record<string, Set<string>> = {
  employees: new Set(["employeeId", "firstName", "lastName", "email", "department", "designation", "salary", "joiningDate"]),
};

type ImportValidationError = {
  row?: number;
  field?: string;
  message: string;
  expected?: string;
  value?: unknown;
};

class ImportValidationException extends Error {
  validationErrors: ImportValidationError[];
  expectedHeaders: string[];
  receivedHeaders: string[];

  constructor(message: string, validationErrors: ImportValidationError[], expectedHeaders: string[], receivedHeaders: string[]) {
    super(message);
    this.validationErrors = validationErrors;
    this.expectedHeaders = expectedHeaders;
    this.receivedHeaders = receivedHeaders;
  }
}

function normalizeTemplateValue(value: unknown) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value);
  }
  return value;
}

function parseMaybeJson(value: unknown, field: string) {
  if (!jsonFields.has(field)) return value;
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return JSON.parse(value);
  } catch {
    if (field === "tags") return value.split(",").map(item => item.trim()).filter(Boolean);
    throw new Error(`${field} must be valid JSON`);
  }
}

function expectedDataType(field: string, sample: unknown) {
  if (jsonFields.has(field)) return "JSON array/object";
  if (numericFields.has(field)) return "Number";
  if (dateFields.has(field)) return "Date (YYYY-MM-DD)";
  if (booleanFields.has(field)) return "Boolean (true/false)";
  if (Array.isArray(sample) || (sample && typeof sample === "object")) return "JSON";
  return "Text";
}

function isRequiredField(moduleName: string, field: string, template: Record<string, unknown>) {
  const moduleRequired = requiredFieldsByModule[moduleName];
  if (moduleRequired) return moduleRequired.has(field);
  return !nullableNumericFields.has(field) && template[field] !== "";
}

function isNumericField(moduleName: string, field: string) {
  if (moduleName === "employees" && field === "employeeId") return false;
  return numericFields.has(field);
}

function normalizeDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return value;
}

function validateHeaders(moduleName: string, rows: Record<string, any>[]) {
  const expectedHeaders = Object.keys(templates[moduleName] || {});
  const receivedHeaders = Array.from(new Set(rows.flatMap(row => Object.keys(row).filter(key => String(key).trim()))));
  const unexpectedHeaders = receivedHeaders.filter(header => !expectedHeaders.includes(header));
  const missingHeaders = expectedHeaders.filter(header => isRequiredField(moduleName, header, templates[moduleName]) && !receivedHeaders.includes(header));
  const validationErrors: ImportValidationError[] = [];

  if (unexpectedHeaders.length) {
    validationErrors.push({
      message: `Remove unsupported header(s): ${unexpectedHeaders.join(", ")}`,
      expected: expectedHeaders.join(", "),
      value: unexpectedHeaders.join(", "),
    });
  }

  if (missingHeaders.length) {
    validationErrors.push({
      message: `Add missing header(s): ${missingHeaders.join(", ")}`,
      expected: expectedHeaders.join(", "),
      value: receivedHeaders.join(", "),
    });
  }

  if (validationErrors.length) {
    throw new ImportValidationException("Sheet headers do not match the import template", validationErrors, expectedHeaders, receivedHeaders);
  }

  return { expectedHeaders, receivedHeaders };
}

function normalizeImportRow(moduleName: string, row: Record<string, any>, rowNumber: number) {
  const normalized: Record<string, any> = {};
  const validationErrors: ImportValidationError[] = [];
  const templateKeys = Object.keys(templates[moduleName] || {});
  for (const key of templateKeys) {
    if (row[key] === undefined || row[key] === "") continue;
    let value: unknown;
    try {
      value = parseMaybeJson(row[key], key);
    } catch {
      validationErrors.push({ row: rowNumber, field: key, message: `${key} must be valid JSON`, expected: expectedDataType(key, templates[moduleName][key]), value: row[key] });
      continue;
    }
    if (isNumericField(moduleName, key)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        validationErrors.push({ row: rowNumber, field: key, message: `${key} must be a valid number`, expected: "Number", value: row[key] });
        continue;
      }
      value = parsed;
    }
    if (dateFields.has(key)) {
      value = normalizeDateValue(value);
    }
    if (dateFields.has(key) && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      validationErrors.push({ row: rowNumber, field: key, message: `${key} must use YYYY-MM-DD format`, expected: "Date (YYYY-MM-DD)", value: row[key] });
      continue;
    }
    if (booleanFields.has(key) && typeof value === "string") {
      if (!/^(true|false)$/i.test(value.trim())) {
        validationErrors.push({ row: rowNumber, field: key, message: `${key} must be true or false`, expected: "Boolean (true/false)", value: row[key] });
        continue;
      }
      value = value.trim().toLowerCase() === "true";
    }
    if (key === "projectId" && value !== undefined && value !== null) {
      value = String(value);
    }
    normalized[key] = value;
  }

  if ((moduleName === "invoices" || moduleName === "purchase-orders" || moduleName === "purchase_orders") && !Array.isArray(normalized.items)) {
    validationErrors.push({ row: rowNumber, field: "items", message: "items must be a valid JSON array", expected: "JSON array", value: row.items });
  }

  for (const key of templateKeys) {
    if (nullableNumericFields.has(key)) continue;
    if (isRequiredField(moduleName, key, templates[moduleName]) && normalized[key] === undefined) {
      validationErrors.push({ row: rowNumber, field: key, message: `${key} is required`, expected: expectedDataType(key, templates[moduleName][key]), value: row[key] });
    }
  }

  if (moduleName === "employees" && !normalized.status) {
    normalized.status = "active";
  }

  if (validationErrors.length) {
    const expectedHeaders = Object.keys(templates[moduleName] || {});
    throw new ImportValidationException("Sheet data has validation errors", validationErrors, expectedHeaders, Object.keys(row));
  }

  return normalized;
}

async function validateRowsBeforeInsert(moduleName: string, rows: Record<string, any>[]) {
  if (moduleName !== "employees") return;

  const validationErrors: ImportValidationError[] = [];
  const seenEmployeeIds = new Map<string, number>();
  const seenEmails = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const employeeId = String(row.employeeId || "").trim();
    const email = String(row.email || "").trim().toLowerCase();

    if (employeeId) {
      const previousRow = seenEmployeeIds.get(employeeId);
      if (previousRow) {
        validationErrors.push({ row: rowNumber, field: "employeeId", message: `Employee ID duplicates row ${previousRow}`, expected: "Unique employee ID", value: employeeId });
      } else {
        seenEmployeeIds.set(employeeId, rowNumber);
      }
    }

    if (email) {
      const previousRow = seenEmails.get(email);
      if (previousRow) {
        validationErrors.push({ row: rowNumber, field: "email", message: `Email duplicates row ${previousRow}`, expected: "Unique email", value: email });
      } else {
        seenEmails.set(email, rowNumber);
      }
    }
  });

  const employeeIds = Array.from(seenEmployeeIds.keys());
  const emails = Array.from(seenEmails.keys());
  if (employeeIds.length || emails.length) {
    const conditions = [
      employeeIds.length ? inArray(employeesTable.employeeId, employeeIds) : undefined,
      emails.length ? inArray(employeesTable.email, emails) : undefined,
    ].filter(Boolean) as any[];
    const existing = await db.select({
      employeeId: employeesTable.employeeId,
      email: employeesTable.email,
    }).from(employeesTable).where(or(...conditions));

    existing.forEach((row) => {
      const employeeRow = row.employeeId ? seenEmployeeIds.get(row.employeeId) : undefined;
      if (employeeRow) {
        validationErrors.push({ row: employeeRow, field: "employeeId", message: "Employee ID already exists", expected: "Unique employee ID", value: row.employeeId });
      }
      const emailRow = row.email ? seenEmails.get(row.email.toLowerCase()) : undefined;
      if (emailRow) {
        validationErrors.push({ row: emailRow, field: "email", message: "Email already exists", expected: "Unique email", value: row.email });
      }
    });
  }

  if (validationErrors.length) {
    throw new ImportValidationException("Sheet data has validation errors", validationErrors, Object.keys(templates[moduleName] || {}), Object.keys(rows[0] || {}));
  }
}

const templates: Record<string, any> = {
  employees: {
    employeeId: "EMP031",
    firstName: "Aaryan",
    lastName: "Kumar",
    email: "aaryan.kumar@example.com",
    phone: "+91 9999999999",
    department: "Engineering",
    designation: "Design Engineer",
    status: "active",
    salary: "65000",
    joiningDate: "2024-05-01",
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop",
    panNumber: "ABCDE1234F",
    aadharNumber: "123456789012",
    bankAccount: "50200012345999",
    bankName: "HDFC Bank",
    ifscCode: "HDFC0001234",
    address: "Plot No. 12, Industrial Area",
    emergencyContact: "+91 9999999998",
  },
  customers: {
    name: "ABC Engineering Pvt Ltd",
    email: "procurement@abcengineering.com",
    phone: "+91 9876543210",
    company: "ABC Engineering Pvt Ltd",
    address: "Plot No. 20, Sector 18, Noida",
    gstNumber: "09ABCDE1234F1Z5",
    panNumber: "ABCDE1234F",
    status: "active",
    imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=150&h=150&fit=crop",
  },
  vendors: {
    name: "Speedy Supplies",
    email: "orders@speedysupplies.com",
    phone: "+91 8045678901",
    company: "Speedy Supplies Pvt Ltd",
    gstNumber: "27ABCDE1234F1Z2",
    panNumber: "ABCDE1234F",
    category: "Raw Materials",
    status: "active",
    imageUrl: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=200&h=200&fit=crop",
  },
  projects: {
    name: "Mumbai Plant Piping",
    description: "Detailed engineering and installation of piping network.",
    status: "active",
    priority: "high",
    budget: "4200000",
    spent: "1200000",
    startDate: "2024-06-01",
    endDate: "2025-05-31",
    progress: 28,
    imageUrl: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=200&h=200&fit=crop",
  },
  "purchase-orders": {
    poNumber: "PO-2024-031",
    customerId: 1,
    projectId: 1,
    status: "approved",
    orderDate: "2024-06-10",
    deliveryDate: "2024-06-30",
    totalAmount: "98000",
    items: [{ id: 1, itemName: "MS Plate", quantity: 50, unitPrice: 1800, total: 90000 }],
    notes: "Urgent delivery required.",
  },
  purchase_orders: {
    poNumber: "PO-2024-031",
    customerId: 1,
    projectId: 1,
    status: "approved",
    orderDate: "2024-06-10",
    deliveryDate: "2024-06-30",
    totalAmount: "98000",
    items: [{ id: 1, itemName: "MS Plate", quantity: 50, unitPrice: 1800, total: 90000 }],
    notes: "Urgent delivery required.",
  },
  inventory: {
    sku: "STL-030",
    name: "MS Angle 65x65x6",
    category: "Raw Material",
    quantity: "150",
    unit: "kg",
    reorderLevel: "30",
    costPrice: "320",
    sellingPrice: "410",
    location: "Warehouse A-12",
    description: "Mild steel angle section 65x65x6mm",
    imageUrl: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=200&h=200&fit=crop",
  },
  expenses: {
    title: "Workshop consumables purchase",
    category: "Office Supplies",
    amount: "15000",
    date: "2024-06-12",
    status: "pending",
    description: "Purchase of workshop stationery and small tools.",
    submittedBy: "Rahul Sharma",
  },
  revenue: {
    title: "Project Engineering Advance",
    source: "Project Revenue",
    amount: "420000",
    date: "2024-06-15",
    customerId: 1,
    projectId: 1,
    description: "Advance received for project work.",
  },
  invoices: {
    invoiceNumber: "INV-2024-031",
    customerId: 1,
    projectId: 1,
    status: "sent",
    issueDate: "2024-06-10",
    dueDate: "2024-07-10",
    subtotal: "320000",
    taxAmount: "57600",
    totalAmount: "377600",
    paidAmount: "0",
    items: [{ id: 1, description: "Engineering design service", quantity: 1, unitPrice: 320000, taxRate: 18, total: 377600 }],
  },
  documents: {
    title: "Project Handover Report",
    fileUrl: "https://example.com/files/project-handover-report.pdf",
    fileType: "pdf",
    fileSize: "1.2MB",
    tags: ["handover", "project"],
    uploadedBy: "Priya Verma",
  },
  attendance: {
    employeeId: 1,
    date: "2024-06-12",
    checkIn: "09:00",
    checkOut: "18:00",
    status: "present",
    hoursWorked: "9",
    markedBy: "HR Admin",
  },
  payroll: {
    employeeId: 1,
    month: "2024-05",
    basicSalary: "42000",
    hra: "14000",
    allowances: "14000",
    deductions: "5600",
    pf: "5040",
    esic: "315",
    netSalary: "45400",
    status: "paid",
    presentDays: 24,
    absentDays: 2,
    totalWorkingDays: 26,
    formula: "basic",
    paidAt: "2024-06-05",
  },
  leaves: {
    employeeId: 1,
    leaveType: "Sick Leave",
    startDate: "2024-06-18",
    endDate: "2024-06-20",
    days: "3",
    reason: "Medical checkup",
    status: "approved",
    approvedBy: "Priya Verma",
  },
  roles: {
    name: "Data Importer",
    description: "Permissions to import bulk data",
    isDefault: false,
    permissions: [{ module: "employees", actions: ["view", "create", "edit"] }],
  },
  settings: {
    companyName: "Demo Corp",
    companyAddress: "123 Demo Lane",
    companyPhone: "+91 9000000000",
    companyEmail: "demo@example.com",
    companyWebsite: "www.democorp.com",
    currency: "INR",
    timezone: "Asia/Kolkata",
  },
  "inventory-movements": {
    itemId: 1,
    type: "IN",
    quantity: "25",
    previousStock: "100",
    currentStock: "125",
    reference: "GRN-2024-031",
    notes: "Stock received from supplier",
    createdBy: "Warehouse Admin",
  },
  inventory_movements: {
    itemId: 1,
    type: "IN",
    quantity: "25",
    previousStock: "100",
    currentStock: "125",
    reference: "GRN-2024-031",
    notes: "Stock received from supplier",
    createdBy: "Warehouse Admin",
  },
  "expense-categories": {
    name: "Office Supplies",
    parentId: "",
    description: "Stationery, printing, and office consumables",
    color: "#6B7280",
  },
};

const tables: Record<string, any> = {
  employees: employeesTable,
  customers: customersTable,
  vendors: vendorsTable,
  projects: projectsTable,
  "purchase-orders": purchaseOrdersTable,
  purchase_orders: purchaseOrdersTable,
  inventory: inventoryTable,
  expenses: expensesTable,
  revenue: revenueTable,
  invoices: invoicesTable,
  documents: documentsTable,
  attendance: attendanceTable,
  payroll: payrollTable,
  leaves: leavesTable,
  roles: rolesTable,
  settings: settingsTable,
  "inventory-movements": inventoryMovementsTable,
  inventory_movements: inventoryMovementsTable,
  "expense-categories": expenseCategoriesTable,
};

router.get("/import/modules", requireAuth, (_req, res) => {
  res.json({ modules: Object.keys(tables).sort() });
});

router.get("/import/:module/template", requireAuth, async (req, res) => {
  const moduleName = String(req.params.module);
  const template = templates[moduleName];

  if (!template) {
    res.status(404).json({ error: "Template not found for module" });
    return;
  }

  // Generate Excel template: header + 3 example rows
  const headers = Object.keys(template);
  const exampleData = [
    { ...template },
    { ...template },
    { ...template }
  ].map(row => {
    const cleanRow: Record<string, unknown> = {};
    headers.forEach(key => cleanRow[key] = normalizeTemplateValue(row[key]));
    return cleanRow;
  });

  const ws = XLSX.utils.json_to_sheet(exampleData);
  const guideRows = headers.map(header => ({
    Header: header,
    "Data Type": expectedDataType(header, template[header]),
    "Example Value": normalizeTemplateValue(template[header]),
    Required: isRequiredField(moduleName, header, template) ? "Yes" : "No",
  }));
  const guide = XLSX.utils.json_to_sheet(guideRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.utils.book_append_sheet(wb, guide, "Field Guide");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename=template-${moduleName}.xlsx`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

router.post("/import/:module", requireAuth, upload.single('file'), async (req, res) => {
  const moduleName = String(req.params.module);
  const table = tables[moduleName];
  const file = (req as any).file;

  if (!table) {
    if (file) await fs.unlink(file.path).catch(() => undefined);
    res.status(404).json({ error: "Import module not supported" });
    return;
  }

  let rows: any[] = [];

  if (file) {
    try {
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
      // Cleanup temp file
      await fs.unlink(file.path);
    } catch (parseErr) {
      res.status(400).json({ error: "Invalid Excel/CSV file", details: (parseErr as Error).message });
      return;
    }
  } else {
    // Fallback JSON
    rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "No valid rows found in file or body" });
    return;
  }

  // Basic validation - keys match template
  try {
    validateHeaders(moduleName, rows);
    rows = rows.map((row, index) => normalizeImportRow(moduleName, row, index + 2)).filter(row => Object.keys(row).length > 0);
    await validateRowsBeforeInsert(moduleName, rows);
  } catch (validationErr) {
    if (validationErr instanceof ImportValidationException) {
      res.status(400).json({
        error: validationErr.message,
        validationErrors: validationErr.validationErrors,
        expectedHeaders: validationErr.expectedHeaders,
        receivedHeaders: validationErr.receivedHeaders,
      });
      return;
    }
    res.status(400).json({ error: (validationErr as Error).message });
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({ error: "No valid data matching schema" });
    return;
  }

  try {
    const inserted = await db.insert(table).values(rows).returning() as any[];
    await createAuditLog({
      module: moduleName,
      action: "import",
      recordId: inserted.length ? Number((inserted[0] as any).id || 0) : 0,
      userId: req.user!.id,
      userName: req.user!.name,
      description: `Imported ${inserted.length} rows into ${moduleName}`,
      newValues: { rows },
    });

    res.status(201).json({ imported: inserted.length, rows: inserted });
  } catch (err) {
    req.log.error({ err }, "Import failed");
    res.status(500).json({ error: "Import failed", details: (err as Error).message });
  }
});

export default router;

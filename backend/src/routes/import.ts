import { Router } from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";
import { db, attendanceTable, customersTable, documentsTable, employeesTable, expenseCategoriesTable, expensesTable, invoicesTable, inventoryMovementsTable, inventoryTable, leavesTable, payrollTable, projectsTable, purchaseOrdersTable, revenueTable, rolesTable, settingsTable, vendorsTable } from "@workspace/db";

import { requireAuth } from "../middlewares/auth.js";
import { createAuditLog } from "../lib/audit.js";

const upload = multer({
  dest: "uploads/",
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
  "vendorId", "customerId", "projectId", "employeeId", "quantity", "reorderLevel", "costPrice",
  "sellingPrice", "amount", "salary", "budget", "spent", "progress", "subtotal", "taxAmount",
  "totalAmount", "paidAmount", "basicSalary", "hra", "allowances", "deductions", "pf", "esic",
  "netSalary", "presentDays", "absentDays", "totalWorkingDays", "hoursWorked", "days",
]);

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
    return value.split(",").map(item => item.trim()).filter(Boolean);
  }
}

function normalizeImportRow(moduleName: string, row: Record<string, any>) {
  const normalized: Record<string, any> = {};
  const templateKeys = Object.keys(templates[moduleName] || {});
  for (const key of templateKeys) {
    if (row[key] === undefined || row[key] === "") continue;
    let value = parseMaybeJson(row[key], key);
    if (numericFields.has(key)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${key} must be a valid number`);
      value = parsed;
    }
    if (key === "projectId" && value !== undefined && value !== null) {
      value = String(value);
    }
    normalized[key] = value;
  }

  if ((moduleName === "invoices" || moduleName === "purchase-orders" || moduleName === "purchase_orders") && !Array.isArray(normalized.items)) {
    throw new Error("items must be a valid JSON array");
  }

  return normalized;
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
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face",
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
    { ...template, [`_${moduleName}2`]: 'Example Row 2' }, // Differentiate
    { ...template, [`_${moduleName}3`]: 'Example Row 3' }
  ].map(row => {
    const cleanRow: Record<string, unknown> = {};
    headers.forEach(key => cleanRow[key] = normalizeTemplateValue(row[key]));
    return cleanRow;
  });

  const ws = XLSX.utils.json_to_sheet(exampleData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");

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
    rows = rows.map(row => normalizeImportRow(moduleName, row)).filter(row => Object.keys(row).length > 0);
  } catch (validationErr) {
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

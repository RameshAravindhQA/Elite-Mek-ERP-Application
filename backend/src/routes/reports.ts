import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db/schema/employees";
import { attendanceTable } from "@workspace/db/schema/attendance";
import { advancePaymentsTable, overtimeTable, payrollTable } from "@workspace/db/schema/payroll";
import { expensesTable } from "@workspace/db/schema/expenses";
import { revenueTable } from "@workspace/db/schema/revenue";
import { invoicesTable } from "@workspace/db/schema/invoices";
import { purchaseOrdersTable } from "@workspace/db/schema/purchase_orders";
import { inventoryTable } from "@workspace/db/schema/inventory";
import { leavesTable } from "@workspace/db/schema/leaves";
import { projectsTable } from "@workspace/db/schema/projects";
import { customersTable } from "@workspace/db/schema/customers";
import { vendorsTable } from "@workspace/db/schema/vendors";
import { settingsTable } from "@workspace/db/schema/settings";
import { desc, count, sql, eq, gte, lte, and, ilike, or } from "@workspace/db/drizzle";
import PDFDocument from "pdfkit";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const sanitizeHexColor = (value: unknown, fallback = "#1D4ED8") => (
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
);

const normalizeLines = (...values: unknown[]) => values
  .flatMap((value) => String(value || "").split(/\r?\n/))
  .map((line) => line.trim())
  .filter(Boolean);

const buildCompanyDetails = (settings: any, bodyDetails?: string) => normalizeLines(
  settings.companyAddress,
  [settings.companyPhone, settings.companyPhone2].filter(Boolean).join(" | "),
  [settings.companyEmail, settings.companyWebsite].filter(Boolean).join(" | "),
  settings.gstNumber ? `GST: ${settings.gstNumber}` : "",
  settings.panNumber ? `PAN: ${settings.panNumber}` : "",
  bodyDetails,
);

const loadLogoImage = async (logoUrl?: string | null) => {
  if (!logoUrl) return null;
  const trimmed = logoUrl.trim();
  if (!trimmed) return null;

  const dataMatch = trimmed.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (dataMatch) return Buffer.from(dataMatch[2], "base64");

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const response: any = await fetch(trimmed);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !/^image\/(png|jpe?g)/i.test(contentType)) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  return null;
};

const drawGeneratedEliteMekLogo = (doc: PDFKit.PDFDocument, x: number, y: number) => {
  doc.roundedRect(x, y, 88, 36, 6).fill("#0F172A");
  doc.roundedRect(x + 6, y + 6, 24, 24, 4).fill("#F97316");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7).text("EM", x + 10, y + 14, { width: 16, align: "center" });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12).text("Elite", x + 36, y + 7, { width: 46 });
  doc.fillColor("#CBD5E1").font("Helvetica").fontSize(8).text("Mek", x + 36, y + 21, { width: 46 });
};

const drawReportHeader = async (doc: PDFKit.PDFDocument, title: string, settings: any, body: any, tableHeaderColor: string) => {
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const right = doc.page.width - doc.page.margins.right;
  const logoWidth = 96;
  const logoX = right - logoWidth;

  doc.rect(0, 0, doc.page.width, 7).fill(tableHeaderColor);

  const logoSource = await loadLogoImage(settings.companyLogo || body.companyLogo);
  if (logoSource) {
    try {
      doc.image(logoSource, logoX, top, { fit: [logoWidth, 42], align: "right" });
    } catch {
      drawGeneratedEliteMekLogo(doc, logoX + 6, top);
    }
  } else {
    drawGeneratedEliteMekLogo(doc, logoX + 6, top);
  }

  const companyName = settings.companyName || body.companyName || "Elite Mek";
  const details = buildCompanyDetails(settings, body.companyDetails);
  doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(16).text(companyName, left, top, {
    width: logoX - left - 16,
    lineGap: 1,
  });
  if (details.length) {
    doc.moveDown(0.18);
    doc.fillColor("#475569").font("Helvetica").fontSize(8.5).text(details.join("\n"), {
      width: logoX - left - 16,
      lineGap: 1.2,
    });
  }

  const headerBottom = Math.max(doc.y, top + 48) + 12;
  doc.strokeColor("#E2E8F0").lineWidth(0.8).moveTo(left, headerBottom).lineTo(right, headerBottom).stroke();
  doc.y = headerBottom + 12;

  doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(15).text(title, left, doc.y, { width: right - left });
  doc.moveDown(0.2);
  doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(
    `Generated: ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
    left,
    doc.y,
  );
  doc.moveDown(0.25);
};

const measureRowHeight = (doc: PDFKit.PDFDocument, headers: string[], row: Record<string, unknown>, widths: number[]) => {
  const cellHeights = headers.map((header, index) => {
    const value = String(row[header] ?? "");
    return doc.heightOfString(value || "-", { width: widths[index] - 10, lineGap: 1.1 });
  });
  return Math.max(22, Math.min(72, Math.max(...cellHeights) + 10));
};

const drawTableHeader = (doc: PDFKit.PDFDocument, headers: string[], widths: number[], x: number, y: number, tableWidth: number, headerColor: string) => {
  doc.rect(x, y, tableWidth, 24).fill(headerColor);
  let cursorX = x;
  headers.forEach((header, index) => {
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8).text(header, cursorX + 5, y + 7, {
      width: widths[index] - 10,
      height: 12,
      ellipsis: true,
    });
    cursorX += widths[index];
  });
  return y + 24;
};

const buildColumnWidths = (headers: string[], tableWidth: number) => {
  const weights = headers.map((header) => {
    const normalized = header.toLowerCase();
    if (/(date|time)/.test(normalized)) return 1.2;
    if (/(description|notes|address|reference|item|customer|project|employee)/.test(normalized)) return 1.55;
    if (/(quantity|stock|amount|total|price|status|type|code)/.test(normalized)) return 0.9;
    return 1;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (tableWidth * weight) / total);
};

const drawRowsTable = (doc: PDFKit.PDFDocument, headers: string[], rows: Record<string, unknown>[], headerColor: string) => {
  const left = doc.page.margins.left;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = buildColumnWidths(headers, tableWidth);
  const bottom = doc.page.height - doc.page.margins.bottom;
  let y = doc.y + 8;

  y = drawTableHeader(doc, headers, widths, left, y, tableWidth, headerColor);

  rows.forEach((row, rowIndex) => {
    doc.font("Helvetica").fontSize(7.2);
    const rowHeight = measureRowHeight(doc, headers, row, widths);
    if (y + rowHeight > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawTableHeader(doc, headers, widths, left, y, tableWidth, headerColor);
    }

    doc.rect(left, y, tableWidth, rowHeight).fill(rowIndex % 2 === 0 ? "#F8FAFC" : "#FFFFFF");
    doc.strokeColor("#E2E8F0").lineWidth(0.4).moveTo(left, y + rowHeight).lineTo(left + tableWidth, y + rowHeight).stroke();

    let cursorX = left;
    headers.forEach((header, colIndex) => {
      const value = String(row[header] ?? "") || "-";
      doc.fillColor("#111827").font("Helvetica").fontSize(7.2).text(value, cursorX + 5, y + 5, {
        width: widths[colIndex] - 10,
        height: rowHeight - 8,
        lineGap: 1.1,
        ellipsis: true,
      });
      cursorX += widths[colIndex];
    });

    y += rowHeight;
  });

  doc.y = y + 12;
};

router.get("/reports/summary", requireAuth, async (req: any, res: any) => {
  try {
    const [empStats] = await db.select({ total: count(), active: sql<number>`count(*) filter (where status = 'active')` }).from(employeesTable);
    const [payStats] = await db.select({ totalPaid: sql<number>`sum(net_salary) filter (where status = 'paid')`, pending: sql<number>`sum(net_salary) filter (where status = 'pending')` }).from(payrollTable);
    const [expStats] = await db.select({ total: sql<number>`sum(amount)`, pending: sql<number>`sum(amount) filter (where status = 'pending')` }).from(expensesTable);
    const [revStats] = await db.select({ total: sql<number>`sum(amount)` }).from(revenueTable);
    const [invStats] = await db.select({ total: count(), value: sql<number>`sum(quantity * cost_price)` }).from(inventoryTable);
    const [projStats] = await db.select({ total: count(), active: sql<number>`count(*) filter (where status = 'active')` }).from(projectsTable);
    
    res.json({
      employees: { total: Number(empStats.total), active: Number(empStats.active) },
      payroll: { totalPaid: Number(payStats.totalPaid) || 0, pending: Number(payStats.pending) || 0 },
      expenses: { total: Number(expStats.total) || 0, pending: Number(expStats.pending) || 0 },
      revenue: { total: Number(revStats.total) || 0 },
      inventory: { total: Number(invStats.total), value: Number(invStats.value) || 0 },
      projects: { total: Number(projStats.total), active: Number(projStats.active) },
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/employees", requireAuth, async (req: any, res: any) => {
  try {
    const byDept = await db.select({ department: employeesTable.department, count: count(), avgSalary: sql<number>`avg(salary::numeric)` }).from(employeesTable).groupBy(employeesTable.department);
    const byStatus = await db.select({ status: employeesTable.status, count: count() }).from(employeesTable).groupBy(employeesTable.status);
    const employees = await db.select().from(employeesTable).orderBy(desc(employeesTable.createdAt), desc(employeesTable.id));
    res.json({ byDepartment: byDept.map(d => ({ ...d, count: Number(d.count), avgSalary: Number(d.avgSalary) || 0 })), byStatus: byStatus.map(s => ({ ...s, count: Number(s.count) })), data: employees.map(e => ({ ...e, salary: Number(e.salary) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/payroll", requireAuth, async (req: any, res: any) => {
  try {
    const month = req.query.month as string;
    const byMonth = await db.select({ month: payrollTable.month, total: sql<number>`sum(net_salary)`, count: count() }).from(payrollTable).groupBy(payrollTable.month).orderBy(payrollTable.month);
    const data = await db.select({ pay: payrollTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, department: employeesTable.department } })
      .from(payrollTable).leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id)).orderBy(desc(payrollTable.createdAt), desc(payrollTable.id));
    res.json({ byMonth: byMonth.map(m => ({ month: m.month, total: Number(m.total) || 0, count: Number(m.count) })), data: data.map(r => ({ ...r.pay, employeeName: r.emp ? `${r.emp.firstName} ${r.emp.lastName}` : "Unknown", department: r.emp?.department, basicSalary: Number(r.pay.basicSalary), netSalary: Number(r.pay.netSalary) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/attendance", requireAuth, async (req: any, res: any) => {
  try {
    const month = req.query.month as string || new Date().toISOString().slice(0, 7);
    const byStatus = await db.select({ status: attendanceTable.status, count: count() }).from(attendanceTable).groupBy(attendanceTable.status);
    const byEmployee = await db.select({
      employeeId: attendanceTable.employeeId,
      present: sql<number>`count(*) filter (where ${attendanceTable.status} = 'present')`,
      absent: sql<number>`count(*) filter (where ${attendanceTable.status} = 'absent')`,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
    })
      .from(attendanceTable).leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id)).groupBy(attendanceTable.employeeId, employeesTable.firstName, employeesTable.lastName);
    res.json({ byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count) })), byEmployee: byEmployee.map(e => ({ employeeId: e.employeeId, employeeName: `${e.firstName || ""} ${e.lastName || ""}`.trim(), present: Number(e.present), absent: Number(e.absent) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/expenses", requireAuth, async (req: any, res: any) => {
  try {
    const byCategory = await db.select({ category: expensesTable.category, total: sql<number>`sum(amount)`, count: count() }).from(expensesTable).groupBy(expensesTable.category);
    const byMonth = await db.select({ month: sql<string>`to_char(date::date, 'YYYY-MM')`, total: sql<number>`sum(amount)` }).from(expensesTable).groupBy(sql`to_char(date::date, 'YYYY-MM')`).orderBy(sql`to_char(date::date, 'YYYY-MM')`);
    const data = await db.select().from(expensesTable).orderBy(expensesTable.date, expensesTable.id);
    res.json({ byCategory: byCategory.map(c => ({ category: c.category, total: Number(c.total), count: Number(c.count) })), byMonth: byMonth.map(m => ({ month: m.month, total: Number(m.total) })), data: data.map(e => ({ ...e, amount: Number(e.amount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/revenue", requireAuth, async (req: any, res: any) => {
  try {
    const bySource = await db.select({ source: revenueTable.source, total: sql<number>`sum(amount)`, count: count() }).from(revenueTable).groupBy(revenueTable.source);
    const byMonth = await db.select({ month: sql<string>`to_char(date::date, 'YYYY-MM')`, total: sql<number>`sum(amount)` }).from(revenueTable).groupBy(sql`to_char(date::date, 'YYYY-MM')`).orderBy(sql`to_char(date::date, 'YYYY-MM')`);
    const data = await db.select().from(revenueTable).orderBy(revenueTable.date, revenueTable.id);
    res.json({ bySource: bySource.map(s => ({ source: s.source, total: Number(s.total), count: Number(s.count) })), byMonth: byMonth.map(m => ({ month: m.month, total: Number(m.total) })), data: data.map(r => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/inventory", requireAuth, async (req: any, res: any) => {
  try {
    const byCategory = await db.select({ category: inventoryTable.category, count: count(), value: sql<number>`sum(quantity::numeric * cost_price::numeric)` }).from(inventoryTable).groupBy(inventoryTable.category);
    const lowStock = await db.select().from(inventoryTable).where(sql`quantity::numeric <= reorder_level::numeric`);
    const data = await db.select().from(inventoryTable).orderBy(inventoryTable.name, inventoryTable.id);
    res.json({ byCategory: byCategory.map(c => ({ category: c.category, count: Number(c.count), value: Number(c.value) || 0 })), lowStock: lowStock.map(i => ({ ...i, quantity: Number(i.quantity), reorderLevel: Number(i.reorderLevel), costPrice: Number(i.costPrice), sellingPrice: Number(i.sellingPrice) })), data: data.map(i => ({ ...i, quantity: Number(i.quantity), reorderLevel: Number(i.reorderLevel), costPrice: Number(i.costPrice), sellingPrice: Number(i.sellingPrice) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/projects", requireAuth, async (req: any, res: any) => {
  try {
    const byStatus = await db.select({ status: projectsTable.status, count: count(), budget: sql<number>`sum(budget::numeric)`, spent: sql<number>`sum(spent::numeric)` }).from(projectsTable).groupBy(projectsTable.status);
    const data = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt), desc(projectsTable.id));
    res.json({ byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count), budget: Number(s.budget) || 0, spent: Number(s.spent) || 0 })), data: data.map(p => ({ ...p, budget: p.budget ? Number(p.budget) : 0, spent: Number(p.spent) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/invoices", requireAuth, async (req: any, res: any) => {
  try {
    const byStatus = await db.select({ status: invoicesTable.status, count: count(), total: sql<number>`sum(total_amount)` }).from(invoicesTable).groupBy(invoicesTable.status);
    const data = await db.select({ inv: invoicesTable, cust: { name: customersTable.name } }).from(invoicesTable).leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id)).orderBy(desc(invoicesTable.createdAt), desc(invoicesTable.id));
    res.json({ byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count), total: Number(s.total) || 0 })), data: data.map(r => ({ ...r.inv, customerName: r.cust?.name || "Unknown", totalAmount: Number(r.inv.totalAmount), paidAmount: Number(r.inv.paidAmount) })) });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/overtime", requireAuth, async (req: any, res: any) => {
  try {
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;
    const search = String(req.query.search || "");
    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(overtimeTable.employeeId, employeeId));
    if (projectId) conditions.push(eq(overtimeTable.projectId, projectId));
    if (fromDate) conditions.push(gte(overtimeTable.workDate, fromDate));
    if (toDate) conditions.push(lte(overtimeTable.workDate, toDate));
    if (search) conditions.push(or(ilike(sql<string>`concat(${employeesTable.firstName}, ' ', ${employeesTable.lastName})`, `%${search}%`), ilike(projectsTable.name, `%${search}%`)));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const byProject = await db.select({ projectId: overtimeTable.projectId, projectName: projectsTable.name, hours: sql<number>`sum(${overtimeTable.hours}::numeric)`, amount: sql<number>`sum(${overtimeTable.amount}::numeric)` })
      .from(overtimeTable).leftJoin(projectsTable, eq(overtimeTable.projectId, projectsTable.id)).where(whereClause).groupBy(overtimeTable.projectId, projectsTable.name);
    const byEmployee = await db.select({ employeeId: overtimeTable.employeeId, firstName: employeesTable.firstName, lastName: employeesTable.lastName, hours: sql<number>`sum(${overtimeTable.hours}::numeric)`, amount: sql<number>`sum(${overtimeTable.amount}::numeric)` })
      .from(overtimeTable).leftJoin(employeesTable, eq(overtimeTable.employeeId, employeesTable.id)).where(whereClause).groupBy(overtimeTable.employeeId, employeesTable.firstName, employeesTable.lastName);
    const data = await db.select({ ot: overtimeTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId }, project: { name: projectsTable.name } })
      .from(overtimeTable).leftJoin(employeesTable, eq(overtimeTable.employeeId, employeesTable.id)).leftJoin(projectsTable, eq(overtimeTable.projectId, projectsTable.id)).where(whereClause).orderBy(desc(overtimeTable.workDate), desc(overtimeTable.id));
    res.json({
      byProject: byProject.map(row => ({ projectId: row.projectId, projectName: row.projectName || "No project", hours: Number(row.hours || 0), amount: Number(row.amount || 0) })),
      byEmployee: byEmployee.map(row => ({ employeeId: row.employeeId, employeeName: `${row.firstName || ""} ${row.lastName || ""}`.trim(), hours: Number(row.hours || 0), amount: Number(row.amount || 0) })),
      data: data.map(row => ({ ...row.ot, employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown", employeeCode: row.emp?.employeeId, projectName: row.project?.name || "No project", hours: Number(row.ot.hours), amount: Number(row.ot.amount), hourlyRate: Number(row.ot.hourlyRate) })),
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/reports/advance-payments", requireAuth, async (req: any, res: any) => {
  try {
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    const month = req.query.month as string;
    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(advancePaymentsTable.employeeId, employeeId));
    if (month) conditions.push(eq(advancePaymentsTable.deductionMonth, month));
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const byEmployee = await db.select({ employeeId: advancePaymentsTable.employeeId, firstName: employeesTable.firstName, lastName: employeesTable.lastName, amount: sql<number>`sum(${advancePaymentsTable.amount}::numeric)`, count: count() })
      .from(advancePaymentsTable).leftJoin(employeesTable, eq(advancePaymentsTable.employeeId, employeesTable.id)).where(whereClause).groupBy(advancePaymentsTable.employeeId, employeesTable.firstName, employeesTable.lastName);
    const data = await db.select({ adv: advancePaymentsTable, emp: { firstName: employeesTable.firstName, lastName: employeesTable.lastName, employeeId: employeesTable.employeeId } })
      .from(advancePaymentsTable).leftJoin(employeesTable, eq(advancePaymentsTable.employeeId, employeesTable.id)).where(whereClause).orderBy(desc(advancePaymentsTable.paymentDate), desc(advancePaymentsTable.id));
    res.json({
      byEmployee: byEmployee.map(row => ({ employeeId: row.employeeId, employeeName: `${row.firstName || ""} ${row.lastName || ""}`.trim(), amount: Number(row.amount || 0), count: Number(row.count) })),
      data: data.map(row => ({ ...row.adv, employeeName: row.emp ? `${row.emp.firstName} ${row.emp.lastName}` : "Unknown", employeeCode: row.emp?.employeeId, amount: Number(row.adv.amount) })),
    });
  } catch (err) { req.log.error({ err }); res.status(500).json({ error: "Internal server error" }); }
});

// PDF Download endpoint for reports
router.post("/reports/generate-pdf", requireAuth, async (req: any, res: any) => {
  try {
    const { title, headers, rows } = req.body;

    if (!title || !headers || !Array.isArray(rows)) {
      res.status(400).json({ error: "Missing required fields: title, headers, rows" });
      return;
    }

    const reportHeaders = headers as string[];
    const reportRows = rows as Record<string, unknown>[];
    const [settings] = await db.select().from(settingsTable).limit(1);
    const tableHeaderColor = sanitizeHexColor(req.body.tableHeaderColor || settings?.themeColor, "#1D4ED8");
    const isWide = reportHeaders.length > 6;

    const doc = new PDFDocument({
      size: "A4",
      layout: isWide ? "landscape" : "portrait",
      margin: 32,
      bufferPages: true,
      autoFirstPage: false,
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${title.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pdf"`);

    doc.pipe(res);

    doc.addPage();
    await drawReportHeader(doc, String(title), settings || {}, req.body, tableHeaderColor);
    doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(`Records: ${reportRows.length} | Columns: ${reportHeaders.length}`);
    drawRowsTable(doc, reportHeaders, reportRows, tableHeaderColor);

    doc.end();
  } catch (err) { 
    req.log.error({ err }); 
    res.status(500).json({ error: "Failed to generate PDF" }); 
  }
});

export default router;

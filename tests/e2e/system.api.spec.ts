import { expect, test } from "@playwright/test";
import XLSX from "xlsx";
import { authHeaders, getFirstRecord, login } from "./helpers";

const listEndpoints = [
  "/api/employees",
  "/api/attendance",
  "/api/payroll",
  "/api/overtime",
  "/api/advance-payments",
  "/api/leaves",
  "/api/customers",
  "/api/invoices",
  "/api/revenue",
  "/api/ledger",
  "/api/vendors",
  "/api/purchase-orders",
  "/api/projects",
  "/api/inventory",
  "/api/inventory-movements",
  "/api/expenses",
  "/api/documents",
  "/api/work-allocation/all",
  "/api/audit-logs",
];

test.describe("production API smoke", () => {
  test("authenticates admin and validates every major list endpoint", async ({ request }) => {
    const headers = await authHeaders(request);

    for (const path of listEndpoints) {
      const response = await request.get(path, { headers });
      expect(response, `GET ${path}`).toBeOK();
      const body = await response.json();
      expect(body, `${path} should return a JSON object`).toBeTruthy();
    }
  });

  test("overtime CRUD works and writes audit logs", async ({ request }) => {
    const headers = await authHeaders(request);
    const employee = await getFirstRecord<{ id: number }>(request, "/api/employees?limit=1&status=active", headers);
    const project = await getFirstRecord<{ id: number }>(request, "/api/projects?limit=1", headers);
    const stamp = Date.now();

    const create = await request.post("/api/overtime", {
      headers,
      data: {
        employeeId: employee.id,
        projectId: project.id,
        workDate: "2026-05-17",
        hours: 1.5,
        proofUrl: "",
        notes: `playwright overtime ${stamp}`,
      },
    });
    expect(create).toBeOK();
    const created = await create.json();

    const update = await request.put(`/api/overtime/${created.id}`, {
      headers,
      data: { hours: 2, notes: `playwright overtime updated ${stamp}` },
    });
    expect(update).toBeOK();

    const audit = await request.get(`/api/audit-logs?module=overtime&recordId=${created.id}`, { headers });
    expect(audit).toBeOK();
    const auditRows = (await audit.json()).data;
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows.some((row: any) => row.oldValues || row.newValues)).toBe(true);
    expect(auditRows.some((row: any) => row.newValues?.hours === 2 || row.newValues?.notes?.includes("updated"))).toBe(true);

    const remove = await request.delete(`/api/overtime/${created.id}`, { headers });
    expect(remove.status()).toBe(204);
  });

  test("advance payments CRUD works and writes audit logs", async ({ request }) => {
    const headers = await authHeaders(request);
    const employee = await getFirstRecord<{ id: number }>(request, "/api/employees?limit=1&status=active", headers);
    const stamp = Date.now();

    const create = await request.post("/api/advance-payments", {
      headers,
      data: {
        employeeId: employee.id,
        paymentDate: "2026-05-17",
        deductionMonth: "2026-05",
        amount: 1234,
        status: "pending",
        paymentMode: "Cash",
        referenceNo: `PW-${stamp}`,
        notes: "playwright advance",
      },
    });
    expect(create).toBeOK();
    const created = await create.json();

    const update = await request.put(`/api/advance-payments/${created.id}`, {
      headers,
      data: { amount: 1500, status: "deducted" },
    });
    expect(update).toBeOK();

    const audit = await request.get(`/api/audit-logs?module=advance_payments&recordId=${created.id}`, { headers });
    expect(audit).toBeOK();
    const auditRows = (await audit.json()).data;
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows.some((row: any) => row.oldValues || row.newValues)).toBe(true);
    expect(auditRows.some((row: any) => row.newValues?.amount === 1500 || row.newValues?.status === "deducted")).toBe(true);

    const remove = await request.delete(`/api/advance-payments/${created.id}`, { headers });
    expect(remove.status()).toBe(204);
  });

  test("work allocation save works and is auditable", async ({ request }) => {
    const headers = await authHeaders(request);
    const project = await getFirstRecord<{ id: number }>(request, "/api/projects?limit=1", headers);
    const employee = await getFirstRecord<{ id: number }>(request, "/api/employees?limit=1&status=active", headers);

    const original = await request.get(`/api/work-allocation?projectId=${project.id}`, { headers });
    expect(original).toBeOK();
    const originalIds = ((await original.json()).employeeIds || []) as number[];

    const save = await request.post("/api/work-allocation", {
      headers,
      data: { projectId: project.id, employeeIds: Array.from(new Set([...originalIds, employee.id])) },
    });
    expect(save).toBeOK();
    expect((await save.json()).employeeIds).toContain(employee.id);

    const audit = await request.get(`/api/audit-logs?module=work_allocation&recordId=${project.id}`, { headers });
    expect(audit).toBeOK();
    const auditRows = (await audit.json()).data;
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows.some((row: any) => row.newValues?.employeeIds?.includes(employee.id))).toBe(true);

    const restore = await request.post("/api/work-allocation", {
      headers,
      data: { projectId: project.id, employeeIds: originalIds },
    });
    expect(restore).toBeOK();
  });

  test("ledger project endpoint exposes invoices and purchase orders", async ({ request }) => {
    const headers = await authHeaders(request);
    const projects = await request.get("/api/projects?limit=20", { headers });
    expect(projects).toBeOK();
    const projectRows = (await projects.json()).data || [];
    expect(projectRows.length).toBeGreaterThan(0);

    let ledger: any = null;
    for (const project of projectRows) {
      const response = await request.get(`/api/ledger/projects/${project.id}`, { headers });
      expect(response).toBeOK();
      const body = await response.json();
      if ((body.invoices?.length || 0) > 0 || (body.purchaseOrders?.length || 0) > 0) {
        ledger = body;
        break;
      }
    }

    expect(ledger, "at least one seeded project should have invoice or PO ledger rows").toBeTruthy();
    expect(Array.isArray(ledger.invoices)).toBe(true);
    expect(Array.isArray(ledger.purchaseOrders)).toBe(true);
    expect(ledger.summary).toEqual(expect.objectContaining({
      invoiceCount: expect.any(Number),
      purchaseOrderCount: expect.any(Number),
    }));
  });

  test("login rejects invalid credentials", async ({ request }) => {
    await login(request);
    const response = await request.post("/api/auth/login", {
      data: { email: "admin@elitemek.com", password: "definitely-wrong" },
    });
    expect(response.status()).toBe(401);
  });

  test("all advertised import modules provide strict templates and row-level validation errors", async ({ request }) => {
    const headers = await authHeaders(request);
    const modulesResponse = await request.get("/api/import/modules", { headers });
    expect(modulesResponse).toBeOK();
    const modules = ((await modulesResponse.json()).modules || []) as string[];
    expect(modules.length).toBeGreaterThan(0);

    for (const moduleName of modules) {
      const templateResponse = await request.get(`/api/import/${moduleName}/template`, { headers });
      expect(templateResponse, `${moduleName} template should download`).toBeOK();
      const workbook = XLSX.read(await templateResponse.body(), { type: "buffer" });
      expect(workbook.SheetNames, `${moduleName} should include the import sheet`).toContain("Template");
      expect(workbook.SheetNames, `${moduleName} should include the datatype guide`).toContain("Field Guide");

      const templateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Template);
      const guideRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Field Guide"]);
      expect(templateRows.length, `${moduleName} should include example rows`).toBeGreaterThanOrEqual(1);
      expect(guideRows.length, `${moduleName} should document headers`).toBe(Object.keys(templateRows[0]).length);
      expect(Object.keys(guideRows[0])).toEqual(expect.arrayContaining(["Header", "Data Type", "Example Value", "Required"]));
    }

    const badWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(badWorkbook, XLSX.utils.json_to_sheet([{ wrongHeader: "abc", salary: "not-a-number" }]), "Template");
    const badBuffer = XLSX.write(badWorkbook, { type: "buffer", bookType: "xlsx" });

    const failedImport = await request.post("/api/import/employees", {
      headers,
      multipart: {
        file: {
          name: "bad-employees.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: badBuffer,
        },
      },
    });
    expect(failedImport.status()).toBe(400);
    const payload = await failedImport.json();
    expect(payload.error).toMatch(/headers/i);
    expect(payload.expectedHeaders).toContain("employeeId");
    expect(payload.receivedHeaders).toContain("wrongHeader");
    expect(payload.validationErrors.length).toBeGreaterThan(0);
  });
});

import { expect, test } from "@playwright/test";
import { authenticatePage, dismissStartupDialogs } from "./helpers";

const moduleRoutes = [
  { path: "/", title: /dashboard/i },
  { path: "/employees", title: /employees/i },
  { path: "/attendance", title: /attendance/i },
  { path: "/payroll", title: /payroll/i },
  { path: "/overtime", title: /overtime records/i },
  { path: "/advance-payments", title: /advance payments/i },
  { path: "/leaves", title: /leaves/i },
  { path: "/work-allocation", title: /work allocation/i },
  { path: "/customers", title: /customers/i },
  { path: "/invoices", title: /invoices/i },
  { path: "/revenue", title: /revenue/i },
  { path: "/ledger", title: /invoice ledger/i },
  { path: "/vendors", title: /vendors/i },
  { path: "/purchase-orders", title: /purchase orders/i },
  { path: "/projects", title: /projects/i },
  { path: "/inventory", title: /inventory/i },
  { path: "/inventory-movements", title: /inventory movements|movements/i },
  { path: "/expenses", title: /expenses/i },
  { path: "/documents", title: /documents/i },
  { path: "/audit-logs", title: /audit logs/i },
  { path: "/roles", title: /roles/i },
  { path: "/settings", title: /settings/i },
  { path: "/reminders", title: /reminders/i },
  { path: "/reports", title: /reports/i },
];

test.describe("production browser smoke", () => {
  test.beforeEach(async ({ page, request }) => {
    await authenticatePage(page, request);
  });

  for (const route of moduleRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });

      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await dismissStartupDialogs(page);

      await expect(page.getByText(route.title).first(), `${route.path} should render its page title`).toBeVisible();
      await expect(page.getByText(/not found/i)).toHaveCount(0);
      expect(errors.filter((error) => !/favicon|ResizeObserver|Failed to load resource/i.test(error))).toEqual([]);
    });
  }

  test("opens overtime and advance audit dialogs from row actions when records exist", async ({ page }) => {
    await page.goto("/overtime");
    await page.waitForLoadState("networkidle");
    await dismissStartupDialogs(page);
    const overtimeAudit = page.locator("tbody button").first();
    if (await overtimeAudit.isVisible().catch(() => false)) {
      await overtimeAudit.click();
      await expect(page.getByText(/audit history/i)).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await page.goto("/advance-payments");
    await page.waitForLoadState("networkidle");
    await dismissStartupDialogs(page);
    const advanceAudit = page.locator("tbody button").first();
    if (await advanceAudit.isVisible().catch(() => false)) {
      await advanceAudit.click();
      await expect(page.getByText(/audit history/i)).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("opens ledger invoice or PO detail dialog when rows exist", async ({ page }) => {
    await page.goto("/ledger");
    await page.waitForLoadState("networkidle");
    await dismissStartupDialogs(page);

    const customerSelect = page.locator('[role="combobox"]').first();
    await expect(customerSelect).toBeVisible();
    await customerSelect.click();
    const firstCustomer = page.getByRole("option").first();
    if (await firstCustomer.isVisible().catch(() => false)) {
      await firstCustomer.click();
    }

    const projectSelect = page.locator('[role="combobox"]').nth(1);
    await expect(projectSelect).toBeVisible();
    await projectSelect.click();
    const firstOption = page.getByRole("option").first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click();
    }
    await page.waitForLoadState("networkidle");

    const detailButton = page.locator("tbody button").first();
    if (await detailButton.isVisible().catch(() => false)) {
      await detailButton.click();
      await expect(page.getByText(/invoice |purchase order /i).first()).toBeVisible();
    }
  });
});

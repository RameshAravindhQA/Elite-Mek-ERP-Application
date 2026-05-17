import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.API_TEST_EMAIL || "admin@elitemek.com";
export const ADMIN_PASSWORD = process.env.API_TEST_PASSWORD || "admin123";

export async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(response, "admin login should succeed; seed or repair admin user if this fails").toBeOK();
  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body as { token: string; user: { id: number; email: string; role: string } };
}

export async function authHeaders(request: APIRequestContext) {
  const { token } = await login(request);
  return { Authorization: `Bearer ${token}` };
}

export async function authenticatePage(page: Page, request: APIRequestContext) {
  const { token, user } = await login(request);
  await page.addInitScript((authToken) => {
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem("token", authToken);
    window.sessionStorage.setItem("show-welcome-after-login", "false");
    window.sessionStorage.setItem("welcome-shown-1-" + today, "1");
    window.sessionStorage.setItem("welcome-shown-admin@elitemek.com-" + today, "1");
    window.sessionStorage.setItem("welcome-shown-Administrator-" + today, "1");
  }, token);
  await page.addInitScript(({ id, email, name }) => {
    const today = new Date().toISOString().slice(0, 10);
    for (const value of [id, email, name]) {
      if (value) window.sessionStorage.setItem(`welcome-shown-${value}-${today}`, "1");
    }
  }, { id: user.id, email: user.email, name: (user as any).name });
}

export async function dismissStartupDialogs(page: Page) {
  for (const label of [/start work/i, /dismiss/i, /close/i]) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
    }
  }
  await page.keyboard.press("Escape").catch(() => undefined);
}

export async function getFirstRecord<T extends { id: number }>(request: APIRequestContext, path: string, headers: Record<string, string>) {
  const response = await request.get(path, { headers });
  expect(response, `GET ${path}`).toBeOK();
  const body = await response.json();
  const first = body.data?.[0] as T | undefined;
  expect(first, `${path} should return at least one seeded record`).toBeTruthy();
  return first!;
}

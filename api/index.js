let appPromise;

async function loadApp() {
  try {
    return (await import("../backend/api/vercel.mjs")).default;
  } catch {
    return (await import("../backend/dist/app.mjs")).default;
  }
}

export default async function handler(req, res) {
  appPromise ??= loadApp();
  const app = await appPromise;
  return app(req, res);
}

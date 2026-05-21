import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app = express();

// pino-http's types may export a namespace object under certain resolutions.
// Cast it to a callable middleware type so TypeScript accepts the call.
const pinoHttpMiddleware = (pinoHttp as unknown as (opts?: any) => any);

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) {
    return callback(null, true);
  }

  // Production domain
  if (origin === "https://elite-mek-erp-system.vercel.app") {
    return callback(null, true);
  }

  // Dynamic frontend URLs from env
  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    const allowedOrigins = frontendUrl
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
  }

  // Pattern: elite-mek-erp-system-*.vercel.app (Vercel preview deployments)
  if (/^https:\/\/elite-mek-erp-system-[a-zA-Z0-9]+\.vercel\.app$/.test(origin)) {
    return callback(null, true);
  }

  // Localhost for local development
  if (origin.startsWith("http://localhost:")) {
    return callback(null, true);
  }

  // Reject other origins
  logger.warn({ origin }, "CORS request from unauthorized origin");
  return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
}

app.use(
  pinoHttpMiddleware({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.get("/", (_req, res) => {
  res.json({
    message: "Elite MEK ERP API is running",
    status: "ok",
  });
});

app.use("/api", router);

export default app;

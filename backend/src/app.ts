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

  // Allow configured origins from env var
  const frontendUrl = process.env.FRONTEND_URL || "https://elite-mek-erp-system.vercel.app";
  const allowedOrigins = frontendUrl
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  // Allow all Vercel preview/staging URLs for development
  if (origin.includes(".vercel.app")) {
    return callback(null, true);
  }

  // Allow localhost for local development
  if (origin.includes("localhost")) {
    return callback(null, true);
  }

  return callback(new Error(`CORS origin denied: ${origin}`));
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

import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app = express();
const frontendUrl = process.env.FRONTEND_URL || "https://elite-mek-erp-system.vercel.app";

// pino-http's types may export a namespace object under certain resolutions.
// Cast it to a callable middleware type so TypeScript accepts the call.
const pinoHttpMiddleware = (pinoHttp as unknown as (opts?: any) => any);

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
    origin: frontendUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

export default app;

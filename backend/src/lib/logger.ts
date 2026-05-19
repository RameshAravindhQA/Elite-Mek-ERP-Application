import pino from "pino";
import fs from "node:fs";
import path from "node:path";

const isProduction = process.env.NODE_ENV === "production";
const isServerless = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const resolveLogDir = () => {
  if (isServerless) {
    return null;
  }

  const configured = process.env.LOG_DIR;
  const candidates = [
    configured ? path.resolve(configured) : null,
    path.resolve(process.cwd(), "..", "logs"),
    path.resolve(process.cwd(), "logs"),
    path.resolve("/tmp", "erp-logs"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      // Try the next writable location.
    }
  }

  return null;
};

const logDir = resolveLogDir();
const logFile = logDir ? path.join(logDir, `system-${new Date().toISOString().slice(0, 10)}.jsonl`) : null;
const baseOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "headers.authorization",
    "headers.cookie",
    "password",
    "token",
  ],
};

export const logger = logFile
  ? pino(
      baseOptions,
      pino.multistream([
        { stream: pino.destination({ dest: 1, sync: false }) },
        { stream: pino.destination({ dest: logFile, mkdir: true, sync: false }) },
      ]),
    )
  : pino(
      {
        ...baseOptions,
        ...(isProduction
          ? {}
          : {
              transport: {
                target: "pino-pretty",
                options: { colorize: true },
              },
            }),
      },
    );

export const systemLogFile = logFile;

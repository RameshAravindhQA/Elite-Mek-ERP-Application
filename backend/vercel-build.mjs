import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVercel } from "./build.mjs";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(artifactDir, ".vercel", "output");
const functionDir = path.join(outputDir, "functions", "index.func");

async function build() {
  await buildVercel();
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(functionDir, { recursive: true });

  const files = [
    "vercel.mjs",
    "pino-worker.mjs",
    "pino-file.mjs",
    "pino-pretty.mjs",
    "thread-stream-worker.mjs",
  ];

  for (const file of files) {
    const destName = file === "vercel.mjs" ? "index.js" : file;
    const srcPath = path.join(artifactDir, "api", file);
    const destPath = path.join(functionDir, destName);

    await cp(srcPath, destPath);
  }

  await writeFile(
    path.join(functionDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2),
    "utf8",
  );

  await cp(path.join(artifactDir, "api", "data"), path.join(functionDir, "data"), {
    recursive: true,
  });

  // Write a small CommonJS wrapper `index.js` that requires the serverless function.
  // This is the actual entrypoint Vercel should execute.
  const wrapperIndexJs = `module.exports = require('./functions/index.func/index.js');\n`;
  const topLevelEntrypointDstJs = path.join(outputDir, "index.js");
  await writeFile(topLevelEntrypointDstJs, wrapperIndexJs, "utf8");

  await writeFile(
    path.join(functionDir, ".vc-config.json"),
    JSON.stringify(
      {
        runtime: "nodejs22.x",
        handler: "index.js",
        launcherType: "Nodejs",
        shouldAddHelpers: true,
      },
      null,
      2,
    ),
  );

  await writeFile(
    path.join(outputDir, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [{ src: "/(.*)", dest: "/index" }],
      },
      null,
      2,
    ),
  );
}

try {
  await build();
  console.log("Vercel build output prepared successfully.");
} catch (error) {
  console.error("Failed to prepare Vercel build output:", error);
  throw error;
}

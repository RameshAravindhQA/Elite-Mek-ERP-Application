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

  await cp(path.join(artifactDir, "api", "data"), path.join(functionDir, "data"), {
    recursive: true,
  });

  // Also copy a top-level entrypoint so Vercel can detect the Build Output entrypoint
  // Vercel searches for index.{js,cjs,mjs,ts,..} in the output directory; provide index.mjs
  const topLevelEntrypointSrc = path.join(artifactDir, "api", "vercel.mjs");
  const topLevelEntrypointDst = path.join(outputDir, "index.mjs");
  await cp(topLevelEntrypointSrc, topLevelEntrypointDst);

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
        routes: [{ src: "/(.*)", dest: "/index.mjs" }],
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

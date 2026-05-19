import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll } from "./build.mjs";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

await buildAll();

if (process.env.VERCEL === "1") {
  await rm(path.join(artifactDir, "src"), { recursive: true, force: true });
  await rm(path.join(artifactDir, "tsconfig.json"), { force: true });
}

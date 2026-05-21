import { spawn } from "child_process";

const proc = spawn("pnpm", ["--filter", "@workspace/scripts", "run", "seed"], {
  stdio: "inherit",
  shell: true,
});

proc.on("exit", (code) => {
  process.exit(code === null ? 1 : code);
});

proc.on("error", (error) => {
  console.error("Failed to execute seed command:", error);
  process.exit(1);
});

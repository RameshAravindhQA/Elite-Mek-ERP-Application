import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(() => {
  const frontendPort = Number(process.env.PORT || 5173);
  const backendPort = Number(process.env.BACKEND_PORT || 3000);
  const basePath = process.env.BASE_PATH || "/";

  return {
    base: basePath,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: frontendPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./vitest.setup.ts",
      include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      deps: {
        inline: ["@testing-library/react"],
      },
    },
  };
});

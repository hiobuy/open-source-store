import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    svgr({
      include: "**/*.svg",
      svgrOptions: { exportType: "default" },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});

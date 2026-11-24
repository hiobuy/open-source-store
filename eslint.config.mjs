import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    ".wrangler/**",
    ".cloudflare/**",
    ".vinext/**",
    "coverage/**",
    "dist-api/**",
    "server/**",
    "src/admin/**",
    "src/domain/**",
    "src/mocks/**",
    "src/types/api.ts",
    "src/types/operations.ts",
    "src/types/admin-packages.ts",
    "drizzle/**",
    "scripts/**",
    "docs/**",
    "worker-configuration.d.ts",
    "client/**",
  ]),
]);

export default eslintConfig;

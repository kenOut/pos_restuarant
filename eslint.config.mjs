import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "data/**", "e2e/output/**"]),
  // Browser tests are plain Node CommonJS scripts.
  {
    files: ["e2e/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

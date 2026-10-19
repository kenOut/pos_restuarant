import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests that hash PINs (Argon2) for whole demo restaurants take a few seconds on a busy computer.
    testTimeout: 30_000,
  },
});

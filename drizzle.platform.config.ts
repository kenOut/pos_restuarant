import { defineConfig } from "drizzle-kit";

// ENYO Online platform database (online mode only). Generate its migrations with:
//   npx drizzle-kit generate --config drizzle.platform.config.ts --name <change>
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/platform-schema.ts",
  out: "./drizzle-platform",
  dbCredentials: { url: "./data/platform.db" },
});

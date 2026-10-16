import { defineConfig } from "drizzle-kit";

// Head office database. Generate its migrations with:
//   npx drizzle-kit generate --config drizzle.control.config.ts --name <change>
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/control-schema.ts",
  out: "./drizzle-control",
  dbCredentials: { url: "./data/control.db" },
});

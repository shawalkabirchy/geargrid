import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Run from the repository root (the npm scripts do): paths and the one .env.local are relative to it (D54).
const envFile = resolve(".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema/index.ts",
  out: "./supabase/migrations",
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});

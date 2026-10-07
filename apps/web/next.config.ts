import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// The API runs from apps/web (npm workspace scripts), so the repository root is two folders up. It reads the one root
// .env.local when it exists (spec 4.3); CI and the pod set the variables directly.
const root = resolve(process.cwd(), "../..");
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config: NextConfig = {
  transpilePackages: ["@geargrid/core", "@geargrid/db"],
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default config;

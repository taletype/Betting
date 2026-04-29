import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
loadEnvConfig(join(appDir, "../.."));

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

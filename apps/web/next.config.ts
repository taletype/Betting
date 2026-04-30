import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
loadEnvConfig(join(appDir, "../.."));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "polymarket-upload.s3.us-east-2.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;

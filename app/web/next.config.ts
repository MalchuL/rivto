import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@chulane/app"],
  output: "standalone",
  outputFileTracingRoot: path.join(appDir, ".."),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

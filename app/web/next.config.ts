import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");
const rivtoCoreSrc = path.join(repoRoot, "packages/rivto-editor-core/src/index.ts");
const rivtoReactSrc = path.join(repoRoot, "packages/react-rivto-editor/src/index.ts");
const rivtoReactCss = path.join(repoRoot, "packages/react-rivto-editor/styles.css");
const webReact = path.join(appDir, "node_modules/react");
const webReactDom = path.join(appDir, "node_modules/react-dom");

const nextConfig: NextConfig = {
  transpilePackages: ["@chulane/app", "@chulane/rivto", "@chulane/rivto-react"],
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Match demo/vite.config.ts: resolve editor packages to workspace
      // sources so app work does not require a parallel package build.
      "@chulane/rivto-react/styles.css": rivtoReactCss,
      "@chulane/rivto-react": rivtoReactSrc,
      "@chulane/rivto": rivtoCoreSrc,
      react: webReact,
      "react-dom": webReactDom,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");
const rivtoCrdtDocSrc = path.join(repoRoot, "packages/crdt-doc/src/index.ts");
const rivtoDocumentModelSrc = path.join(repoRoot, "packages/document-model/src/index.ts");
const rivtoCoreSrc = path.join(repoRoot, "packages/rivto-editor-core/src/index.ts");
const rivtoReactSrc = path.join(repoRoot, "packages/react-rivto-editor/src/index.ts");
// Tailwind source entry; app/web's @tailwindcss/postcss compiles it alongside globals.css.
const rivtoReactCss = path.join(repoRoot, "packages/react-rivto-editor/src/styles/index.css");

const nextConfig: NextConfig = {
  transpilePackages: ["@chulane/app", "@chulane/crdt-doc", "@chulane/document-model", "@chulane/rivto", "@chulane/rivto-react"],
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
      // Do not alias react or react-dom here. Next already vendors those
      // packages, and a global alias makes its dev segment explorer call
      // hooks on a different React instance.
      "@chulane/rivto-react/styles.css": rivtoReactCss,
      "@chulane/rivto-react": rivtoReactSrc,
      "@chulane/rivto": rivtoCoreSrc,
      "@chulane/document-model": rivtoDocumentModelSrc,
      "@chulane/crdt-doc": rivtoCrdtDocSrc,
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

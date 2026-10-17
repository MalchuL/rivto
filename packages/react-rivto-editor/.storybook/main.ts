import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Storybook for real editor blocks, compiled from workspace source.
 *
 * Aliases match the demo so stories exercise the same TypeScript sources as
 * `pnpm demo` without a package build. Tailwind compiles the editor stylesheet.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      strictMode: false,
    },
  },
  /**
   * Adds Tailwind and workspace source aliases to the Storybook Vite config.
   *
   * @param storybookConfig - Config produced by the React Vite framework.
   * @returns The merged config that compiles editor source and styles.
   */
  async viteFinal(storybookConfig) {
    return mergeConfig(storybookConfig, {
      plugins: [tailwindcss()],
      resolve: {
        alias: [
          {
            find: /^@chulane\/rivto$/,
            replacement: fileURLToPath(
              new URL("../../rivto-editor-core/src/index.ts", import.meta.url),
            ),
          },
          {
            find: /^@chulane\/crdt-doc$/,
            replacement: fileURLToPath(new URL("../../crdt-doc/src/index.ts", import.meta.url)),
          },
          {
            find: /^@chulane\/document-model$/,
            replacement: fileURLToPath(
              new URL("../../document-model/src/index.ts", import.meta.url),
            ),
          },
        ],
        dedupe: ["react", "react-dom"],
      },
      server: {
        fs: {
          allow: [workspaceRoot],
        },
      },
    });
  },
};

export default config;

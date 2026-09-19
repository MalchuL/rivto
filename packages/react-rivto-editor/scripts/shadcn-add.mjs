#!/usr/bin/env node
/**
 * Adds shadcn/ui components to this package through the official CLI and
 * normalizes the generated import specifiers.
 *
 * `shadcn add` requires the `@/*` import alias declared in `components.json`
 * and `tsconfig.json`. This package is a library that the demo (Vite) and
 * `app/web` (Next.js) compile straight from source, and `app/web` already owns
 * a different `@/*` alias, so alias imports inside the package would resolve
 * against the wrong project. After the CLI writes the files, this script
 * rewrites every `@/...` specifier under `src/components/ui/` to a relative
 * path so the primitives resolve identically in every consumer, in Jest, and
 * in the tsup build.
 *
 * Usage: `pnpm ui:add button dialog` (any `shadcn add` arguments pass through).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");
const uiRoot = join(sourceRoot, "components", "ui");
const aliasImportPattern = /(from\s+["'])@\/([^"']+)(["'])/g;

/**
 * Runs the shadcn CLI with the caller's arguments inside the package root.
 *
 * @param args - Arguments forwarded verbatim to `shadcn add`.
 * @returns The CLI exit status, or 1 when the process could not start.
 */
function runShadcnAdd(args) {
  const result = spawnSync("pnpm", ["dlx", "shadcn@latest", "add", ...args], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

/**
 * Rewrites one alias specifier to a relative path from the importing file.
 *
 * @param filePath - Absolute path of the file containing the import.
 * @param aliasTarget - The specifier remainder after the `@/` prefix.
 * @returns A relative specifier that always starts with `./` or `../`.
 */
function toRelativeSpecifier(filePath, aliasTarget) {
  const target = join(sourceRoot, aliasTarget);
  const specifier = relative(dirname(filePath), target).split("\\").join("/");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

/**
 * Replaces alias imports with relative imports in every generated primitive.
 *
 * @returns The number of files whose contents changed.
 */
function rewriteAliasImports() {
  let changed = 0;
  for (const entry of readdirSync(uiRoot)) {
    if (!/\.(ts|tsx)$/.test(entry)) {
      continue;
    }
    const filePath = join(uiRoot, entry);
    const source = readFileSync(filePath, "utf8");
    const rewritten = source.replace(aliasImportPattern, (_match, prefix, aliasTarget, suffix) => {
      return `${prefix}${toRelativeSpecifier(filePath, aliasTarget)}${suffix}`;
    });
    if (rewritten !== source) {
      writeFileSync(filePath, rewritten);
      changed += 1;
    }
  }
  return changed;
}

const status = runShadcnAdd(process.argv.slice(2));
if (status !== 0) {
  process.exit(status);
}
const changed = rewriteAliasImports();
console.log(`Rewrote alias imports in ${changed} file(s) under src/components/ui.`);

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

/**
 * Checks the transitive public source graph, including type-only exports.
 *
 * @param entry - Source entry point relative to the package root.
 * @param allowBrowser - Whether native DOM contracts are allowed in this layer.
 * @returns Every reachable import and exported type was checked against the layer boundary.
 */
function checkEntry(entry: string, allowBrowser: boolean): void {
  const pending = [resolve(entry)];
  const visited = new Set<string>();
  const forbidden = new Set([
    "ReactNode",
    "HTMLElement",
    "Element",
    "PointerEvent",
    "WheelEvent",
    "Document",
    "Window",
  ]);
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) {
      continue;
    }
    visited.add(path);
    const content = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    /**
     * Traverses imports and type references without treating comments as dependencies.
     *
     * @param node - TypeScript syntax in an exported entry point's dependency graph.
     * @returns Violating imports and native types fail the architectural assertion.
     */
    const inspect = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
        if (
          allowBrowser &&
          (specifier === "@chulane/rivto-root/browser" || specifier === "@chulane/rivto-root")
        ) {
          pending.push(
            resolve(
              specifier.endsWith("/browser")
                ? "../rivto-root/src/browser.ts"
                : "../rivto-root/src/index.ts",
            ),
          );
          return;
        }
        expect(specifier.startsWith(".")).toBe(true);
        const target = resolve(dirname(path), specifier);
        const file = [target + ".ts", target + ".tsx", target + "/index.ts"].find(existsSync);
        expect(file).toBeDefined();
        pending.push(file!);
      }
      if (!allowBrowser && ts.isIdentifier(node)) {
        expect(forbidden.has(node.text)).toBe(false);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  }
}

test("the core public API has no React, DOM, Rivto or storage dependency, including type imports", () => {
  checkEntry("src/index.ts", false);
});

test("the browser entry point has no React or application dependency", () => {
  checkEntry("src/browser.ts", true);
});

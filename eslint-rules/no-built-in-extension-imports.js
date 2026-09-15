/**
 * Prevents built-in React extensions from depending on sibling extensions.
 *
 * External extensions may consume built-ins, while built-ins may depend on
 * shared React package foundations and other built-ins. Relative specifiers are
 * resolved lexically, so the rule does not require an import-resolution plugin.
 *
 * @module
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXTENSIONS_ROOT = path.join(
  REPOSITORY_ROOT,
  "packages/react-rivto-editor/src/extensions",
);
const BUILT_INS_ROOT = path.join(EXTENSIONS_ROOT, "built-ins");

/**
 * Checks whether a path is contained by a directory.
 *
 * @param directory - Absolute owning directory.
 * @param candidate - Absolute candidate path.
 * @returns Whether the candidate is inside the directory.
 */
function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

/** Reports relative imports from built-ins into sibling extension directories. */
const noBuiltInExtensionImports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow built-in extensions from importing sibling extensions",
    },
    schema: [],
    messages: {
      reverseDependency: "Built-in extensions may only depend on other built-in extensions.",
    },
  },
  /**
   * Creates visitors for one linted built-in source file.
   *
   * @param context - ESLint rule context containing the importer filename.
   * @returns Import and export visitors, or no visitors outside the built-in tree.
   */
  create(context) {
    const filename = path.resolve(context.filename);
    if (!isWithin(BUILT_INS_ROOT, filename)) return {};

    /**
     * Validates one static or dynamic module specifier.
     *
     * @param node - Import/export node reported when the boundary is crossed.
     * @param source - Literal module specifier.
     * @returns Nothing.
     */
    const checkSource = (node, source) => {
      if (typeof source !== "string" || !source.startsWith(".")) return;
      const target = path.resolve(path.dirname(filename), source);
      if (isWithin(EXTENSIONS_ROOT, target) && !isWithin(BUILT_INS_ROOT, target)) {
        context.report({ node, messageId: "reverseDependency" });
      }
    };

    return {
      ImportDeclaration: (node) => checkSource(node, node.source.value),
      ExportNamedDeclaration: (node) => checkSource(node, node.source?.value),
      ExportAllDeclaration: (node) => checkSource(node, node.source.value),
      ImportExpression: (node) => checkSource(node, node.source.value),
    };
  },
};

export default noBuiltInExtensionImports;

/** Verifies numeric ordering, page-folder merging, and generated creation paths. */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentationTree,
  createDocumentationPagePath,
} from "../src/document-tree.ts";

/**
 * Creates a minimal canonical page for navigation tests.
 *
 * @param path Relative Markdown path.
 * @returns Documentation page fixture.
 */
function page(path) {
  return { path, content: `# ${path}\n`, modifiedAt: 1 };
}

test("sorts numerically and merges a page with its matching folder", function buildsNestedTree() {
  const tree = buildDocumentationTree([
    page("20-guide/20-reference.md"),
    page("20-guide/10-setup/10-install.md"),
    page("100-later.md"),
    page("20-guide.md"),
    page("10-overview.md"),
  ]);

  assert.equal(tree[0].page.path, "10-overview.md");
  assert.equal(tree[1].kind, "page");
  assert.equal(tree[1].page.path, "20-guide.md");
  assert.equal(tree[1].children[0].kind, "folder");
  assert.equal(tree[1].children[0].path, "20-guide/10-setup");
  assert.equal(tree[1].children[0].children[0].page.path, "20-guide/10-setup/10-install.md");
  assert.equal(tree[1].children[1].page.path, "20-guide/20-reference.md");
  assert.equal(tree[2].page.path, "100-later.md");
});

test("creates next sibling and child paths in increments of ten", function createsOrderedPaths() {
  const pages = [
    page("10-packages.md"),
    page("10-packages/10-core.md"),
    page("10-packages/20-react.md"),
    page("20-apps.md"),
  ];

  assert.equal(
    createDocumentationPagePath(pages, "10-packages/20-react.md", "sibling", "Vue Adapter"),
    "10-packages/30-vue-adapter.md",
  );
  assert.equal(
    createDocumentationPagePath(pages, "10-packages.md", "child", "Svelte Adapter"),
    "10-packages/30-svelte-adapter.md",
  );
  assert.equal(
    createDocumentationPagePath(pages, "20-apps.md", "child", "Desktop App"),
    "20-apps/10-desktop-app.md",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { CALLOUT_BLOCK_TYPE } from "../src/blocks/host-block-definitions.ts";
import {
  TOC_CALLOUT_BLOCK_TYPE,
  TOC_WRITING_BLOCK_TYPE,
  collectTocEntries,
  extractMarkdownHeadings,
  isTocConversionAvailable,
} from "../src/blocks/toc-entries.ts";

/**
 * Builds a parent map the table-of-contents walker can read and move.
 *
 * @param nodes - Blocks in document order. Root order follows this array.
 * @returns A view plus a move operation that reparents one block.
 */
function createTree(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, { ...node, childIds: [] }]));
  const rootIds = [];
  for (const node of nodes) {
    if (node.parentId == null) rootIds.push(node.id);
    else byId.get(node.parentId).childIds.push(node.id);
  }
  const view = () => ({
    getBlock: (id) => {
      const block = byId.get(id);
      if (!block) return undefined;
      return {
        id: block.id,
        type: block.type,
        content: block.content,
        childIds: block.childIds,
      };
    },
    getParentId: (id) => (byId.has(id) ? byId.get(id).parentId : undefined),
    getRootIds: () => rootIds,
  });
  return {
    view,
    move(id, parentId) {
      const block = byId.get(id);
      if (block.parentId == null) rootIds.splice(rootIds.indexOf(id), 1);
      else {
        const parent = byId.get(block.parentId);
        parent.childIds.splice(parent.childIds.indexOf(id), 1);
      }
      block.parentId = parentId;
      if (parentId == null) rootIds.push(id);
      else byId.get(parentId).childIds.push(id);
    },
  };
}

const sectionContent = "# Parent\n\n## Parent two";
const beforeContent = [
  "## First",
  "",
  "```",
  "# Fenced",
  "```",
  "",
  "```js",
  "# Fenced with language",
  "```",
  "",
  "~~~",
  "# Tilde fence",
  "~~~",
  "",
  "Setext heading",
  "--------------",
  "",
  "# Same",
  "# Same",
].join("\n");

function sectionTree() {
  return createTree([
    { id: "section", type: TOC_WRITING_BLOCK_TYPE, parentId: null, content: sectionContent },
    { id: "before", type: TOC_WRITING_BLOCK_TYPE, parentId: "section", content: beforeContent },
    { id: "nested", type: TOC_WRITING_BLOCK_TYPE, parentId: "before", content: "### Nested" },
    { id: "toc", type: "demo.table-of-contents", parentId: "section", content: "" },
    {
      id: "callout",
      type: CALLOUT_BLOCK_TYPE,
      parentId: "section",
      content: "# Callout heading\n\n```\n# Hidden callout\n```",
    },
    { id: "slider", type: "demo.slider", parentId: "section", content: "# Not a heading source" },
    { id: "cousin", type: TOC_WRITING_BLOCK_TYPE, parentId: null, content: "# Cousin" },
    { id: "other", type: TOC_WRITING_BLOCK_TYPE, parentId: null, content: "# Other root" },
  ]);
}

const sectionEntries = [
  { blockId: "section", depth: 1, text: "Parent" },
  { blockId: "section", depth: 2, text: "Parent two" },
  { blockId: "before", depth: 2, text: "First" },
  { blockId: "before", depth: 2, text: "Setext heading" },
  { blockId: "before", depth: 1, text: "Same" },
  { blockId: "before", depth: 1, text: "Same" },
  { blockId: "nested", depth: 3, text: "Nested" },
  { blockId: "callout", depth: 1, text: "Callout heading" },
];

test("markdown heading extraction keeps ATX, Setext, and repeats outside code fences", () => {
  assert.deepEqual(extractMarkdownHeadings(beforeContent), [
    { depth: 2, text: "First" },
    { depth: 2, text: "Setext heading" },
    { depth: 1, text: "Same" },
    { depth: 1, text: "Same" },
  ]);
  assert.deepEqual(extractMarkdownHeadings("# Hello **world**"), [
    { depth: 1, text: "Hello world" },
  ]);
  assert.deepEqual(extractMarkdownHeadings("    # indented code\n"), []);
});

test("table of contents stays inside its parent subtree and follows document order", () => {
  const tree = sectionTree();
  assert.deepEqual(collectTocEntries(tree.view(), "toc"), sectionEntries);
});

test("a root table of contents covers the root forest", () => {
  const tree = sectionTree();
  tree.move("toc", null);
  assert.deepEqual(collectTocEntries(tree.view(), "toc"), [
    ...sectionEntries,
    { blockId: "cousin", depth: 1, text: "Cousin" },
    { blockId: "other", depth: 1, text: "Other root" },
  ]);
});

test("moving a table of contents changes the headings it lists", () => {
  const tree = sectionTree();
  assert.deepEqual(collectTocEntries(tree.view(), "toc").map(({ text }) => text), [
    "Parent",
    "Parent two",
    "First",
    "Setext heading",
    "Same",
    "Same",
    "Nested",
    "Callout heading",
  ]);
  tree.move("toc", "cousin");
  assert.deepEqual(collectTocEntries(tree.view(), "toc"), [
    { blockId: "cousin", depth: 1, text: "Cousin" },
  ]);
  tree.move("toc", null);
  assert.equal(
    collectTocEntries(tree.view(), "toc").some(({ text }) => text === "Other root"),
    true,
  );
  assert.equal(collectTocEntries(tree.view(), "missing").length, 0);
});

test("table of contents conversion is limited to empty content", () => {
  assert.equal(TOC_CALLOUT_BLOCK_TYPE, CALLOUT_BLOCK_TYPE);
  assert.equal(TOC_WRITING_BLOCK_TYPE, "paragraph");
  assert.equal(isTocConversionAvailable(""), true);
  assert.equal(isTocConversionAvailable("/"), true);
  assert.equal(isTocConversionAvailable("/toc"), true);
  assert.equal(isTocConversionAvailable("Hello"), false);
  assert.equal(isTocConversionAvailable("Hello/toc"), false);
  assert.equal(isTocConversionAvailable(" /toc"), false);
  assert.equal(isTocConversionAvailable("/toc "), false);
});

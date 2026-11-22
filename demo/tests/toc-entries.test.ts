import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTE_BLOCK_TYPE,
  TIP_BLOCK_TYPE,
  WARNING_BLOCK_TYPE,
} from "../src/extensions/host-blocks/definitions.ts";
import {
  TOC_NOTE_BLOCK_TYPE,
  TOC_TIP_BLOCK_TYPE,
  TOC_WARNING_BLOCK_TYPE,
  TOC_WRITING_BLOCK_TYPE,
  collectTocEntries,
  extractMarkdownHeadings,
  type TocDocumentView,
} from "../src/extensions/host-blocks/toc-entries.ts";

/** Block data used to construct a movable test tree. */
interface FixtureBlock {
  id: string;
  type: string;
  parentId: string | null;
  content: string;
}

/** Fixture block with the direct children maintained by the test tree. */
interface FixtureBlockNode extends FixtureBlock {
  childIds: string[];
}

/**
 * Builds a parent map the table-of-contents walker can read and move.
 *
 * @param nodes - Blocks in document order. Root order follows this array.
 * @returns A view plus a move operation that reparents one block.
 */
function createTree(nodes: readonly FixtureBlock[]) {
  const byId = new Map<string, FixtureBlockNode>(
    nodes.map((node) => [node.id, { ...node, childIds: [] }]),
  );
  const rootIds: string[] = [];
  for (const node of nodes) {
    if (node.parentId === null) {
      rootIds.push(node.id);
    } else {
      const parent = byId.get(node.parentId);
      assert.ok(parent);
      parent.childIds.push(node.id);
    }
  }
  const view = (): TocDocumentView => ({
    getBlock: (id) => {
      const block = byId.get(id);
      if (!block) {
        return undefined;
      }
      return {
        id: block.id,
        type: block.type,
        content: block.content,
        childIds: block.childIds,
      };
    },
    getParentId: (id) => byId.get(id)?.parentId,
    getRootIds: () => rootIds,
  });
  return {
    view,
    /**
     * Moves a fixture block to the end of the requested parent's children.
     *
     * @param id - ID of the existing block to move.
     * @param parentId - ID of the existing parent, or null for a root.
     * @returns After the fixture's parent and sibling lists are updated.
     * @throws If the block or a referenced parent is missing.
     */
    move(id: string, parentId: string | null): void {
      const block = byId.get(id);
      assert.ok(block);
      if (block.parentId === null) {
        rootIds.splice(rootIds.indexOf(id), 1);
      } else {
        const parent = byId.get(block.parentId);
        assert.ok(parent);
        parent.childIds.splice(parent.childIds.indexOf(id), 1);
      }
      block.parentId = parentId;
      if (parentId === null) {
        rootIds.push(id);
      } else {
        const parent = byId.get(parentId);
        assert.ok(parent);
        parent.childIds.push(id);
      }
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

/**
 * Builds the outline shared by table-of-contents tests.
 *
 * @returns A movable fixture with headings, nested blocks, and unrelated roots.
 */
function sectionTree() {
  return createTree([
    { id: "section", type: TOC_WRITING_BLOCK_TYPE, parentId: null, content: sectionContent },
    { id: "before", type: TOC_WRITING_BLOCK_TYPE, parentId: "section", content: beforeContent },
    { id: "nested", type: TOC_WRITING_BLOCK_TYPE, parentId: "before", content: "### Nested" },
    { id: "toc", type: "demo.table-of-contents", parentId: "section", content: "" },
    { id: "note", type: NOTE_BLOCK_TYPE, parentId: "section", content: "# Note heading" },
    { id: "tip", type: TIP_BLOCK_TYPE, parentId: "section", content: "## Tip heading" },
    {
      id: "warning",
      type: WARNING_BLOCK_TYPE,
      parentId: "section",
      content: "# Warning heading\n\n```\n# Hidden warning\n```",
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
  { blockId: "note", depth: 1, text: "Note heading" },
  { blockId: "tip", depth: 2, text: "Tip heading" },
  { blockId: "warning", depth: 1, text: "Warning heading" },
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
  assert.deepEqual(
    collectTocEntries(tree.view(), "toc").map(({ text }) => text),
    [
      "Parent",
      "Parent two",
      "First",
      "Setext heading",
      "Same",
      "Same",
      "Nested",
      "Note heading",
      "Tip heading",
      "Warning heading",
    ],
  );
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

test("table of contents recognizes the host writing block types", () => {
  assert.equal(TOC_NOTE_BLOCK_TYPE, NOTE_BLOCK_TYPE);
  assert.equal(TOC_TIP_BLOCK_TYPE, TIP_BLOCK_TYPE);
  assert.equal(TOC_WARNING_BLOCK_TYPE, WARNING_BLOCK_TYPE);
  assert.equal(TOC_WRITING_BLOCK_TYPE, "paragraph");
});

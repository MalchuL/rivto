import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_REPORT_TYPE,
  captureBlockReviewSnapshot,
  captureElementReviewSnapshot,
  createReviewBlockInput,
  createReviewElementInput,
  getReviewBlockPlacement,
  reviewBlockPropsSchema,
  reviewElementPropsSchema,
} from "../src/extensions/review-report-model.ts";

/** Creates the manager reads needed by pure capture functions. */
function createEditor({ roots, parents = {}, elements = [] }) {
  const blocks = new Map();
  const collect = (block) => {
    blocks.set(block.id, structuredClone(block));
    block.children.forEach(collect);
  };
  roots.forEach(collect);
  return {
    blocks: {
      getRootIds: () => roots.map(({ id }) => id),
      getParentId: (id) => parents[id] ?? null,
      getBlock: (id) => structuredClone(blocks.get(id)),
    },
    elements: {
      getElements: () => structuredClone(elements),
    },
  };
}

test("Review factories start empty and strict window schemas reject invalid values", () => {
  assert.deepEqual(createReviewBlockInput().props, {
    blocksAbove: 4,
    blocksBelow: 4,
    includeReportBlock: false,
    snapshot: null,
    savedAt: null,
  });
  assert.deepEqual(createReviewElementInput({
    frame: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 0,
  }).props, {
    problem: "",
    elementsAbove: 2,
    elementsBelow: 2,
    snapshot: null,
    savedAt: null,
  });
  assert.throws(() => reviewBlockPropsSchema.parse({
    blocksAbove: -1,
    blocksBelow: 2,
    includeReportBlock: false,
    snapshot: null,
    savedAt: null,
  }));
  assert.throws(() => reviewElementPropsSchema.parse({
    problem: "x",
    elementsAbove: 1.5,
    elementsBelow: 2,
    snapshot: null,
    savedAt: null,
  }));
  assert.equal(reviewBlockPropsSchema.parse({
    blocksAbove: 4,
    blocksBelow: 4,
    snapshot: null,
    savedAt: null,
  }).includeReportBlock, false);
});

test("nested block Review captures an exact root slice and strips recursive reports", () => {
  const leaf = (id, content) => ({ id, type: "paragraph", content, props: {}, pluginData: {}, listProps: {}, children: [] });
  const review = {
    ...leaf("review", "Nested problem"),
    ...createReviewBlockInput("Nested problem"),
    id: "review",
    listProps: {},
    pluginData: {},
    children: [],
    props: {
      blocksAbove: 1,
      blocksBelow: 1,
      includeReportBlock: true,
      snapshot: { version: 6, blocks: [], elements: [], pluginData: {} },
      savedAt: "2026-09-15T12:00:00.000Z",
    },
  };
  const editor = createEditor({
    roots: [leaf("a", "A"), {
      ...leaf("container", "Container"),
      children: [leaf("before-review", "Before"), review, leaf("after-review", "After")],
    }, leaf("c", "C"), leaf("d", "D")],
    parents: { review: "container", "before-review": "container", "after-review": "container" },
    elements: [{
      id: "wide-card",
      type: "block",
      frame: { x: 0, y: 0, width: 100, height: 100 },
      zIndex: 0,
      props: { startBlockId: "a", endBlockId: "d" },
    }],
  });

  const snapshot = captureBlockReviewSnapshot(editor, "review", 1, 1, true);
  assert.deepEqual(snapshot.blocks.map(({ id }) => id), ["a", "container", "c"]);
  const nested = snapshot.blocks[1].children[1];
  assert.equal(nested.type, REVIEW_REPORT_TYPE);
  assert.equal(nested.props.snapshot, null);
  assert.equal(nested.props.savedAt, null);
  assert.deepEqual(snapshot.elements[0].props, {
    startBlockId: "a",
    endBlockId: "c",
  });
  assert.deepEqual(Object.keys(snapshot), ["version", "blocks", "elements", "pluginData"]);
  assert.deepEqual(getReviewBlockPlacement(editor, "review"), {
    previousReportSiblingId: "before-review",
    nextReportSiblingId: "after-review",
    parentReportId: "container",
  });

  const withoutReport = captureBlockReviewSnapshot(editor, "review", 1, 1);
  assert.deepEqual(
    withoutReport.blocks[1].children.map(({ id }) => id),
    ["before-review", "after-review"],
  );
  assert.deepEqual(Object.keys(withoutReport), ["version", "blocks", "elements", "pluginData"]);

});

test("root Review placement uses null boundaries and can omit its root", () => {
  const review = {
    id: "review",
    ...createReviewBlockInput("Root problem"),
    listProps: {},
    pluginData: {},
    children: [],
  };
  const next = {
    id: "next",
    type: "paragraph",
    content: "Next",
    props: {},
    pluginData: {},
    listProps: {},
    children: [],
  };
  const snapshot = captureBlockReviewSnapshot(
    createEditor({ roots: [review, next] }),
    "review",
    0,
    0,
  );

  assert.deepEqual(snapshot.blocks, []);
  assert.deepEqual(getReviewBlockPlacement(
    createEditor({ roots: [review, next] }),
    "review",
  ), {
    previousReportSiblingId: null,
    nextReportSiblingId: "next",
    parentReportId: null,
  });
});

test("element Review uses z-order, closes groups, and detaches connectors", () => {
  const elementInput = createReviewElementInput({
    id: "review",
    frame: { x: 10, y: 10, width: 200, height: 150 },
    zIndex: 3,
    problem: "Canvas problem",
    elementsAbove: 2,
    elementsBelow: 0,
  });
  const elements = [{
    id: "connector",
    type: "connector",
    frame: { x: 0, y: 0, width: 100, height: 20 },
    zIndex: 1,
    props: {
      source: { elementId: "outside", anchor: { x: 0, y: 0 }, position: { x: 1, y: 2 } },
      target: { elementId: "review", anchor: { x: 1, y: 1 }, position: { x: 3, y: 4 } },
    },
  }, {
    id: "group",
    type: "group",
    frame: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 2,
    props: { children: ["child"] },
  }, { ...elementInput, id: elementInput.id }, {
    id: "outside",
    type: "rectangle",
    frame: { x: 300, y: 0, width: 100, height: 100 },
    zIndex: 4,
    props: {},
  }, {
    id: "child",
    type: "block",
    frame: { x: 0, y: 120, width: 100, height: 100 },
    zIndex: 99,
    props: { startBlockId: "root-a", endBlockId: "root-b" },
  }];
  const leaf = (id, content) => ({ id, type: "paragraph", content, props: {}, pluginData: {}, listProps: {}, children: [] });
  const editor = createEditor({ roots: [leaf("root-a", "A"), leaf("root-b", "B")], elements });

  const snapshot = captureElementReviewSnapshot(editor, "review", 2, 0);
  assert.deepEqual(snapshot.elements.map(({ id }) => id), ["connector", "group", "review", "child"]);
  assert.equal(snapshot.elements.find(({ id }) => id === "connector").props.source.elementId, undefined);
  assert.equal(snapshot.elements.find(({ id }) => id === "connector").props.target.elementId, "review");
  assert.deepEqual(snapshot.elements.find(({ id }) => id === "group").props.children, ["child"]);
  assert.equal(snapshot.elements.find(({ id }) => id === "review").props.snapshot, null);
  assert.deepEqual(snapshot.blocks.map(({ id }) => id), ["root-a", "root-b"]);

});

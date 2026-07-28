import assert from "node:assert/strict";
import test from "node:test";
import { duplicateBlockInput } from "../src/blocks/block-utils.ts";

test("duplicate input removes every subtree ID and preserves supported data", () => {
  const block = {
    id: "parent",
    type: "demo.slider",
    collapsed: true,
    content: "Text",
    props: { value: 42 },
    pluginData: { plugin: { enabled: true } },
    layout: { x: 1, y: 2, width: 3, height: 4 },
    children: [{
      id: "child",
      type: "paragraph",
      collapsed: false,
      content: "Child",
      props: {},
      pluginData: {},
      children: [],
    }],
  };

  const duplicate = duplicateBlockInput(block);
  assert.equal("id" in duplicate, false);
  assert.equal("id" in duplicate.children[0], false);
  assert.deepEqual(duplicate, {
    type: block.type,
    collapsed: true,
    content: block.content,
    props: block.props,
    pluginData: block.pluginData,
    layout: block.layout,
    children: [{
      type: "paragraph",
      collapsed: false,
      content: "Child",
      props: {},
      pluginData: {},
      layout: undefined,
      children: [],
    }],
  });
  assert.notEqual(duplicate.props, block.props);
  assert.notEqual(duplicate.children, block.children);
});

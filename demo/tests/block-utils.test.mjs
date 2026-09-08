import assert from "node:assert/strict";
import test from "node:test";
import { duplicateBlockInput } from "../src/blocks/block-utils.ts";

test("duplicate input removes every subtree ID and preserves supported data", () => {
  const block = {
    id: "parent",
    type: "demo.slider",
    listProps: { collapsed: true, type: "checkbox", checked: true },
    content: "Text",
    props: { value: 42 },
    pluginData: { plugin: { enabled: true } },
    children: [{
      id: "child",
      type: "paragraph",
      listProps: { collapsed: false, type: "numbered_list", checked: false },
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
    listProps: { collapsed: true, type: "checkbox", checked: true },
    content: block.content,
    props: block.props,
    pluginData: block.pluginData,
    children: [{
      type: "paragraph",
      listProps: { collapsed: false, type: "numbered_list", checked: false },
      content: "Child",
      props: {},
      pluginData: {},
      children: [],
    }],
  });
  assert.notEqual(duplicate.props, block.props);
  assert.notEqual(duplicate.children, block.children);
});

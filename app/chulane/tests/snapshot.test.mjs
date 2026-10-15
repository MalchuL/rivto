import assert from "node:assert/strict";
import test from "node:test";
import { DOCUMENT_SNAPSHOT_VERSION, DocumentModelImpl } from "@chulane/document-model";
import { YjsDoc } from "@chulane/crdt-doc";
import {
  EMPTY_EDITOR_CONTENT,
  extractPageOutline,
  extractPageText,
  parseEditorSnapshot,
  serializeEditorSnapshot,
  serializeSeedSnapshot,
} from "../src/editor/snapshot.ts";

test("empty and seeded page content loads into the current document model", async () => {
  const document = new DocumentModelImpl(new YjsDoc("page-snapshot-test"));
  try {
    for (const content of [
      EMPTY_EDITOR_CONTENT,
      "",
      "<p></p>",
      serializeSeedSnapshot(["# Title"]),
    ]) {
      const snapshot = parseEditorSnapshot(content);
      assert.equal(snapshot?.version, DOCUMENT_SNAPSHOT_VERSION);
      assert.deepEqual(snapshot.rootElementIds, []);
      document.loadSnapshot(snapshot);
      assert.deepEqual(document.getSnapshot().blocks, snapshot.blocks);
    }
    const content = serializeSeedSnapshot(["# Title", { content: "Task", list: "checkbox" }]);
    assert.equal(extractPageText(content), "Title Task");
    assert.deepEqual(extractPageOutline(content), [{ level: 1, text: "Title" }]);
  } finally {
    await document.destroy();
  }
});

test("page serialization preserves ordered canvas roots and plugin data", async () => {
  const document = new DocumentModelImpl(new YjsDoc("canvas-snapshot-test"));
  try {
    const snapshot = {
      version: DOCUMENT_SNAPSHOT_VERSION,
      blocks: [],
      elements: ["first", "second"].map((id) => ({
        id,
        childIds: [],
        type: "shape",
        frame: { x: 0, y: 0, width: 100, height: 100 },
        zIndex: 0,
        props: {},
      })),
      rootElementIds: ["second", "first"],
      pluginData: { example: { enabled: true } },
    };
    const parsed = parseEditorSnapshot(serializeEditorSnapshot(snapshot));
    assert.deepEqual(parsed, snapshot);
    document.loadSnapshot(parsed);
    assert.deepEqual(document.getSnapshot(), snapshot);
  } finally {
    await document.destroy();
  }
});

test("page parsing rejects unsupported snapshot versions and retains text fallback", () => {
  assert.equal(parseEditorSnapshot('{"version":6,"blocks":[]}'), null);
  assert.equal(parseEditorSnapshot("invalid JSON"), null);
  assert.equal(extractPageText("<p>Legacy text</p>"), "Legacy text");
});

/** Verifies the Markdown-safe Tab and Shift+Tab shortcut mapping. */

import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentationIndentAction } from "../src/editor-keyboard.ts";

/** Creates the keyboard fields consumed by the shortcut resolver. */
function keyboardEvent(overrides = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key: "Tab",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

test("maps Tab and Shift+Tab to list nesting actions", function mapsIndentShortcuts() {
  assert.equal(getDocumentationIndentAction(keyboardEvent()), "indent");
  assert.equal(getDocumentationIndentAction(keyboardEvent({ shiftKey: true })), "outdent");
});

test("leaves modified Tab and unrelated keys to the editor or browser", function ignoresOtherKeys() {
  assert.equal(getDocumentationIndentAction(keyboardEvent({ ctrlKey: true })), null);
  assert.equal(getDocumentationIndentAction(keyboardEvent({ metaKey: true })), null);
  assert.equal(getDocumentationIndentAction(keyboardEvent({ altKey: true })), null);
  assert.equal(getDocumentationIndentAction(keyboardEvent({ key: "Enter" })), null);
});

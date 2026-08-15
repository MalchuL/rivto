/** Verifies image extraction across browser clipboard representations. */

import assert from "node:assert/strict";
import test from "node:test";
import { extractClipboardImages } from "../src/clipboard-images.ts";

test("extracts file items even when the clipboard files list is empty", function extractsItems() {
  const image = { type: "image/png", name: "diagram.png" };
  const data = {
    files: [],
    items: [
      { kind: "string", getAsFile: function noFile() { return null; } },
      { kind: "file", getAsFile: function imageFile() { return image; } },
    ],
  };

  assert.deepEqual(extractClipboardImages(data), [image]);
});

test("deduplicates images exposed through items and files", function deduplicatesFiles() {
  const image = { type: "image/jpeg", name: "photo.jpg" };
  const text = { type: "text/plain", name: "notes.txt" };
  const data = {
    files: [image, text],
    items: [{ kind: "file", getAsFile: function imageFile() { return image; } }],
  };

  assert.deepEqual(extractClipboardImages(data), [image]);
});

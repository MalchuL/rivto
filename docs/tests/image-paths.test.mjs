/** Verifies portable Markdown image paths survive editor display conversion. */

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveImagesForEditor,
  resolvePastedImageForEditor,
  restoreImagesForFile,
} from "../src/image-paths.ts";

test("round trips nested relative image paths through the browser mirror", function roundTripsImages() {
  const source = "![Diagram](10-core/assets/pasted-example.png)";
  const editorMarkdown = resolveImagesForEditor(source, "10-packages/10-core.md");

  assert.equal(
    editorMarkdown,
    "![Diagram](/markdown/10-packages/10-core/assets/pasted-example.png)",
  );
  assert.equal(restoreImagesForFile(editorMarkdown, "10-packages/10-core.md"), source);
  assert.equal(
    resolvePastedImageForEditor("10-core/assets/pasted-example.png", "10-packages/10-core.md"),
    "/markdown/10-packages/10-core/assets/pasted-example.png",
  );
});

test("leaves remote and data image sources unchanged", function preservesExternalImages() {
  const markdown = "![Remote](https://example.com/image.png)\n\n![Inline](data:image/png;base64,abc)";
  assert.equal(resolveImagesForEditor(markdown, "10-page.md"), markdown);
});

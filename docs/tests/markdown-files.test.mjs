/** Verifies the smallest security and discovery invariants of the docs file layer. */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createDocumentationImage,
  createMarkdownDocument,
  generateLlmsText,
  readMarkdownDocuments,
  resolveMarkdownPath,
} from "../vite/markdown-files.ts";

test("discovers Markdown recursively in numeric prefix order", async function discoversMarkdown() {
  const root = await mkdtemp(join(tmpdir(), "rivto-docs-"));
  await mkdir(join(root, "20-editor"));
  await writeFile(join(root, "100-zeta.md"), "# Zeta\n");
  await writeFile(join(root, "10-rivto.md"), "# Rivto\n");
  await writeFile(join(root, "20-editor", "10-intro.md"), "# Editor\n");
  await writeFile(join(root, "ignored.txt"), "not documentation\n");

  const documents = await readMarkdownDocuments(root);
  assert.deepEqual(documents.map(function readPath(document) { return document.path; }), [
    "10-rivto.md",
    "20-editor/10-intro.md",
    "100-zeta.md",
  ]);
});

test("rejects paths outside the documentation root", function rejectsTraversal() {
  assert.throws(function resolveTraversal() {
    resolveMarkdownPath("/tmp/rivto-docs", "../secret.md");
  }, /inside the documentation directory/);
});

test("rejects non-Markdown paths", function rejectsOtherExtensions() {
  assert.throws(function resolveScript() {
    resolveMarkdownPath("/tmp/rivto-docs", "script.ts");
  }, /Only Markdown files/);
});

test("creates ordered nested Markdown without overwriting", async function createsMarkdown() {
  const root = await mkdtemp(join(tmpdir(), "rivto-docs-create-"));
  const created = await createMarkdownDocument(root, {
    path: "10-guide/10-introduction.md",
    content: "# Introduction\n\n",
  });

  assert.equal(created.path, "10-guide/10-introduction.md");
  await assert.rejects(
    createMarkdownDocument(root, {
      path: "10-guide/10-introduction.md",
      content: "# Replacement\n\n",
    }),
    /already exists/,
  );
  await assert.rejects(
    createMarkdownDocument(root, {
      path: "guide/introduction.md",
      content: "# Unordered\n\n",
    }),
    /numeric prefixes/,
  );
});

test("stores a valid pasted image under its owning page folder", async function storesImage() {
  const root = await mkdtemp(join(tmpdir(), "rivto-docs-image-"));
  await writeFile(join(root, "10-guide.md"), "# Guide\n");
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const image = await createDocumentationImage(root, "10-guide.md", "image/png", pngSignature);
  assert.match(image.path, /^10-guide\/assets\/pasted-\d+-[a-f\d]{8}\.png$/);
  assert.equal(image.markdownSource, "10-guide/assets/" + image.path.split("/").at(-1));
  await assert.rejects(
    createDocumentationImage(root, "10-guide.md", "image/svg+xml", Buffer.from("<svg/>")),
    /valid PNG/,
  );
});

test("generates package and application links for llms.txt", function generatesLlmsIndex() {
  const documents = [
    { path: "00-rivto.md", content: "# Rivto\n\nWorkspace overview.\n", modifiedAt: 1 },
    { path: "10-packages/10-core.md", content: "# Core package\n\nFramework-neutral behavior.\n", modifiedAt: 1 },
    { path: "20-apps/10-demo.md", content: "# Demo app\n\nBrowser integration host.\n", modifiedAt: 1 },
  ];

  const llmsText = generateLlmsText(documents);
  assert.match(llmsText, /^# Rivto\n\n>/);
  assert.match(llmsText, /## Packages\n\n- \[Core package\]\(\/markdown\/10-packages\/10-core\.md\)/);
  assert.match(llmsText, /## Applications\n\n- \[Demo app\]\(\/markdown\/20-apps\/10-demo\.md\)/);
});

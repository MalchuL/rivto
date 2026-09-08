import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocumentationUrl,
  getDocumentationPath,
  resolveDocumentationLink,
  slugifyHeading,
} from "../src/navigation.ts";

test("round-trips documentation routes and resolves page anchors", function resolvesRoutes() {
  const pagePath = "10-packages/10-rivto.md";
  assert.equal(createDocumentationUrl(pagePath, "main-api"), "/10-packages/10-rivto#main-api");
  assert.equal(getDocumentationPath("/10-packages/10-rivto"), pagePath);
  assert.deepEqual(resolveDocumentationLink("20-reference.md#Methods", pagePath), {
    path: "10-packages/20-reference.md",
    anchor: "Methods",
  });
  assert.deepEqual(resolveDocumentationLink("#main-api", pagePath), {
    path: pagePath,
    anchor: "main-api",
  });
  assert.equal(resolveDocumentationLink("https://example.com", pagePath), null);
});

test("creates stable heading slugs", function createsHeadingSlug() {
  assert.equal(slugifyHeading("  Yjs: Maps & Arrays  "), "yjs-maps-arrays");
});

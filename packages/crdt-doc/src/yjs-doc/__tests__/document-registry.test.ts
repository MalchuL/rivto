import * as Y from "yjs";
import { YjsDocumentRegistry } from "../document-registry";

test("registry replication keeps content lazy and recreates destroyed subdocuments with the same GUID", async () => {
  const left = new YjsDocumentRegistry("workspace");
  const right = new YjsDocumentRegistry("workspace");
  left.registerDocument("source");
  const source = left.openDocument("source");
  source.getText("test").insert(0, "source content");
  Y.applyUpdate(right.root.doc, Y.encodeStateAsUpdate(left.root.doc));
  const placeholder = [...right.root.doc.getSubdocs()][0]!;
  expect(placeholder.shouldLoad).toBe(false);
  expect(placeholder.getText("test").toString()).toBe("");
  const opened = right.openDocument("source");
  expect(opened.doc.shouldLoad).toBe(true);
  expect(opened.doc.guid).toBe(source.doc.guid);
  Y.applyUpdate(opened.doc, Y.encodeStateAsUpdate(source.doc));
  expect(opened.getText("test").toString()).toBe("source content");
  await opened.destroy();
  const fresh = right.openDocument("source");
  expect(fresh.doc).not.toBe(opened.doc);
  expect(fresh.doc.guid).toBe(opened.doc.guid);
  expect(fresh.getText("test").toString()).toBe("");
  await fresh.destroy(); await source.destroy(); await left.root.destroy(); await right.root.destroy();
});

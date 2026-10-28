import { BlockReferenceResolver } from "./block-reference-resolver";

test("resolves host metadata without loading documents or requiring a React editor", async () => {
  const source = {
    getDocument: jest.fn(() => undefined),
    getDocuments: jest.fn(() => []),
    getEditors: jest.fn(() => []),
    subscribeDocuments: jest.fn(() => () => {}),
  };
  const lookup = jest.fn(async () => ["second", "first", "first"]);
  const resolver = new BlockReferenceResolver(source, { lookupDocumentIds: lookup });
  expect(await resolver.resolveBlock({ documentId: "absent", blockId: "target" })).toEqual({
    documentId: "first",
    ambiguous: true,
  });
  expect(await resolver.resolveBlock({ documentId: "second", blockId: "target" })).toEqual({
    documentId: "second",
    ambiguous: false,
  });
  expect(source.getEditors).not.toHaveBeenCalled();
  resolver.destroy();
  await expect(resolver.resolveBlock({ documentId: "first", blockId: "target" })).rejects.toThrow(
    "destroyed",
  );
});

import { EdgelessCanvasAdapter } from "./canvas-adapter";

/**
 * Rejects document reads in a selection query that does not contain any blocks.
 *
 * @returns Never returns: a call means an unnecessary document traversal occurred.
 * @throws For any attempted read or subscription in the empty-selection query.
 */
function unexpectedRead(): never {
  throw new Error("Empty block selection must not traverse the document");
}

test("object-only selection does not read roots, ancestors or element lists for card pinning", () => {
  const adapter = new EdgelessCanvasAdapter({
    blocks: { getRootIds: unexpectedRead, getParentId: unexpectedRead },
    elements: { getElementNode: unexpectedRead, getElementNodes: unexpectedRead },
    selection: { get: unexpectedRead, subscribe: unexpectedRead },
    editor: {
      subscribe: unexpectedRead,
      elementTypes: { get: unexpectedRead, subscribe: unexpectedRead },
    },
  });
  expect(adapter.getCardIdsForBlocks([])).toEqual([]);
});

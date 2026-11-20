import { BlockSelectionRanges } from "../block-selection-ranges";

it("builds directed coverage using only lengths in the selected interval", () => {
  const lengths: Record<string, number | undefined> = { first: 5, empty: 0, last: 4 };
  const getTextLength = jest.fn((id: string) => lengths[id]);
  const source = {
    getSelectableBlockIds: () => ["outside", "first", "empty", "image", "last", "later"],
    getTextLength,
  };
  const selection = BlockSelectionRanges.createFromPositions(
    source,
    { blockId: "last", offset: 3 },
    { blockId: "first", offset: 1 },
  );
  expect(selection).toEqual({
    type: "selection",
    blocks: [
      { id: "first", start: 1, end: 5 },
      { id: "empty", start: 0, end: 0 },
      { id: "image", start: 0, end: -1 },
      { id: "last", start: 0, end: 3 },
    ],
    anchorBlockId: "last",
    focusBlockId: "first",
    reversed: false,
  });
  expect(getTextLength.mock.calls.map(([id]) => id)).toEqual(["first", "empty", "image", "last"]);
  getTextLength.mockClear();
  expect(
    BlockSelectionRanges.createFromPositions(
      source,
      { blockId: "missing", offset: 0 },
      { blockId: "first", offset: 0 },
    ),
  ).toBeUndefined();
  expect(getTextLength).not.toHaveBeenCalled();
});

it("retains the direction of a reversed selection within one block", () => {
  const source = {
    getSelectableBlockIds: () => ["text"],
    getTextLength: () => 5,
  };
  expect(
    BlockSelectionRanges.createFromPositions(
      source,
      { blockId: "text", offset: 4 },
      { blockId: "text", offset: 1 },
    ),
  ).toEqual({
    type: "selection",
    blocks: [{ id: "text", start: 1, end: 4 }],
    anchorBlockId: "text",
    focusBlockId: "text",
    reversed: true,
  });
});

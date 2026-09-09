import {
  createBlockSelection,
  createSelectionItems,
} from "../managers";

const blocks = [
  { id: "first", length: 10 },
  { id: "second", length: 20 },
  { id: "third", length: 30 },
  { id: "fourth", length: 40 },
];

describe("cross-block selection items", () => {
  it("creates an inclusive block range while preserving reverse direction", () => {
    expect(createBlockSelection(["a", "b", "c", "d"], "d", "b")).toEqual([{
      type: "block",
      blockIds: ["b", "c", "d"],
      anchorBlockId: "d",
      focusBlockId: "b",
    }]);
  });

  it("preserves top-down direction and selects complete middle blocks", () => {
    expect(createSelectionItems(
      blocks,
      { blockId: "first", offset: 4 },
      { blockId: "fourth", offset: 8 },
    )).toEqual([{
      type: "block", blockIds: ["first", "second", "third", "fourth"],
      anchorBlockId: "first", focusBlockId: "fourth",
    }]);
  });

  it("preserves bottom-up direction while keeping block IDs ordered", () => {
    expect(createSelectionItems(
      blocks,
      { blockId: "fourth", offset: 8 },
      { blockId: "first", offset: 4 },
    )).toEqual([{
      type: "block", blockIds: ["first", "second", "third", "fourth"],
      anchorBlockId: "fourth", focusBlockId: "first",
    }]);
  });

  it("selects adjacent blocks completely", () => {
    expect(createSelectionItems(
      blocks,
      { blockId: "second", offset: 2 },
      { blockId: "third", offset: 3 },
    )).toEqual([{
      type: "block", blockIds: ["second", "third"],
      anchorBlockId: "second", focusBlockId: "third",
    }]);
  });
});

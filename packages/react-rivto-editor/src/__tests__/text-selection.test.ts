import {
  createVisibleStructuralSelection,
  createTextSelection,
  resolveSelectionEndpoints,
} from "../managers";

const blocks = [
  { id: "first", length: 10 },
  { id: "second", length: 20 },
  { id: "third", length: 30 },
  { id: "fourth", length: 40 },
];

describe("cross-block selection items", () => {
  it("creates an inclusive block range while preserving reverse direction", () => {
    expect(createVisibleStructuralSelection(["a", "b", "c", "d"], "d", "b")).toEqual({
      type: "selection",
      blocks: [
        { id: "b", start: 0, end: -1 },
        { id: "c", start: 0, end: -1 },
        { id: "d", start: 0, end: -1 },
      ],
      anchorBlockId: "d",
      focusBlockId: "b",
    });
  });

  it("preserves top-down direction and selects complete middle blocks", () => {
    expect(createTextSelection(
      blocks,
      { blockId: "first", offset: 4 },
      { blockId: "fourth", offset: 8 },
    )).toEqual({
      type: "selection",
      blocks: [
        { id: "first", start: 4, end: 10 },
        { id: "second", start: 0, end: 20 },
        { id: "third", start: 0, end: 30 },
        { id: "fourth", start: 0, end: 8 },
      ],
      anchorBlockId: "first",
      focusBlockId: "fourth",
      reversed: false,
    });
  });

  it("preserves bottom-up direction while keeping block IDs ordered", () => {
    const selection = createTextSelection(
      blocks,
      { blockId: "fourth", offset: 8 },
      { blockId: "first", offset: 4 },
    )!;
    expect(selection).toEqual({
      type: "selection",
      blocks: [
        { id: "first", start: 4, end: 10 },
        { id: "second", start: 0, end: 20 },
        { id: "third", start: 0, end: 30 },
        { id: "fourth", start: 0, end: 8 },
      ],
      anchorBlockId: "fourth",
      focusBlockId: "first",
      reversed: false,
    });
    expect(resolveSelectionEndpoints(
      selection,
      (id) => blocks.find((block) => block.id === id)?.length ?? 0,
    )).toEqual({
      anchor: { blockId: "fourth", offset: 8 },
      head: { blockId: "first", offset: 4 },
    });
  });

  it("keeps exact text offsets across adjacent blocks", () => {
    expect(createTextSelection(
      blocks,
      { blockId: "second", offset: 2 },
      { blockId: "third", offset: 3 },
    )).toEqual({
      type: "selection",
      blocks: [
        { id: "second", start: 2, end: 20 },
        { id: "third", start: 0, end: 3 },
      ],
      anchorBlockId: "second",
      focusBlockId: "third",
      reversed: false,
    });
  });
});

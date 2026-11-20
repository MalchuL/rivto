import { BlockTextSelectionGesture } from "../block-text-selection-gesture";

it("maps Root gesture endpoints to block positions and delegates restoration", () => {
  const rootGesture = {
    readAnchor: jest.fn(() => ({ ownerId: "first", offset: 1 })),
    readHead: jest.fn(() => ({ ownerId: "second", offset: 2 })),
    hasAnchor: jest.fn(() => true),
    hasPendingHead: jest.fn(() => true),
    hasHead: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
    commitHead: jest.fn(),
    setAnchor: jest.fn(() => true),
    restore: jest.fn(),
  };
  const gesture = new BlockTextSelectionGesture(rootGesture);
  expect(gesture.readAnchor(1, 2)).toEqual({ blockId: "first", offset: 1 });
  expect(gesture.readHead(3, 4)).toEqual({ blockId: "second", offset: 2 });
  expect(gesture.hasHead()).toBe(false);
  gesture.commitHead(true);
  expect(gesture.hasHead()).toBe(true);
  gesture.restore();
  expect(rootGesture.commitHead).toHaveBeenCalledWith(true);
  expect(rootGesture.restore).toHaveBeenCalledTimes(1);
  expect(Object.values(gesture)).toEqual([]);
});

it("maps an existing selection anchor to the Root owner identity", () => {
  const rootGesture = {
    readAnchor: jest.fn(),
    readHead: jest.fn(),
    hasAnchor: jest.fn(() => true),
    hasPendingHead: jest.fn(() => true),
    hasHead: jest.fn(() => true),
    commitHead: jest.fn(),
    setAnchor: jest.fn(() => true),
    restore: jest.fn(),
  };
  const gesture = new BlockTextSelectionGesture(rootGesture);
  expect(gesture.setAnchor({ blockId: "first", offset: 1 })).toBe(true);
  expect(rootGesture.setAnchor).toHaveBeenCalledWith({ ownerId: "first", offset: 1 });
});

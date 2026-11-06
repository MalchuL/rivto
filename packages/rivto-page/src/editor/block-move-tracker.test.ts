import { BlockMoveTracker } from "./block-move-tracker";

test("keeps overlapping move marks until each owner releases them", () => {
  const tracker = new BlockMoveTracker();
  const first = tracker.mark(["a", "b"]);
  const second = tracker.mark(["a"]);
  first();
  first();
  expect(tracker.has("a")).toBe(true);
  expect(tracker.has("b")).toBe(false);
  second();
  expect(tracker.has("a")).toBe(false);
});

test("ignores stale releases after the controller clears its marks", () => {
  const tracker = new BlockMoveTracker();
  const old = tracker.mark(["a"]);
  tracker.clear();
  const current = tracker.mark(["a"]);
  old();
  expect(tracker.has("a")).toBe(true);
  current();
  expect(tracker.has("a")).toBe(false);
});

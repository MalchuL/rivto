import { createHtmlEditingStore } from "./use-html-editing";

test("editing is scoped to an installation and released after its last observer", () => {
  const first = createHtmlEditingStore();
  const second = createHtmlEditingStore();
  let changes = 0;
  const changed = () => {
    changes += 1;
  };
  const release = first.subscribe("block:one", changed);
  const releaseSlot = first.subscribe("block:one", () => {});
  const releaseElement = first.subscribe("element:one", () => {});
  first.set("block:one", true);
  expect(first.get("block:one")).toBe(true);
  expect(first.get("element:one")).toBe(false);
  expect(second.get("block:one")).toBe(false);
  expect(changes).toBe(1);
  release();
  expect(first.get("block:one")).toBe(true);
  releaseSlot();
  expect(first.get("block:one")).toBe(false);
  releaseElement();
});

import { BrowserInputRoot } from "../browser-input-root";

it("reports the lifetime of an attachment independently of a later mount", () => {
  const element = document.createElement("div");
  const oldRoot = new BrowserInputRoot(element);
  expect(oldRoot.isAttached()).toBe(true);
  oldRoot.detach();
  const newRoot = new BrowserInputRoot(element);
  expect(oldRoot.isAttached()).toBe(false);
  expect(newRoot.isAttached()).toBe(true);
  oldRoot.detach();
  expect(newRoot.isAttached()).toBe(true);
  newRoot.detach();
  expect(newRoot.isAttached()).toBe(false);
});

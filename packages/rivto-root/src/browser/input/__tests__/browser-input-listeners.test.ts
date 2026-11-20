import { BrowserInputListeners } from "../browser-input-listeners";

it("delivers normalized input and retains registrations across attachments", () => {
  const input = new BrowserInputListeners();
  const root = document.createElement("div");
  const child = document.createElement("button");
  root.append(child);
  const received: number[] = [];
  input.register({ type: "click", target: "root", capture: false }, (event) => {
    received.push(event.clientX);
    expect(event.target?.hasAncestor("button")).toBe(true);
    expect(event).not.toHaveProperty("raw");
    event.preventDefault();
  });
  const detach = input.attach(root);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 42 });
  child.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  detach();
  const detachAgain = input.attach(root);
  detach();
  child.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 12 }));
  expect(received).toEqual([42, 12]);
  detachAgain();
});

it("isolates root listeners across nested attached occurrences", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  outer.append(inner);
  const parent = new BrowserInputListeners();
  const child = new BrowserInputListeners();
  const parentHandler = jest.fn();
  const childHandler = jest.fn();
  parent.register({ type: "click", target: "root", capture: false }, parentHandler);
  child.register({ type: "click", target: "root", capture: false }, childHandler);
  const detachParent = parent.attach(outer);
  const detachChild = child.attach(inner);
  inner.click();
  expect(parentHandler).not.toHaveBeenCalled();
  expect(childHandler).toHaveBeenCalledTimes(1);
  detachChild();
  inner.click();
  expect(parentHandler).toHaveBeenCalledTimes(1);
  detachParent();
});

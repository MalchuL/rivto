import { BrowserInputRoot } from "../browser-input-root";

it("observes nested input and releases the listener after detachment", () => {
  const element = document.createElement("div");
  const child = document.createElement("button");
  element.append(child);
  const root = new BrowserInputRoot(element);
  const input = jest.fn();
  const remove = jest.spyOn(element, "removeEventListener");
  const release = root.observeInput("keydown", input)!;
  child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
  expect(input).toHaveBeenCalledTimes(1);
  root.detach();
  child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "b" }));
  expect(input).toHaveBeenCalledTimes(1);
  release();
  release();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(root.observeInput("keydown", input)).toBeUndefined();
});

it("distinguishes a missing focus target from one outside the occurrence", () => {
  const element = document.createElement("div");
  const child = document.createElement("button");
  const outside = document.createElement("button");
  element.append(child);
  const root = new BrowserInputRoot(element);
  const transitions: Array<[boolean, boolean]> = [];
  const release = root.observeInput("focusout", (input) => {
    transitions.push([input.hasRelatedTarget, input.relatedTarget?.belongsToRoot() ?? false]);
  })!;
  child.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  child.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: element }));
  child.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));
  child.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document }));
  expect(transitions).toEqual([
    [false, false],
    [true, true],
    [true, false],
    [true, false],
  ]);
  release();
  root.detach();
});

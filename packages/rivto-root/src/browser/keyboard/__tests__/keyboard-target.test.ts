import { captureKeyboardTarget } from "../capture-keyboard-target";

it("queries live target ancestry and direct surface identity", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="one"><span data-content><button></button></span></div>';
  const block = root.querySelector<HTMLElement>("[data-block-id]")!;
  const button = root.querySelector("button")!;
  const event = new KeyboardEvent("keydown");
  Object.defineProperty(event, "target", { configurable: true, value: button });
  const target = captureKeyboardTarget(event, root);
  expect(target.isRoot()).toBe(false);
  expect(target.isCurrentRealmElement()).toBe(true);
  expect(target.read()?.isFormControl).toBe(true);
  expect(target.hasAncestor("[data-content]")).toBe(true);
  expect(
    target.closestAncestorAttribute("[data-content]", "[data-block-id]", "data-block-id"),
  ).toBe("one");
  block.setAttribute("data-block-id", "two");
  expect(
    target.closestAncestorAttribute("[data-content]", "[data-block-id]", "data-block-id"),
  ).toBe("two");
  Object.defineProperty(event, "target", { configurable: true, value: root });
  const rootTarget = captureKeyboardTarget(event, root);
  expect(target.isRoot()).toBe(false);
  expect(rootTarget.isRoot()).toBe(true);
  expect(rootTarget.hasAncestor("[data-content]")).toBe(false);
});

it("accepts foreign elements for properties and text nodes for ancestry", () => {
  const root = document.createElement("div");
  const frame = document.createElement("iframe");
  document.body.append(frame);
  try {
    const foreign = frame.contentDocument!.createElement("a");
    const event = new KeyboardEvent("keydown");
    Object.defineProperty(event, "target", { configurable: true, value: foreign });
    const target = captureKeyboardTarget(event, root);
    expect(target.isCurrentRealmElement()).toBe(false);
    expect(target.read()?.isCurrentRealmHTMLElement).toBe(false);
    expect(target.read()?.isLink).toBe(true);
    root.innerHTML = "<span data-content>text</span>";
    Object.defineProperty(event, "target", {
      configurable: true,
      value: root.querySelector("span")!.firstChild,
    });
    const textTarget = captureKeyboardTarget(event, root);
    expect(textTarget.isCurrentRealmElement()).toBe(false);
    expect(textTarget.read()).toBeUndefined();
    expect(textTarget.hasAncestor("[data-content]")).toBe(true);
  } finally {
    frame.remove();
  }
});

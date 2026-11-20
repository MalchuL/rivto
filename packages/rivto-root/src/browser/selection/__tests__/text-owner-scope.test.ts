import { BrowserInputRoot } from "../../input/browser-input-root";

const query = {
  ownerSelector: "[data-owner]",
  ownerAttribute: "data-owner",
  contentSelector: "[data-content]",
  boundarySelector: "[data-panel]",
};

it("captures a local scope and distinguishes direct content from nested owner content", () => {
  const element = document.createElement("div");
  element.setAttribute("data-panel", "");
  element.innerHTML = `
    <div data-scope="first" tabindex="-1">
      <div data-owner="structural"><div data-owner="child"><span data-content></span></div></div>
      <div data-owner="editable"><span data-content></span></div>
      <div data-panel><div data-owner="embedded"></div></div>
      <div data-owner="current&amp;[1]"></div>
    </div>
    <div data-scope="second"><div data-owner="outside"></div></div>`;
  const scopeElement = element.querySelector<HTMLElement>('[data-scope="first"]')!;
  const focus = jest.spyOn(scopeElement, "focus");
  const root = new BrowserInputRoot(element);
  const scope = root.captureTextOwnerScope(query, "current&[1]", "[data-scope]")!;
  expect(scope.hasContentlessOwner("structural")).toBe(true);
  expect(scope.hasContentlessOwner("editable")).toBe(false);
  expect(scope.hasContentlessOwner("embedded")).toBe(false);
  expect(scope.hasContentlessOwner("outside")).toBe(false);
  element.querySelector('[data-owner="current&[1]"]')!.remove();
  scope.focus();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  root.detach();
  focus.mockClear();
  scope.focus();
  expect(focus).not.toHaveBeenCalled();
  expect(scope.hasContentlessOwner("structural")).toBe(false);
});

it("rejects a scope if its owner moves to another occurrence during capture", () => {
  const element = document.createElement("div");
  element.setAttribute("data-panel", "");
  element.innerHTML = '<div data-owner="current"></div><div data-panel></div>';
  const owner = element.querySelector('[data-owner="current"]')!;
  const nested = element.querySelector("[data-panel]")!;
  const read = owner.getAttribute.bind(owner);
  jest.spyOn(owner, "getAttribute").mockImplementation((name) => {
    const value = read(name);
    nested.append(owner);
    return value;
  });
  const root = new BrowserInputRoot(element);
  expect(root.captureTextOwnerScope(query, "current", "[data-scope]")).toBeUndefined();
  root.detach();
});

it("uses the occurrence when the scope owner is not rendered", () => {
  const element = document.createElement("div");
  element.setAttribute("data-panel", "");
  element.innerHTML = '<div data-owner="structural"></div>';
  const focus = jest.spyOn(element, "focus");
  const root = new BrowserInputRoot(element);
  const scope = root.captureTextOwnerScope(query, "missing", "[data-scope]")!;
  expect(scope.hasContentlessOwner("structural")).toBe(true);
  scope.focus();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  root.detach();
});

it("withdraws a captured scope when it moves into a nested occurrence", () => {
  const element = document.createElement("div");
  element.setAttribute("data-panel", "");
  element.innerHTML = `
    <div data-scope tabindex="-1"><div data-owner="current"></div><div data-owner="other"></div></div>
    <div data-panel></div>`;
  const scopeElement = element.querySelector<HTMLElement>("[data-scope]")!;
  const focus = jest.spyOn(scopeElement, "focus");
  const root = new BrowserInputRoot(element);
  const scope = root.captureTextOwnerScope(query, "current", "[data-scope]")!;
  element.querySelector("[data-panel]")!.append(scopeElement);
  expect(scope.hasContentlessOwner("other")).toBe(false);
  scope.focus();
  expect(focus).not.toHaveBeenCalled();
  root.detach();
});

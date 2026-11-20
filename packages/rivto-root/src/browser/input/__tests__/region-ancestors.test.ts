import { BrowserInputRoot } from "../browser-input-root";
import { inputElementIdentity } from "../input-element-identity";

it("visits owned ancestors in order through the boundary", () => {
  const rootElement = document.createElement("div");
  const boundary = document.createElement("section");
  const parent = document.createElement("div");
  const hit = document.createElement("span");
  rootElement.append(boundary);
  boundary.append(parent);
  parent.append(hit);
  parent.setAttribute("data-owner", "");
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    const captured = root.captureRegionByIdentity(inputElementIdentity(hit))!;
    const limit = root.captureRegionByIdentity(inputElementIdentity(boundary))!;
    const visited: object[] = [];
    expect(
      captured.someAncestorWithin(limit, (region) => {
        visited.push(region.getIdentity()!);
        return region.matches("[data-owner]") === true;
      }),
    ).toBe(true);
    expect(visited).toEqual([inputElementIdentity(hit), inputElementIdentity(parent)]);
    const all: object[] = [];
    expect(
      captured.someAncestorWithin(limit, (region) => {
        all.push(region.getIdentity()!);
        return false;
      }),
    ).toBe(false);
    expect(all).toEqual([
      inputElementIdentity(hit),
      inputElementIdentity(parent),
      inputElementIdentity(boundary),
    ]);
    expect(limit.someAncestorWithin(captured, () => true)).toBe(false);
  } finally {
    root.detach();
    rootElement.remove();
  }
});

it("discards an ancestor result when its hit moves during the visit", () => {
  const rootElement = document.createElement("div");
  const boundary = document.createElement("section");
  const hit = document.createElement("span");
  rootElement.append(boundary);
  boundary.append(hit);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    const captured = root.captureRegionByIdentity(inputElementIdentity(hit))!;
    const limit = root.captureRegionByIdentity(inputElementIdentity(boundary))!;
    expect(
      captured.someAncestorWithin(limit, () => {
        rootElement.append(hit);
        return true;
      }),
    ).toBeUndefined();
    root.detach();
    expect(captured.matches("span")).toBeUndefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});

it("discards a result when the hit moves between branches inside the boundary", () => {
  const rootElement = document.createElement("div");
  const boundary = document.createElement("section");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const hit = document.createElement("span");
  rootElement.append(boundary);
  boundary.append(first, second);
  first.append(hit);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    const captured = root.captureRegionByIdentity(inputElementIdentity(hit))!;
    const limit = root.captureRegionByIdentity(inputElementIdentity(boundary))!;
    expect(
      captured.someAncestorWithin(limit, () => {
        second.append(hit);
        return true;
      }),
    ).toBeUndefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});

it("detects an earlier descendant moving while a higher ancestor is visited", () => {
  const rootElement = document.createElement("div");
  const boundary = document.createElement("section");
  const parent = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const hit = document.createElement("span");
  rootElement.append(boundary);
  boundary.append(parent);
  parent.append(first, second);
  first.append(hit);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    const captured = root.captureRegionByIdentity(inputElementIdentity(hit))!;
    const limit = root.captureRegionByIdentity(inputElementIdentity(boundary))!;
    expect(
      captured.someAncestorWithin(limit, (region) => {
        if (region.getIdentity() === inputElementIdentity(parent)) {
          second.append(hit);
          return true;
        }
        return false;
      }),
    ).toBeUndefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});

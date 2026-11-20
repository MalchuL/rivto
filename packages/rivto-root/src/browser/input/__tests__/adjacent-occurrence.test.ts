import { BrowserInputRoot } from "../browser-input-root";

const query = {
  ownerSelector: "[data-owner]",
  ownerAttribute: "data-owner",
  contentSelector: "[data-content]",
  boundarySelector: "[data-panel]",
};

it("discovers top-level occurrences and reads their first and last editable owners", () => {
  const source = document.createElement("div");
  const target = document.createElement("div");
  source.setAttribute("data-page", "");
  target.setAttribute("data-page", "");
  target.setAttribute("data-panel", "");
  target.innerHTML = `
    <div data-owner="empty"></div>
    <div data-owner="first"><span data-content>First</span></div>
    <div data-panel data-page><div data-owner="nested"><span data-content>Hidden</span></div></div>
    <div data-owner="last"><span data-content>Last</span></div>`;
  document.body.append(source, target);
  const root = new BrowserInputRoot(source);
  const targetRoot = new BrowserInputRoot(target);
  try {
    const adjacent = root.findAdjacentOccurrence("[data-page]", "next")!;
    expect(adjacent.identity).toBe(targetRoot.getElementIdentity());
    expect(adjacent.readEdgeTextPosition(query, "first")).toEqual({ ownerId: "first", offset: 0 });
    expect(adjacent.readEdgeTextPosition(query, "last")).toEqual({ ownerId: "last", offset: 4 });
    expect(targetRoot.findAdjacentOccurrence("[data-page]", "previous")?.identity).toBe(
      root.getElementIdentity(),
    );
    target.remove();
    expect(adjacent.isCurrent()).toBe(false);
    expect(adjacent.readEdgeTextPosition(query, "last")).toBeUndefined();
  } finally {
    root.detach();
    targetRoot.detach();
    source.remove();
    target.remove();
  }
});

it("rejects nested sources and invalidates a destination moved into another page", () => {
  const source = document.createElement("div");
  const target = document.createElement("div");
  source.setAttribute("data-page", "");
  target.setAttribute("data-page", "");
  document.body.append(source, target);
  const root = new BrowserInputRoot(source);
  try {
    const adjacent = root.findAdjacentOccurrence("[data-page]", "next")!;
    source.append(target);
    expect(adjacent.isCurrent()).toBe(false);
    expect(
      new BrowserInputRoot(target).findAdjacentOccurrence("[data-page]", "previous"),
    ).toBeUndefined();
  } finally {
    root.detach();
    source.remove();
  }
});

it("rejects a destination nested during the source attachment check", () => {
  const source = document.createElement("div");
  const target = document.createElement("div");
  source.setAttribute("data-page", "");
  target.setAttribute("data-page", "");
  document.body.append(source, target);
  let armed = false;
  let checks = 0;
  const root = new BrowserInputRoot(source, () => {
    if (armed && ++checks === 2) {
      source.append(target);
    }
    return true;
  });
  try {
    const adjacent = root.findAdjacentOccurrence("[data-page]", "next")!;
    armed = true;
    expect(adjacent.isCurrent()).toBe(false);
  } finally {
    root.detach();
    source.remove();
    target.remove();
  }
});

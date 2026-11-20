import { BrowserInputRoot } from "../browser-input-root";

it("projects nested hits onto their outer owner and captures owned descendants", () => {
  const root = document.createElement("div");
  root.setAttribute("data-editor", "");
  root.innerHTML =
    '<div data-owner="parent"><section><div data-row></div></section><div data-editor><div data-owner="foreign"><span></span></div></div><div data-owner="child"><div data-row></div></div></div>';
  const hit = root.querySelector("span")!;
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => hit });
  const inputRoot = new BrowserInputRoot(root);
  try {
    const result = inputRoot.capturePoint({
      x: 2,
      y: 3,
      ownerSelector: "[data-owner]",
      boundarySelector: "[data-editor]",
    })!;
    expect(result.owner).not.toHaveProperty("element");
    expect(result.target).not.toHaveProperty("element");
    expect(result.owner.readAttribute("data-owner")).toBe("parent");
    expect(result.owner.findOwnedRegion("[data-row]", "[data-owner], [data-editor]")).toBeDefined();
    expect(
      result.owner
        .findRegions("[data-owner]", "[data-editor]")
        .map((region) => region.readAttribute("data-owner")),
    ).toEqual(["child"]);
    const identity = result.owner.getIdentity()!;
    expect(inputRoot.captureRegionByIdentity(identity)?.isSame(result.owner)).toBe(true);
    let borrowerCurrent = true;
    const borrowed = inputRoot.captureRegionByIdentity(identity, () => borrowerCurrent)!;
    borrowerCurrent = false;
    expect(borrowed.getIdentity()).toBeUndefined();
    expect(inputRoot.captureRegionByIdentity(identity)?.getIdentity()).toBe(identity);
    inputRoot.detach();
    expect(inputRoot.captureRegionByIdentity(identity)).toBeUndefined();
    expect(result.owner.getIdentity()).toBeUndefined();
  } finally {
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    inputRoot.detach();
  }
});

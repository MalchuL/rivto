import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockLayoutRegions } from "../../../presentation/components/block-layout/block-layout-regions";
import { BlockPointerHitTest } from "../block-pointer-hit-test";

it("uses registered custom rows and body slots for nested structural hits", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="parent"><header></header><aside><span></span></aside><main><div data-block-id="child"><section></section></div></main></div>';
  const parent = root.querySelector<HTMLElement>('[data-block-id="parent"]')!;
  const child = root.querySelector<HTMLElement>('[data-block-id="child"]')!;
  const row = parent.querySelector<HTMLElement>("header")!;
  const body = parent.querySelector<HTMLElement>("aside")!;
  const childRow = child.querySelector<HTMLElement>("section")!;
  const regions = new BlockLayoutRegions();
  const releases = [
    regions.register("parent", "shell", getBrowserElementIdentity(parent)),
    regions.register("parent", "row", getBrowserElementIdentity(row)),
    regions.register("parent", "body", getBrowserElementIdentity(body)),
    regions.register("child", "shell", getBrowserElementIdentity(child)),
    regions.register("child", "row", getBrowserElementIdentity(childRow)),
  ];
  const inputRoot = new BrowserInputRoot(root);
  const hit = new BlockPointerHitTest(inputRoot, regions);
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  let target: Element = body.querySelector("span")!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
  try {
    expect(hit.readBlockIdAtPoint(10, 10)).toBe("parent");
    target = parent.querySelector("main")!;
    expect(hit.readBlockIdAtPoint(10, 10)).toBe("child");
    releases[1]!();
    expect(hit.readBlockIdAtPoint(10, 10)).toBe("parent");
    inputRoot.detach();
    expect(hit.readBlockIdAtPoint(10, 10)).toBeUndefined();
  } finally {
    releases.forEach((release) => release());
    regions.destroy();
    inputRoot.detach();
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

it("snaps a wrapping-parent hit to the nearest owned descendant row", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="parent"><div class="rivto-block-row"></div><main><div data-block-id="first"><div class="rivto-block-row"></div></div><div data-block-id="second"><div class="rivto-block-row"></div></div><div data-rivto-block-editor><div data-block-id="foreign"><div class="rivto-block-row"></div></div></div></main></div>';
  const rows = root.querySelectorAll<HTMLElement>(".rivto-block-row");
  jest
    .spyOn(rows[1]!, "getBoundingClientRect")
    .mockReturnValue({ left: 0, top: 0, width: 50, height: 10 } as DOMRect);
  jest
    .spyOn(rows[2]!, "getBoundingClientRect")
    .mockReturnValue({ left: 0, top: 20, width: 50, height: 10 } as DOMRect);
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => root.querySelector("main"),
  });
  const inputRoot = new BrowserInputRoot(root);
  try {
    const hit = new BlockPointerHitTest(inputRoot, new BlockLayoutRegions());
    expect(hit.readBlockIdAtPoint(10, 24)).toBe("second");
    expect(hit.readBlockIdAtPoint(10, 15)).toBe("first");
  } finally {
    inputRoot.detach();
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

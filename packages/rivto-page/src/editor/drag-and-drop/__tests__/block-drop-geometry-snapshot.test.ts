import { readDropGeometry } from "../block-drop-region-geometry";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";

it("retains detached bounds and layout values for the current geometry query", () => {
  const element = document.createElement("div");
  element.style.direction = "rtl";
  element.style.setProperty("--rivto-drop-target-size", "16px");
  element.style.setProperty("--rivto-block-indent", "24px");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const bounds = {
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 110,
    bottom: 70,
    width: 100,
    height: 50,
    toJSON: () => ({}),
  };
  jest.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds);
  try {
    const region = root.captureRegionByIdentity(getBrowserElementIdentity(element))!;
    const geometry = readDropGeometry(region)!;
    element.style.direction = "ltr";
    element.style.setProperty("--rivto-block-indent", "40px");
    bounds.left = 30;
    expect(geometry.direction).toBe("rtl");
    expect(geometry.targetSize.trim()).toBe("16px");
    expect(geometry.indent.trim()).toBe("24px");
    expect(geometry.rect.left).toBe(10);
    expect(geometry.rect).not.toBe(bounds);
    expect(geometry).not.toHaveProperty("style");
  } finally {
    root.detach();
    element.remove();
  }
});

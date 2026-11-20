import { getBrowserPrimaryModifier } from "../platform";

it("uses the browser platform to select the primary shortcut modifier", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "platform");
  try {
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    expect(getBrowserPrimaryModifier()).toBe("meta");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux x86_64" });
    expect(getBrowserPrimaryModifier()).toBe("ctrl");
  } finally {
    if (original) {
      Object.defineProperty(navigator, "platform", original);
    } else {
      Reflect.deleteProperty(navigator, "platform");
    }
  }
});

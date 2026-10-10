/**
 * Shortcut parser and platform-Primary matching.
 *
 * @module
 */
import { matchesShortcut, parseShortcut, resolvePrimaryModifier } from "./shortcut";

describe("parseShortcut", () => {
  test("accepts a named Plus key and rejects empty or duplicate parts", () => {
    expect(parseShortcut("Shift+Plus")).toMatchObject({ key: "+", shift: true });
    expect(() => parseShortcut("Ctrl++")).toThrow(/Invalid keyboard shortcut/);
    expect(() => parseShortcut("Ctrl+Ctrl+z")).toThrow(/Duplicate keyboard modifier/);
    expect(() => parseShortcut("")).toThrow(/Invalid keyboard shortcut/);
  });
});

describe("Primary modifier", () => {
  const originalPlatform = navigator.platform;

  afterEach(() => {
    Object.defineProperty(navigator, "platform", { configurable: true, value: originalPlatform });
  });

  test("matches only the platform exclusive modifier", () => {
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    expect(resolvePrimaryModifier()).toBe("meta");
    const shortcut = parseShortcut("Primary+z");
    expect(matchesShortcut(shortcut, {
      key: "z",
      code: "KeyZ",
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent)).toBe(true);
    expect(matchesShortcut(shortcut, {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent)).toBe(false);

    Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux x86_64" });
    expect(resolvePrimaryModifier()).toBe("ctrl");
    expect(matchesShortcut(parseShortcut("Primary+z"), {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent)).toBe(true);
    expect(matchesShortcut(parseShortcut("Primary+z"), {
      key: "z",
      code: "KeyZ",
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent)).toBe(false);
  });
});

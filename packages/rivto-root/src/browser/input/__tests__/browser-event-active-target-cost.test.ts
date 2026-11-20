import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it.each([2, 40])("checks only Roots in the receiving document among %i documents", (count) => {
  const checks = Array.from({ length: count }, () => 0);
  const elements = Array.from({ length: count }, (_, index) => {
    const document = window.document.implementation.createHTMLDocument(`document ${index}`);
    const element = document.createElement("div");
    document.body.append(element);
    return element;
  });
  const roots = elements.map(
    (element, index) =>
      new BrowserInputRoot(element, () => {
        checks[index]!++;
        return true;
      }),
  );
  let deliveries = 0;
  const listeners = new BrowserEventListeners(() => {
    deliveries++;
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "document", capture: false, passive: false }],
      new Set(roots),
    );
    checks.fill(0);
    elements.at(-1)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toBe(1);
    expect(checks.slice(0, -1)).toEqual(Array(count - 1).fill(0));
    expect(checks.at(-1)).toBe(1);
  } finally {
    listeners.disconnect();
    roots.forEach((root) => root.detach());
  }
});

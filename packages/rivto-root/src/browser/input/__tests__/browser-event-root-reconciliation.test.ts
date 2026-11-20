import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("rejects a detached root without disturbing existing listener connections", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const firstRoot = new BrowserInputRoot(first);
  const staleRoot = new BrowserInputRoot(second);
  const groups = [{ type: "click", target: "surface" as const, capture: false, passive: false }];
  const seen: object[] = [];
  const listeners = new BrowserEventListeners((_group, identity) => {
    if (identity) {
      seen.push(identity);
    }
  }, []);
  try {
    listeners.connect(groups, new Set([firstRoot]));
    staleRoot.detach();
    expect(() => listeners.connect(groups, new Set([firstRoot, staleRoot]))).toThrow(
      "Browser event listeners require active browser roots",
    );
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(firstRoot.getElementIdentity());
  } finally {
    listeners.disconnect();
    firstRoot.detach();
    staleRoot.detach();
    first.remove();
    second.remove();
  }
});

it("retains a native connection when the same surface receives a replacement Root", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const first = new BrowserInputRoot(element);
  const replacement = new BrowserInputRoot(element);
  const groups = [{ type: "click", target: "surface" as const, capture: false, passive: false }];
  const identities: Array<object | undefined> = [];
  const listeners = new BrowserEventListeners((_group, identity) => {
    identities.push(identity);
  }, []);
  const add = jest.spyOn(element, "addEventListener");
  const remove = jest.spyOn(element, "removeEventListener");
  try {
    listeners.connect(groups, new Set([first]));
    listeners.connect(groups, new Set([replacement]));
    first.detach();
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(identities).toHaveLength(1);
    expect(identities[0]).toBe(replacement.getElementIdentity());
  } finally {
    listeners.disconnect();
    first.detach();
    replacement.detach();
    add.mockRestore();
    remove.mockRestore();
    element.remove();
  }
});

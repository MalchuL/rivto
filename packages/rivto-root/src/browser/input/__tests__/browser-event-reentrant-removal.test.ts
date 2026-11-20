import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it.each(["reconciliation", "disconnection"])(
  "keeps replacement listeners during %s",
  (operation) => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = new BrowserInputRoot(element);
    const groups = ["click", "keydown"].map((type) => ({
      type,
      target: "surface" as const,
      capture: false,
      passive: false,
    }));
    const seen: string[] = [];
    const listeners = new BrowserEventListeners((group) => seen.push(group.type), []);
    const originalRemove = element.removeEventListener.bind(element);
    let reconnect = true;
    const remove = jest
      .spyOn(element, "removeEventListener")
      .mockImplementation((type, listener, options) => {
        originalRemove(type, listener, options);
        if (reconnect) {
          reconnect = false;
          listeners.connect(groups, new Set([root]));
        }
      });
    try {
      listeners.connect(groups, new Set([root]));
      if (operation === "reconciliation") {
        listeners.connect([], new Set([root]));
      } else {
        listeners.disconnect();
      }
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
      expect(seen).toEqual(["click", "keydown"]);
    } finally {
      remove.mockRestore();
      listeners.disconnect();
      root.detach();
      element.remove();
    }
  },
);

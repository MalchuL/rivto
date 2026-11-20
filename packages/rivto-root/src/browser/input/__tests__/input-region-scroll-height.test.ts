import { createBrowserInputRegion } from "../input-region";

it("measures content with its container unconstrained and restores the inline height", () => {
  const root = document.createElement("div");
  const container = document.createElement("div");
  const content = document.createElement("div");
  root.append(container);
  container.append(content);
  container.style.setProperty("height", "120px", "important");
  Object.defineProperty(content, "scrollHeight", {
    get: () => {
      expect(container.style.height).toBe("auto");
      return 245;
    },
  });
  const host = createBrowserInputRegion(root, container, () => true);
  const region = createBrowserInputRegion(root, content, () => true);
  expect(region.readUnconstrainedScrollHeight(host)).toBe(245);
  expect(container.style.getPropertyValue("height")).toBe("120px");
  expect(container.style.getPropertyPriority("height")).toBe("important");
});

it("restores height after measurement fails and rejects stale or unrelated regions", () => {
  const root = document.createElement("div");
  const container = document.createElement("div");
  const content = document.createElement("div");
  root.append(container, content);
  let active = true;
  const host = createBrowserInputRegion(root, container, () => active);
  const region = createBrowserInputRegion(root, content, () => active);
  expect(region.readUnconstrainedScrollHeight(host)).toBeUndefined();
  container.append(content);
  container.style.height = "120px";
  Object.defineProperty(content, "scrollHeight", {
    get: () => {
      throw new Error("measurement failed");
    },
  });
  expect(() => region.readUnconstrainedScrollHeight(host)).toThrow("measurement failed");
  expect(container.style.height).toBe("120px");
  active = false;
  expect(region.readUnconstrainedScrollHeight(host)).toBeUndefined();
});

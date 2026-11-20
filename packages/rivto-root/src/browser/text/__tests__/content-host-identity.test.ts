import { captureBrowserTextHost } from "../browser-text-host";

it("compares captured content hosts without exposing their elements", () => {
  const root = document.createElement("div");
  const first = document.createElement("span");
  const second = document.createElement("span");
  root.append(first, second);
  const original = captureBrowserTextHost(first, root)!;
  const recaptured = captureBrowserTextHost(first, root)!;
  const different = captureBrowserTextHost(second, root)!;
  expect(original.isSameHost(recaptured)).toBe(true);
  expect(original.isSameHost(different)).toBe(false);
  expect(original.isSameHost({ isSameHost: () => true })).toBe(false);
});

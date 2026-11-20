/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("exposes synchronous clipboard formats without returning the browser object", () => {
  const values = new Map([["text/plain", "example"]]);
  const data = {
    getData: (format: string) => values.get(format) ?? "",
    setData: (format: string, value: string) => values.set(format, value),
  };
  const root = document.createElement("div");
  const occurrence = new BrowserInputRoot(root);
  let delivered = false;
  const detach = occurrence.observeInput("copy", (input) => {
    delivered = true;
    expect(input.clipboard).not.toBe(data);
    expect(input.clipboard?.read("text/plain")).toBe("example");
    input.clipboard?.write("text/html", "<p>example</p>");
  });
  try {
    const event = new Event("copy");
    Object.defineProperty(event, "clipboardData", { value: data });
    root.dispatchEvent(event);
    expect(delivered).toBe(true);
    expect(values.get("text/html")).toBe("<p>example</p>");
  } finally {
    detach?.();
    occurrence.detach();
  }
});

it("reports absent clipboard data", () => {
  const root = document.createElement("div");
  const occurrence = new BrowserInputRoot(root);
  let delivered = false;
  const detach = occurrence.observeInput("paste", (input) => {
    delivered = true;
    expect(input.clipboard).toBeNull();
  });
  try {
    root.dispatchEvent(new Event("paste"));
    expect(delivered).toBe(true);
  } finally {
    detach?.();
    occurrence.detach();
  }
});

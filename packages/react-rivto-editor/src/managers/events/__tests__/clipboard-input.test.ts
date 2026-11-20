/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("delivers synchronous clipboard formats without exposing the browser data", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const values = new Map([["text/plain", "copied"]]);
  const data = {
    getData: (format: string) => values.get(format) ?? "",
    setData: (format: string, value: string) => values.set(format, value),
  };
  const received: unknown[] = [];
  panel.editor.events.register({ id: "test-copy", type: "copy" }, ({ clipboard }) => {
    received.push(clipboard);
    expect(clipboard?.read("text/plain")).toBe("copied");
    clipboard?.write("text/html", "<p>copied</p>");
  });
  panel.editor.events.register({ id: "test-paste", type: "paste" }, ({ clipboard }) => {
    received.push(clipboard);
  });
  try {
    panel.setRoot(root);
    const copy = new Event("copy", { bubbles: true });
    Object.defineProperty(copy, "clipboardData", { value: data });
    root.dispatchEvent(copy);
    root.dispatchEvent(new Event("paste", { bubbles: true }));
    expect(received).toHaveLength(2);
    expect(received[0]).not.toBe(data);
    expect(received[1]).toBeNull();
    expect(values.get("text/html")).toBe("<p>copied</p>");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

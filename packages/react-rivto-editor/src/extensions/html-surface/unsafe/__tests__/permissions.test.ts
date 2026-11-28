/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor } from "../../../../test-utils";
import { createLocalHtmlPermissions } from "../permissions";

test("grants are isolated by document and block and malformed storage denies access", async () => {
  const first = await createTestCoreEditor();
  const second = await createTestCoreEditor();
  const request = { blockId: "same", source: "ok", permission: "editorAccess" } as const;
  const local = createLocalHtmlPermissions(first.getDocument());
  const other = createLocalHtmlPermissions(second.getDocument());
  try {
    first.getDocument().blocks.insertBlock({ id: "same", type: "unsafe-html", content: "ok" });
    local.write(request, true);
    expect(local.read(request)).toBe("block");
    expect(other.read(request)).toBe("denied");
    expect(local.read({ ...request, blockId: "copy" })).toBe("denied");
    expect(local.read({ ...request, source: "changed" })).toBe("denied");
    const key = Object.keys(localStorage).find(
      (entry) => localStorage.getItem(entry) === JSON.stringify("ok"),
    );
    expect(key).toBeDefined();
    localStorage.setItem(key!, '{"version":999}');
    expect(local.read(request)).toBe("denied");
    localStorage.setItem(key!, "bad json");
    expect(local.read(request)).toBe("denied");
  } finally {
    local.dispose();
    other.dispose();
    localStorage.clear();
    await first.destroy();
    await second.destroy();
  }
});

import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor } from "../../test-utils";
import { executeUnsafeHtmlRequest, parseUnsafeHtmlRequest } from "./unsafe-bridge";

test("validates requested operations and applies content through the supplied manager", async () => {
  const editor = await createTestCoreEditor();
  try {
    const block = editor.blocks.insertBlock({ type: "paragraph", content: "Before" });
    const request = {
      id: 1,
      target: "panel" as const,
      method: "setContent",
      args: [block.id, "After"],
    };
    expect(parseUnsafeHtmlRequest({ ...request, args: "invalid" })).toBeUndefined();
    expect(parseUnsafeHtmlRequest({ ...request, target: "other" })).toBeUndefined();
    const extraArgs = parseUnsafeHtmlRequest({ ...request, args: [block.id, "After", "extra"] });
    expect(extraArgs).toBeDefined();
    if (!extraArgs) {
      throw new Error("Missing parsed request");
    }
    expect(executeUnsafeHtmlRequest(editor.blocks, extraArgs)).toBeNull();
    expect(
      executeUnsafeHtmlRequest(editor.blocks, { ...request, args: ["missing", "No"] }),
    ).toBeNull();
    expect(
      executeUnsafeHtmlRequest(editor.blocks, { ...request, method: "destroy", args: [] }),
    ).toBeNull();
    expect(executeUnsafeHtmlRequest(editor.blocks, request)).toBe(true);
    expect(editor.blocks.getBlockNode(block.id)?.content).toBe("After");
  } finally {
    await editor.destroy();
  }
});

test("panel operations cannot read or write outside their boundary", async () => {
  const editor = await createTestCoreEditor();
  try {
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "inside", type: "paragraph", content: "Inside" }],
    });
    editor.blocks.insertBlock({ id: "outside", type: "paragraph", content: "Outside" });
    const panel = new ChildrenPanel(editor, { rootBlockId: "root" });
    const request = { id: 1, target: "panel" as const, method: "getBlockNode", args: ["outside"] };
    expect(executeUnsafeHtmlRequest(panel.blocks, request)).toBeNull();
    expect(
      executeUnsafeHtmlRequest(panel.blocks, {
        ...request,
        method: "setContent",
        args: ["outside", "Changed"],
      }),
    ).toBeNull();
    expect(editor.blocks.getBlockNode("outside")?.content).toBe("Outside");
    expect(
      executeUnsafeHtmlRequest(panel.blocks, {
        ...request,
        method: "setContent",
        args: ["inside", "Changed"],
      }),
    ).toBe(true);
    expect(editor.blocks.getBlockNode("inside")?.content).toBe("Changed");
  } finally {
    await editor.destroy();
  }
});

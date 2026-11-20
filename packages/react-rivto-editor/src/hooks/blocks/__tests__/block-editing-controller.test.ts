/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { BlockEditingController } from "../block-editing-controller";

test("composition keeps DOM ownership and commits the final text through bound operations", async () => {
  const core = await createTestCoreEditor();
  const editor = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "Before" });
  const controller = new BlockEditingController((content) => {
    editor.editor.blocks.updateBlock(block.id, { content });
  });
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  const element = document.createElement("div");
  surface.append(element);
  const root = new BrowserInputRoot(surface);
  const identity = getBrowserElementIdentity(element);
  const target = root.captureEditableTextByIdentity(identity, "[data-rivto-panel]")!;
  const detach = controller.attach(target);
  try {
    controller.synchronize("Before");
    expect(element.textContent).toBe("Before");
    controller.onCompositionStart(identity);
    element.textContent = "入力";
    controller.synchronize("Remote");
    controller.onInput(identity);
    expect(element.textContent).toBe("入力");
    expect(editor.editor.blocks.getBlockNode(block.id)?.content).toBe("Before");
    controller.onCompositionEnd(identity);
    expect(editor.editor.blocks.getBlockNode(block.id)?.content).toBe("入力");
    controller.synchronize("After");
    expect(element.textContent).toBe("After");
  } finally {
    detach();
    root.detach();
    editor.editor.destroy();
    await core.destroy();
  }
});

test("ignores stale inputs and an older attachment cleanup", () => {
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.textContent = "first";
  second.textContent = "second";
  surface.append(first, second);
  const root = new BrowserInputRoot(surface);
  const firstId = getBrowserElementIdentity(first);
  const secondId = getBrowserElementIdentity(second);
  const firstTarget = root.captureEditableTextByIdentity(firstId, "[data-rivto-panel]")!;
  const secondTarget = root.captureEditableTextByIdentity(secondId, "[data-rivto-panel]")!;
  const values: string[] = [];
  const controller = new BlockEditingController((text) => values.push(text));
  const releaseFirst = controller.attach(firstTarget);
  const releaseSecond = controller.attach(secondTarget);
  try {
    releaseFirst();
    controller.onInput(firstId);
    expect(values).toEqual([]);
    controller.onInput(secondId);
    expect(values).toEqual(["second"]);
    root.detach();
    controller.onInput(secondId);
    expect(values).toEqual(["second"]);
  } finally {
    releaseFirst();
    releaseSecond();
    root.detach();
  }
});

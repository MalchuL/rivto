/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import {
  EditorPortalHostContext,
  EditorRootContext,
} from "../../../../components/editor-panel/editor-root-context";
import { SlashMenu } from "../slash-menu";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not execute a menu command from a replaced registration", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  const previousObserver = globalThis.ResizeObserver;
  const previousScroll = HTMLElement.prototype.scrollIntoView;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = jestApi.fn().mockImplementation(() => ({
    observe: jestApi.fn(),
    unobserve: jestApi.fn(),
    disconnect: jestApi.fn(),
  })) as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollIntoView = jestApi.fn();
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "/" });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "true";
  surface.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>/</span></div>`;
  document.body.append(surface);
  const content = surface.querySelector<HTMLElement>("[data-block-content]")!;
  const view = createRoot(document.createElement("div"));
  const execute = jestApi.fn();
  panel.editor.slashCommands.register({ id: "test.command", title: "Test command", execute });
  const range = document.createRange();
  range.setStart(content.firstChild!, 1);
  range.collapse(true);
  Object.defineProperty(range, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, bottom: 0 }),
  });
  const selection = document.getSelection()!;
  try {
    panel.setRoot(surface);
    selection.removeAllRanges();
    selection.addRange(range);
    await act(async () => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <EditorPortalHostContext.Provider value={surface}>
              <SlashMenu />
            </EditorPortalHostContext.Provider>
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    await act(async () => {
      content.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: "/" }),
      );
      await Promise.resolve();
    });
    const command = document.querySelector<HTMLElement>('[data-slash-command="test.command"]');
    expect(command).not.toBeNull();
    act(() => {
      panel.setEnabled(false);
      panel.setEnabled(true);
      command!.click();
    });
    expect(execute).not.toHaveBeenCalled();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("/");
  } finally {
    act(() => view.unmount());
    selection.removeAllRanges();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
    globalThis.ResizeObserver = previousObserver;
    HTMLElement.prototype.scrollIntoView = previousScroll;
  }
});

it("does not execute an old menu command when its Root remains attached", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  const previousObserver = globalThis.ResizeObserver;
  const previousScroll = HTMLElement.prototype.scrollIntoView;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = jestApi.fn().mockImplementation(() => ({
    observe: jestApi.fn(),
    unobserve: jestApi.fn(),
    disconnect: jestApi.fn(),
  })) as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollIntoView = jestApi.fn();
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "/" });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "true";
  surface.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>/</span></div>`;
  document.body.append(surface);
  const content = surface.querySelector<HTMLElement>("[data-block-content]")!;
  const view = createRoot(document.createElement("div"));
  const execute = jestApi.fn();
  panel.editor.slashCommands.register({ id: "test.command", title: "Test command", execute });
  const range = document.createRange();
  range.setStart(content.firstChild!, 1);
  range.collapse(true);
  Object.defineProperty(range, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, bottom: 0 }),
  });
  const selection = document.getSelection()!;
  try {
    panel.setRoot(surface);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    selection.removeAllRanges();
    selection.addRange(range);
    await act(async () => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <EditorPortalHostContext.Provider value={surface}>
              <SlashMenu />
            </EditorPortalHostContext.Provider>
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    await act(async () => {
      content.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: "/" }),
      );
      await Promise.resolve();
    });
    const command = document.querySelector<HTMLElement>('[data-slash-command="test.command"]');
    expect(command).not.toBeNull();
    act(() => {
      panel.setEnabled(false);
      panel.setEnabled(true);
      command!.click();
    });
    expect(execute).not.toHaveBeenCalled();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("/");
    attached.mockRestore();
  } finally {
    act(() => view.unmount());
    selection.removeAllRanges();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
    globalThis.ResizeObserver = previousObserver;
    HTMLElement.prototype.scrollIntoView = previousScroll;
  }
});

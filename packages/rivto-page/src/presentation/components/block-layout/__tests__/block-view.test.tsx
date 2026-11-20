import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { RegionIdentity } from "@chulane/rivto-root";
import { BlockEditorController } from "../../../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../../../test-utils/test-block-editor-adapter";
import { BlockEditorScope } from "../../block-editor/block-editor-scope";
import { BlockView } from "../block-view";
import { BlockDropTarget } from "../../../drag-and-drop/block-drop-target";
import type { BlockLayoutInputBinding } from "../types";

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

it("forwards a standalone shell's opaque identity and preserves presentation", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const identity = createRef<RegionIdentity>();
  try {
    act(() =>
      root.render(
        <BlockView
          block={adapter.blocks.getBlockNode("a")!}
          ref={identity}
          className="host"
          aria-label="Shell"
        >
          Content
        </BlockView>,
      ),
    );
    const shell = host.querySelector<HTMLDivElement>("[data-block-id=a]")!;
    expect(identity.current).toBe(getBrowserElementIdentity(shell));
    expect(identity.current).not.toBeInstanceOf(Element);
    expect(shell.className).toContain("host");
    expect(shell.getAttribute("aria-label")).toBe("Shell");
    expect(shell.textContent).toBe("Content");
    act(() => root.render(null));
    expect(identity.current).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it("releases a shell input subscription and forwarded ref cleanup on unmount", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  const editor = new BlockEditorController({ adapter });
  const host = document.createElement("div");
  document.body.append(host);
  const inputRoot = new BrowserInputRoot(host);
  const detach = editor.attach(inputRoot);
  const root = createRoot(host);
  const cleanup = jest.fn();
  const forward = jest.fn((identity: object | null) => (identity ? cleanup : undefined));
  const observed = jest.fn();
  const bindInput: BlockLayoutInputBinding = (identity, events) =>
    events.observeRegion(identity, "click", "bubble", observed);
  try {
    act(() =>
      root.render(
        <BlockEditorScope editor={editor} inputRoot={inputRoot}>
          <BlockView block={adapter.blocks.getBlockNode("a")!} ref={forward} bindInput={bindInput}>
            <button>Control</button>
          </BlockView>
        </BlockEditorScope>,
      ),
    );
    const shell = host.querySelector<HTMLDivElement>("[data-block-id=a]")!;
    const button = host.querySelector("button")!;
    expect(forward).toHaveBeenCalledWith(getBrowserElementIdentity(shell));
    expect(forward.mock.calls[0]![0]).toBe(getBrowserElementIdentity(shell));
    act(() => button.click());
    expect(observed).toHaveBeenCalledTimes(1);
    act(() => root.render(null));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
    act(() => button.click());
    expect(observed).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    detach();
    inputRoot.detach();
    editor.destroy();
    host.remove();
  }
});

it("cleans up a replaced shell identity ref before binding its replacement", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const firstCleanup = jest.fn();
  const secondCleanup = jest.fn();
  const first = jest.fn((identity: object | null) => (identity ? firstCleanup : undefined));
  const second = jest.fn((identity: object | null) => (identity ? secondCleanup : undefined));
  try {
    act(() => root.render(<BlockView block={adapter.blocks.getBlockNode("a")!} ref={first} />));
    const shell = host.querySelector<HTMLDivElement>("[data-block-id=a]")!;
    act(() => root.render(<BlockView block={adapter.blocks.getBlockNode("a")!} ref={second} />));
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(getBrowserElementIdentity(shell));
    expect(host.querySelector("[data-block-id=a]")).toBe(shell);
    act(() => root.render(null));
    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it("composes a shell identity ref with drop registration and callback cleanup", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("a");
  const editor = new BlockEditorController({ adapter });
  const host = document.createElement("div");
  document.body.append(host);
  const inputRoot = new BrowserInputRoot(host);
  const detach = editor.attach(inputRoot);
  const root = createRoot(host);
  const cleanup = jest.fn();
  const forward = jest.fn((identity: object | null) => (identity ? cleanup : undefined));
  const register = jest.spyOn(editor.dropTargets, "register");
  try {
    act(() =>
      root.render(
        <BlockEditorScope editor={editor} inputRoot={inputRoot}>
          <BlockDropTarget asChild destination={{ kind: "inside", parentId: "a" }}>
            <BlockView block={adapter.blocks.getBlockNode("a")!} ref={forward} />
          </BlockDropTarget>
        </BlockEditorScope>,
      ),
    );
    const shell = host.querySelector<HTMLDivElement>("[data-block-id=a]")!;
    const identity = getBrowserElementIdentity(shell);
    expect(forward).toHaveBeenCalledWith(identity);
    expect(forward.mock.calls[0]![0]).toBe(identity);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ identity }));
    expect(register.mock.calls.some(([entry]) => entry.identity === identity)).toBe(true);
    act(() => root.render(null));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    register.mockRestore();
    detach();
    inputRoot.detach();
    editor.destroy();
    host.remove();
  }
});

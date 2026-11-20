import { attachTestRoot } from "../../../../test-utils/attach-test-root";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditorController } from "../../../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../../../test-utils/test-block-editor-adapter";
import { BlockEditorScope } from "../block-editor-scope";
import { BlockEditor } from "../block-editor";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";

it.each([true, false])(
  "borrows an existing attachment without changing ownership, host attached=%s",
  (hostAttached) => {
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
    const surface = document.createElement("div");
    const container = document.createElement("div");
    document.body.append(surface, container);
    const reactRoot = createRoot(container);
    const detach = hostAttached ? attachTestRoot(editor, surface) : undefined;
    try {
      act(() =>
        reactRoot.render(<BlockEditorScope editor={editor} inputRoot={editor.inputRoot} />),
      );
      const occurrence = editor.inputRoot;
      expect(editor.inputRoot?.getElementIdentity?.()).toBe(
        hostAttached ? getBrowserElementIdentity(surface) : undefined,
      );
      act(() => reactRoot.unmount());
      expect(occurrence?.isAttached()).toBe(hostAttached ? true : undefined);
      expect(editor.inputRoot?.getElementIdentity?.()).toBe(
        hostAttached ? getBrowserElementIdentity(surface) : undefined,
      );
      detach?.();
      expect(editor.inputRoot).toBeUndefined();
    } finally {
      editor.destroy();
      surface.remove();
      container.remove();
      environment.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);

it("owns the Root created for a standalone Page view", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const reactRoot = createRoot(container);
  try {
    act(() => reactRoot.render(<BlockEditor editor={editor} />));
    const occurrence = editor.inputRoot;
    expect(occurrence?.isAttached()).toBe(true);
    act(() => reactRoot.unmount());
    expect(occurrence?.isAttached()).toBe(false);
    expect(editor.inputRoot).toBeUndefined();
  } finally {
    scroll.mockRestore();
    editor.destroy();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("keeps a host-attached Page Root after the view unmounts", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const reactRoot = createRoot(container);
  let occurrence: BrowserInputRoot | undefined;
  let detach: (() => void) | undefined;
  try {
    act(() =>
      reactRoot.render(
        <BlockEditor
          editor={editor}
          ref={(element) => {
            if (element && !occurrence) {
              occurrence = new BrowserInputRoot(element);
              detach = editor.attach(occurrence);
            }
          }}
        />,
      ),
    );
    expect(editor.inputRoot).toBe(occurrence);
    act(() => reactRoot.unmount());
    expect(editor.inputRoot).toBe(occurrence);
    expect(occurrence?.isAttached()).toBe(true);
  } finally {
    detach?.();
    occurrence?.detach();
    scroll.mockRestore();
    editor.destroy();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("recognizes a retained attachment even if its borrowed Root has detached", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const surface = document.createElement("div");
  const occurrence = new BrowserInputRoot(surface);
  const identity = getBrowserElementIdentity(surface);
  const detach = editor.attach(occurrence);
  try {
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(identity);
    occurrence.detach();
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(identity);
    detach();
    expect(editor.inputRoot).toBeUndefined();
  } finally {
    detach();
    editor.destroy();
  }
});

it("observes hover through the Root borrowed from the mounted occurrence", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const surface = document.createElement("div");
  const container = document.createElement("div");
  document.body.append(surface, container);
  const root = new BrowserInputRoot(surface);
  const detach = editor.attach(root);
  const observe = jest.spyOn(editor.events, "observe");
  const reactRoot = createRoot(container);
  try {
    act(() => reactRoot.render(<BlockEditorScope editor={editor} inputRoot={root} />));
    expect(observe).toHaveBeenCalledTimes(3);
    act(() => reactRoot.unmount());
  } finally {
    observe.mockRestore();
    detach();
    root.detach();
    editor.destroy();
    surface.remove();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

/** @jest-environment ./jest-browser-environment.mjs */
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../test-utils";
import { EditableLabel } from "../editable-label";
import type { EditableLabelFocusPoint } from "../types";

it("waits for its occurrence before focusing a label without a requested point", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const released = jestApi.fn();
  const subscribe = panel.subscribeAvailability.bind(panel);
  const subscription = jestApi
    .spyOn(panel, "subscribeAvailability")
    .mockImplementation((listener) => {
      const release = subscribe(listener);
      return () => {
        released();
        release();
      };
    });
  try {
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <EditableLabel editing text="hello" onCommit={() => {}} onEditingChange={() => {}} />
        </TestPanel>,
      ),
    );
    const label = surface.querySelector<HTMLElement>("[contenteditable]")!;
    expect(document.activeElement).not.toBe(label);
    act(() => panel.setRoot(surface));
    expect(document.activeElement).toBe(label);
    expect(released).toHaveBeenCalledTimes(1);
  } finally {
    act(() => view.unmount());
    subscription.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("commits the last owned draft when the Root detaches before blur", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const onCommit = jestApi.fn();
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <EditableLabel editing text="before" onCommit={onCommit} onEditingChange={() => {}} />
        </TestPanel>,
      ),
    );
    const label = surface.querySelector<HTMLElement>("[contenteditable]")!;
    label.textContent = "owned draft";
    act(() => label.dispatchEvent(new InputEvent("input", { bubbles: true })));
    act(() => panel.setRoot(null));
    label.textContent = "foreign text";
    act(() => label.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledWith("owned draft");
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("seeds a disabled occurrence and focuses when it becomes active", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  try {
    panel.setEnabled(false);
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <EditableLabel editing text="hello" onCommit={() => {}} onEditingChange={() => {}} />
        </TestPanel>,
      ),
    );
    const label = surface.querySelector<HTMLElement>("[contenteditable]")!;
    expect(label.textContent).toBe("hello");
    expect(document.activeElement).not.toBe(label);
    act(() => panel.setEnabled(true));
    expect(document.activeElement).toBe(label);
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("retries unpositioned focus when focus replaces its Root", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  try {
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <EditableLabel editing text="hello" onCommit={() => {}} onEditingChange={() => {}} />
        </TestPanel>,
      ),
    );
    const label = surface.querySelector<HTMLElement>("[contenteditable]")!;
    const focus = label.focus.bind(label);
    let replaced = false;
    const spy = jestApi.spyOn(label, "focus").mockImplementation((options) => {
      if (!replaced) {
        replaced = true;
        panel.setRoot(null);
        panel.setRoot(surface);
      } else {
        focus(options);
      }
    });
    act(() => panel.setRoot(surface));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(label);
    spy.mockRestore();
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("retains a requested caret point until the occurrence attaches", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const point = createRef<EditableLabelFocusPoint | null>();
  point.current = { x: 10, y: 20 };
  const selection = document.getSelection()!;
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const set = jestApi.spyOn(selection, "setBaseAndExtent");
  const previousHit = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: surface.firstChild?.firstChild, offset: 2 }),
  });
  try {
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <EditableLabel
            editing
            text="hello"
            focusPointRef={point}
            onCommit={() => {}}
            onEditingChange={() => {}}
          />
        </TestPanel>,
      ),
    );
    expect(point.current).toEqual({ x: 10, y: 20 });
    expect(set).not.toHaveBeenCalled();
    const label = surface.querySelector<HTMLElement>("[contenteditable]")!;
    let replaced = false;
    const focus = jestApi.spyOn(label, "focus").mockImplementation(() => {
      if (!replaced) {
        replaced = true;
        panel.setRoot(null);
        panel.setRoot(surface);
      }
    });
    act(() => panel.setRoot(surface));
    expect(replaced).toBe(true);
    focus.mockRestore();
    expect(point.current).toBeNull();
    expect(set).toHaveBeenCalledTimes(1);
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    expect(set).toHaveBeenCalledTimes(1);
  } finally {
    act(() => view.unmount());
    if (previousHit) {
      Object.defineProperty(document, "caretPositionFromPoint", previousHit);
    } else {
      Reflect.deleteProperty(document, "caretPositionFromPoint");
    }
    set.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

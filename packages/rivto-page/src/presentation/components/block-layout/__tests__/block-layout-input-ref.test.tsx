import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditorController } from "../../../../editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../../../test-utils/test-block-editor-adapter";
import {
  createBlockLayoutInputRef,
  useBlockLayoutInputRef,
} from "../browser/use-block-layout-input-ref";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockItemInputBinding } from "../types";

it("releases layout ownership even if item input cleanup throws", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const container = document.createElement("div");
  document.body.append(container);
  const view = createRoot(container);
  const mount = jest.fn();
  const failure = new Error("input cleanup failed");
  const bindInput: BlockItemInputBinding = () => () => {
    throw failure;
  };
  /**
   * Mounts an item ref with a failing input disposer.
   *
   * @returns A single host using the composed ref.
   */
  function Fixture() {
    const ref = useBlockLayoutInputRef(mount, editor.events, bindInput);
    return <div ref={ref} />;
  }
  try {
    act(() => view.render(<Fixture />));
    expect(mount).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    expect(() => act(() => view.render(null))).toThrow("input cleanup failed");
    expect(mount).toHaveBeenLastCalledWith(null);
  } finally {
    act(() => view.unmount());
    editor.destroy();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("rolls back layout ownership when item input setup fails", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const container = document.createElement("div");
  document.body.append(container);
  const view = createRoot(container);
  const mount = jest.fn();
  const bindInput: BlockItemInputBinding = () => {
    throw new Error("input setup failed");
  };
  /**
   * Mounts an item ref with a failing input setup.
   *
   * @returns A single host using the composed ref.
   */
  function Fixture() {
    const ref = useBlockLayoutInputRef(mount, editor.events, bindInput);
    return <div ref={ref} />;
  }
  try {
    expect(() => act(() => view.render(<Fixture />))).toThrow("input setup failed");
    expect(mount).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    expect(mount).toHaveBeenLastCalledWith(null);
  } finally {
    act(() => view.unmount());
    editor.destroy();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("releases a stale input binding when setup replaces its mounted region", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const first = document.createElement("div");
  const second = document.createElement("div");
  const firstIdentity = getBrowserElementIdentity(first);
  const secondIdentity = getBrowserElementIdentity(second);
  const firstCleanup = jest.fn();
  const secondCleanup = jest.fn();
  const mount = jest.fn();
  const bindInput: BlockItemInputBinding = (identity) => {
    if (identity === firstIdentity) {
      commit!(second);
      return firstCleanup;
    }
    if (identity === secondIdentity) {
      return secondCleanup;
    }
    throw new Error("Unexpected region identity");
  };
  const commit = createBlockLayoutInputRef(mount, editor.events, bindInput);
  try {
    commit(first);
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).not.toHaveBeenCalled();
    commit(null);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenLastCalledWith(null);
  } finally {
    commit(null);
    editor.destroy();
  }
});

it("does not bind stale input when mount reentrantly replaces the region", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const first = document.createElement("div");
  const second = document.createElement("div");
  const firstIdentity = getBrowserElementIdentity(first);
  const secondIdentity = getBrowserElementIdentity(second);
  const cleanup = jest.fn();
  const bindInput = jest.fn((identity: object) => {
    expect(identity).toBe(secondIdentity);
    return cleanup;
  });
  /**
   * Replaces the first region while its mount callback is still running.
   *
   * @param element - Current mounted region, or null during cleanup.
   * @returns The replacement is committed when the first region arrives.
   */
  function mount(element: HTMLDivElement | null): void {
    if (element === first) {
      commit!(second);
    }
  }
  const commit = createBlockLayoutInputRef(mount, editor.events, bindInput);
  try {
    commit(first);
    expect(bindInput).toHaveBeenCalledTimes(1);
    expect(bindInput.mock.calls[0]![0]).toBe(secondIdentity);
    expect(bindInput.mock.calls[0]![0]).not.toBe(firstIdentity);
    commit(null);
    expect(cleanup).toHaveBeenCalledTimes(1);
  } finally {
    commit(null);
    editor.destroy();
  }
});

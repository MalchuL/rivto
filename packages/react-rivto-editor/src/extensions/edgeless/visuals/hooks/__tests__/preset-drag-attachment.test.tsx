/** @jest-environment ./jest-browser-environment.mjs */
import { attachTestBrowserEvents } from "../../../../../test-utils/attach-test-browser-events";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@chulane/rivto-edgeless";
import {
  BrowserEvents,
  BrowserInputRoot,
  getBrowserElementIdentity,
} from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../../../test-utils";
import { EdgelessToolContext } from "../../../../../managers/edgeless-tools/edgeless-tool-context";
import { EdgelessCreationTool } from "../../../../../managers/edgeless-tools/edgeless-creation-tool";
import { usePresetDrag } from "../use-preset-drag";
import { cancelPresetDrag } from "../preset-drag-cleanup";
import { presetPointerStart } from "../../components/preset-pointer-input";
import { createPresetPreview } from "../browser/preset-preview";
import { PresetDragController } from "../preset-drag-controller";
import type { PresetDrag } from "../types";
import type { PresetDragOptions, PresetPreview } from "../types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Creates a real preset tool and records activation and cancellation.
 *
 * @returns Fixture owners, configured tool and observed calls.
 */
async function createPresetFixture() {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const tools = new EdgelessToolContext(panel);
  const tool = new EdgelessCreationTool({
    id: "fixture",
    type: "fixture",
    operations: tools.operations,
    defaults: tools.defaults,
    reactPanel: panel,
    create: () => {
      throw new Error("not used");
    },
  });
  const calls = { activations: 0, cancellations: 0 };
  tools.activate = () => {
    calls.activations += 1;
  };
  tool.cancel = () => {
    calls.cancellations += 1;
    return true;
  };
  return { core, panel, tools, tool, calls };
}

/**
 * Creates an attached preset controller with deterministic placement geometry.
 *
 * @returns Controller, tool, pointer, observed callbacks, and fixture cleanup.
 */
async function createPresetControllerFixture() {
  const { core, panel, tools, tool, calls } = await createPresetFixture();
  const surface = document.createElement("div");
  document.body.append(surface);
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, surface);
  const viewport = { canvas: new Canvas(), events };
  const inputRoot = new BrowserInputRoot(surface);
  const rootIdentity = getBrowserElementIdentity(surface);
  const coordinates = {
    isAttached: () => true,
    containsClientPoint: () => true,
    clientToWorld: () => ({ x: 10, y: 10 }),
    getWorldOriginInClient: () => ({ x: 0, y: 0 }),
  };
  const setPreview = jestApi.fn();
  const prepare = jestApi.spyOn(tool, "preparePlacement").mockReturnValue({
    input: { type: "fixture" },
    frame: { x: 0, y: 0, width: 10, height: 10 },
  });
  const controller = new PresetDragController(
    tools,
    "fixture-preview",
    { viewport, coordinates, inputRoot, rootIdentity, zoom: 1 },
    setPreview,
    () => {},
  );
  const pointer = {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
  };
  /**
   * Releases fixture input, model owners, and any active gesture.
   *
   * @returns Resolves after the test document is destroyed.
   */
  const destroy = async () => {
    controller.cancel();
    prepare.mockRestore();
    detach();
    inputRoot.detach();
    surface.remove();
    panel.editor.destroy();
    await core.destroy();
  };
  return { tool, calls, controller, inputRoot, pointer, setPreview, destroy };
}

it("cancels the originating Root frame and ignores a late frame after gesture cleanup", async () => {
  const { tool, controller, inputRoot, pointer, destroy } = await createPresetControllerFixture();
  let deliver: (() => void) | undefined;
  const cancelFrame = jestApi.fn();
  const position = jestApi.fn();
  const remove = jestApi.fn();
  inputRoot.captureFrameClock = () => ({
    now: () => 0,
    requestFrame: (callback) => {
      deliver = callback;
      return cancelFrame;
    },
  });
  const preview: PresetPreview = { render: (content) => content, position, remove };
  try {
    controller.start({ ...pointer, capture: () => () => {}, createPreview: () => preview }, tool);
    controller.move({ ...pointer, clientX: 10 });
    expect(deliver).toBeDefined();
    controller.cancel();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    deliver?.();
    expect(position).not.toHaveBeenCalled();
  } finally {
    await destroy();
  }
});

it("releases a frame returned after the gesture is cancelled during scheduling", async () => {
  const { tool, controller, inputRoot, pointer, destroy } = await createPresetControllerFixture();
  const cancelFrame = jestApi.fn();
  const remove = jestApi.fn();
  inputRoot.captureFrameClock = () => ({
    now: () => 0,
    requestFrame: () => {
      controller.cancel();
      return cancelFrame;
    },
  });
  const preview: PresetPreview = { render: (content) => content, position: () => {}, remove };
  try {
    controller.start({ ...pointer, capture: () => () => {}, createPreview: () => preview }, tool);
    controller.move({ ...pointer, clientX: 10 });
    expect(controller.isActive()).toBe(false);
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    await destroy();
  }
});

it("does not paint an accepted frame after the input Root detaches", async () => {
  const { tool, controller, inputRoot, pointer, destroy } = await createPresetControllerFixture();
  let deliver: (() => void) | undefined;
  let attached = true;
  const position = jestApi.fn();
  inputRoot.captureFrameClock = () => ({
    now: () => (attached ? 0 : undefined),
    requestFrame: (callback) => {
      deliver = callback;
      return () => {};
    },
  });
  const preview: PresetPreview = { render: (content) => content, position, remove: () => {} };
  try {
    controller.start({ ...pointer, capture: () => () => {}, createPreview: () => preview }, tool);
    controller.move({ ...pointer, clientX: 10 });
    expect(deliver).toBeDefined();
    attached = false;
    deliver?.();
    expect(position).not.toHaveBeenCalled();
  } finally {
    await destroy();
  }
});

it("cancels and releases capture when the captured preview occurrence is unavailable", async () => {
  const { tool, calls, controller, pointer, setPreview, destroy } =
    await createPresetControllerFixture();
  const release = jestApi.fn();
  try {
    controller.start({ ...pointer, capture: () => release, createPreview: () => undefined }, tool);
    controller.move({ ...pointer, clientX: 10 });
    expect(controller.isActive()).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
    expect(calls.cancellations).toBe(1);
    expect(setPreview).not.toHaveBeenCalledWith(
      expect.objectContaining({ preview: expect.anything() }),
    );
  } finally {
    await destroy();
  }
});

it("preserves a replacement gesture when stale preview cleanup fails", async () => {
  const { tool, controller, pointer, destroy } = await createPresetControllerFixture();
  const capture = () => () => {};
  const preview: PresetPreview = {
    render: (content) => content,
    position: () => {},
    remove: () => {
      throw new Error("stale preview removal failed");
    },
  };
  try {
    controller.start(
      {
        ...pointer,
        capture,
        createPreview: () => {
          controller.cancel();
          controller.start(
            { ...pointer, pointerId: 2, capture, createPreview: () => undefined },
            tool,
          );
          return preview;
        },
      },
      tool,
    );
    expect(() => controller.move({ ...pointer, clientX: 10 })).toThrow(
      "stale preview removal failed",
    );
    expect(controller.isActive()).toBe(true);
  } finally {
    await destroy();
  }
});

/**
 * Creates a component that binds a button to the toolbar placement hook.
 *
 * @param options - Borrowed session and attachment capabilities.
 * @param tool - Fixture tool receiving pointer input.
 * @returns A component exposing the preset pointer lifecycle.
 */
function createSurface(options: PresetDragOptions, tool: EdgelessCreationTool) {
  /**
   * Renders a pointer capture button without mounting a preset preview.
   *
   * @returns A button forwarding input to the placement hook.
   */
  return function Surface() {
    const drag = usePresetDrag(options);
    useLayoutEffect(
      () =>
        options.viewport?.events.observe(
          { id: "fixture.preset.start", type: "pointerdown" },
          (input) =>
            drag.startPresetDrag(
              presetPointerStart(input, () => createPresetPreview(document, tool.id)),
              tool,
            ),
        ),
      [drag.startPresetDrag],
    );
    return (
      <div data-edgeless-toolbar="">
        <button data-canvas-tool={tool.id} />
      </div>
    );
  };
}

it("does not activate a preset after its captured viewport detaches", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { core, panel, tools, tool, calls } = await createPresetFixture();
  let attached = true;
  const coordinates = {
    isAttached: () => attached,
    containsClientPoint: () => false,
    clientToWorld: () => (attached ? { x: 10, y: 20 } : undefined),
    getWorldOriginInClient: () => (attached ? { x: 0, y: 0 } : undefined),
  };
  const root = document.createElement("div");
  const container = document.createElement("div");
  root.append(container);
  document.body.append(root);
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, root);
  const viewport = { canvas: new Canvas(), events };
  const inputRoot = new BrowserInputRoot(root);
  const Surface = createSurface(
    {
      tools,
      viewport,
      coordinates,
      inputRoot,
      rootIdentity: getBrowserElementIdentity(root),
      zoom: 1,
    },
    tool,
  );
  const renderer = createRoot(container);
  try {
    act(() => renderer.render(<Surface />));
    const button = container.querySelector("button")!;
    button.setPointerCapture = () => {};
    button.hasPointerCapture = () => true;
    let releases = 0;
    button.releasePointerCapture = () => {
      releases += 1;
    };
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    const up = new MouseEvent("pointerup", { bubbles: true });
    Object.defineProperty(down, "pointerId", { value: 3 });
    Object.defineProperty(up, "pointerId", { value: 3 });
    act(() => {
      button.dispatchEvent(down);
      attached = false;
      button.dispatchEvent(up);
    });
    expect(calls.activations).toBe(0);
    expect(calls.cancellations).toBe(1);
    expect(releases).toBe(1);
  } finally {
    act(() => renderer.unmount());
    detach();
    inputRoot.detach();
    root.remove();
    container.remove();
    panel.editor.destroy();
    core.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("keeps the first captured pointer when another pointer starts on the preset", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { core, panel, tools, tool, calls } = await createPresetFixture();
  const coordinates = {
    isAttached: () => true,
    containsClientPoint: () => false,
    clientToWorld: () => ({ x: 10, y: 20 }),
    getWorldOriginInClient: () => ({ x: 0, y: 0 }),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, container);
  const inputRoot = new BrowserInputRoot(container);
  const Surface = createSurface(
    {
      tools,
      viewport: { canvas: new Canvas(), events },
      coordinates,
      inputRoot,
      rootIdentity: getBrowserElementIdentity(container),
      zoom: 1,
    },
    tool,
  );
  const renderer = createRoot(container);
  const captured: number[] = [];
  const released: number[] = [];
  /**
   * Dispatches a pointer sample on the preset button or its window.
   *
   * @param target - Mounted preset button or window receiving the event.
   * @param type - Pointer phase to deliver.
   * @param id - Browser pointer identity.
   * @returns The gesture has received the sample.
   */
  function dispatch(target: EventTarget, type: string, id: number) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    target.dispatchEvent(event);
  }
  try {
    act(() => renderer.render(<Surface />));
    const button = container.querySelector("button")!;
    button.setPointerCapture = (id) => captured.push(id);
    button.hasPointerCapture = () => true;
    button.releasePointerCapture = (id) => released.push(id);
    act(() => {
      dispatch(button, "pointerdown", 3);
      dispatch(button, "pointerdown", 4);
      dispatch(button, "pointerup", 4);
      dispatch(window, "pointerup", 3);
    });
    expect(captured).toEqual([3]);
    expect(released).toEqual([3]);
    expect(calls.activations).toBe(1);
  } finally {
    act(() => renderer.unmount());
    detach();
    inputRoot.detach();
    container.remove();
    panel.editor.destroy();
    core.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("cancels the tool when releasing pointer capture fails after detachment", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { core, panel, tools, tool, calls } = await createPresetFixture();
  let attached = true;
  const coordinates = {
    isAttached: () => attached,
    containsClientPoint: () => false,
    clientToWorld: () => (attached ? { x: 10, y: 20 } : undefined),
    getWorldOriginInClient: () => (attached ? { x: 0, y: 0 } : undefined),
  };
  const root = document.createElement("div");
  const container = document.createElement("div");
  root.append(container);
  document.body.append(root);
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, root);
  const inputRoot = new BrowserInputRoot(root);
  const Surface = createSurface(
    {
      tools,
      viewport: { canvas: new Canvas(), events },
      coordinates,
      inputRoot,
      rootIdentity: getBrowserElementIdentity(root),
      zoom: 1,
    },
    tool,
  );
  const renderer = createRoot(container);
  const failures: unknown[] = [];
  /**
   * Records the browser-reported listener error without failing the test environment.
   *
   * @param event - Browser error generated by the pointer listener.
   * @returns The failure is recorded and default reporting is prevented.
   */
  const onError = (event: ErrorEvent) => {
    failures.push(event.error);
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  try {
    act(() => renderer.render(<Surface />));
    const button = container.querySelector("button")!;
    button.setPointerCapture = () => {};
    button.hasPointerCapture = () => true;
    button.releasePointerCapture = () => {
      throw new Error("release failed");
    };
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    const up = new MouseEvent("pointerup", { bubbles: true });
    Object.defineProperty(down, "pointerId", { value: 3 });
    Object.defineProperty(up, "pointerId", { value: 3 });
    act(() => {
      button.dispatchEvent(down);
      attached = false;
      button.dispatchEvent(up);
    });
    expect(failures[0]).toBeInstanceOf(AggregateError);
    expect(calls.cancellations).toBe(1);
    expect(calls.activations).toBe(0);
  } finally {
    window.removeEventListener("error", onError);
    act(() => renderer.unmount());
    detach();
    inputRoot.detach();
    root.remove();
    container.remove();
    panel.editor.destroy();
    core.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("releases capture and clears UI even when the preview host cannot be removed", async () => {
  const { core, panel, tool, calls } = await createPresetFixture();
  let released = false;
  let inputReleased = false;
  let previewCleared = false;
  let guidesCleared = false;
  const preview: PresetPreview = {
    /**
     * Returns no content because this fixture exercises cleanup only.
     *
     * @param content - Preview content unused by this fixture.
     * @returns No rendered content.
     */
    render(content) {
      return content;
    },
    /**
     * Leaves geometry unchanged because this fixture exercises cleanup only.
     *
     * @returns The fixture has no geometry to update.
     */
    position() {},
    /**
     * Simulates a failed browser removal.
     *
     * @returns Never returns.
     * @throws The fixture removal failure.
     */
    remove() {
      throw new Error("remove failed");
    },
  };
  const active: PresetDrag = {
    pointerId: 3,
    tool,
    /**
     * Releases the fixture's captured pointer.
     *
     * @returns The release is recorded for the cleanup assertion.
     */
    releaseCapture() {
      released = true;
    },
    /**
     * Releases the fixture's input observations.
     *
     * @returns Observation cleanup is recorded for the assertion.
     */
    releaseInput() {
      inputReleased = true;
    },
    preview,
    /**
     * Supplies the fixture preview when requested.
     *
     * @returns The preview used by this cleanup scenario.
     */
    createPreview() {
      return preview;
    },
    clock: { now: () => 0, requestFrame: () => undefined },
    moved: true,
    startX: 0,
    startY: 0,
    coordinates: {
      isAttached: () => true,
      containsClientPoint: () => false,
      clientToWorld: () => undefined,
      getWorldOriginInClient: () => undefined,
    },
  };
  try {
    expect(() =>
      cancelPresetDrag(
        active,
        () => {
          previewCleared = true;
        },
        () => {
          guidesCleared = true;
        },
      ),
    ).toThrow(AggregateError);
    expect(previewCleared).toBe(true);
    expect(guidesCleared).toBe(true);
    expect(released).toBe(true);
    expect(inputReleased).toBe(true);
    expect(calls.cancellations).toBe(1);
    expect(active.preview).toBeNull();
  } finally {
    panel.editor.destroy();
    core.destroy();
  }
});

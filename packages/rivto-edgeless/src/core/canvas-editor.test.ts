import type { CanvasElement } from "../types/canvas";
import { jest } from "@jest/globals";
import { CanvasEditor } from "./canvas-editor";
import { CanvasSource } from "./canvas-source";
import type { Canvas } from "./canvas";
import { CanvasTool } from "./tools/canvas-tool";
import { CanvasToolContext } from "./tools/canvas-tool-context";
import { CanvasToolRegistry } from "./tools/canvas-tool-registry";

/** Observable application source used to check lifecycle ordering and resource ownership. */
class TestSource extends CanvasSource {
  connections = 0;
  releases = 0;
  failCleanup = false;

  /**
   * Supplies initial geometry before mounted subscriptions exist.
   *
   * @returns One application-owned rectangle.
   */
  override getElements(): readonly CanvasElement[] {
    return [{ id: "a", frame: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, zIndex: 0 }];
  }

  /**
   * Projects a source rectangle and tracks the active source subscription.
   *
   * @param canvas - Scene initialized before tool activation.
   * @returns Cleanup accounting for the subscription independently of tool failures.
   */
  override connect(canvas: Canvas): () => void {
    this.connections++;
    canvas.setElements(this.getElements());
    return () => {
      this.releases++;
      if (this.failCleanup) {
        throw new Error("source cleanup");
      }
    };
  }
}

/**
 * Creates an independent editor over real registry and tool lifecycle implementations.
 *
 * @param create - Optional factory for a tool with custom lifecycle behavior.
 * @returns Editor, source and registry for lifecycle assertions.
 */
function fixture(create = (id: string) => new CanvasTool({ id })) {
  const source = new TestSource();
  const registry = new CanvasToolRegistry();
  registry.registerTool({
    id: "select",
    title: "Select",
    default: true,
    createTool: ({ id }) => create(id),
  });
  const tools = new CanvasToolContext({
    registry,
    createGroup: (registration) => ({ registration }),
    createTool: (registration, group) => registration.createTool({ id: registration.id, group }),
  });
  return { editor: new CanvasEditor({ source, tools }), source, registry };
}

test("construction is inert, connection is exclusive, and stale cleanup cannot disconnect a remount", () => {
  const { editor, source } = fixture();
  expect(source.connections).toBe(0);
  expect(editor.canvas.getElement("a")).toBeDefined();
  const stop = editor.connect();
  const first = editor.tools.active;
  expect(editor.canvas.getElement("a")).toBeDefined();
  expect(() => editor.connect()).toThrow(/connected/);
  expect(() => editor.tools.observeChanges()).toThrow(/owner/);
  editor.canvas.setCamera({ x: 80, y: 20, zoom: 2 });
  stop();
  expect(editor.tools.active).toBeUndefined();
  const next = editor.connect();
  expect(editor.tools.active).not.toBe(first);
  stop();
  expect(source.releases).toBe(1);
  expect(editor.canvas.camera.get()).toEqual({ x: 80, y: 20, zoom: 2 });
  next();
  expect(source.releases).toBe(2);
});

test("failed tool activation rolls back source and permits a repaired remount", () => {
  let fail = true;
  const { editor, source } = fixture((id) => {
    const tool = new CanvasTool({ id });
    jest.spyOn(tool, "activate").mockImplementation(() => {
      expect(editor.canvas.getElement("a")).toBeDefined();
      if (fail) {
        throw new Error("activation failed");
      }
    });
    return tool;
  });
  expect(() => editor.connect()).toThrow("activation failed");
  expect(source.releases).toBe(1);
  fail = false;
  editor.connect()();
  expect(source.releases).toBe(2);
});

test("disconnect releases all tools, transform preview and source despite cleanup failures", () => {
  const { editor, source, registry } = fixture();
  const stop = editor.connect();
  const disposeDefault = jest.spyOn(editor.tools.active!, "dispose").mockImplementation(() => {
    throw new Error("tool cleanup");
  });
  const extra = new CanvasTool({ id: "extra" });
  const disposeExtra = jest.spyOn(extra, "dispose");
  registry.registerTool({ id: "extra", title: "Extra", createTool: () => extra });
  editor.tools.getTool("extra");
  editor.canvas.beginTransform("move", ["a"]);
  editor.canvas.previewTransform([
    { id: "a", frame: { x: 20, y: 0, width: 100, height: 100 }, rotation: 0 },
  ]);
  source.failCleanup = true;
  expect(stop).toThrow(AggregateError);
  expect(disposeDefault).toHaveBeenCalledTimes(1);
  expect(disposeExtra).toHaveBeenCalledTimes(1);
  expect(editor.canvas.transform.get()).toBeNull();
  expect(editor.canvas.getElement("a")!.frame.x).toBe(0);
  expect(source.releases).toBe(1);
  expect(editor.tools.active).toBeUndefined();
  stop();
  expect(source.releases).toBe(1);
});

test("terminal disposal does not destroy a shared registry and rejects future connections", () => {
  const { editor, registry, source } = fixture();
  editor.connect();
  editor.dispose();
  editor.dispose();
  expect(source.releases).toBe(1);
  expect(registry.getTool("select")).toBeDefined();
  expect(() => editor.connect()).toThrow(/disposed/);
});

test("tool disposal clears subscribers even when cancellation throws", () => {
  const listener = jest.fn();
  class NotifyingTool extends CanvasTool {
    /**
     * Exposes a preview publication for lifecycle verification.
     *
     * @returns Current preview subscribers are notified.
     */
    publish(): void {
      this.changed();
    }
  }
  const observable = new NotifyingTool({ id: "observable" });
  observable.subscribe(listener);
  jest.spyOn(observable, "cancel").mockImplementation(() => {
    throw new Error("cancel");
  });
  expect(() => observable.dispose()).toThrow("cancel");
  observable.publish();
  expect(listener).not.toHaveBeenCalled();
});

import { ReactCanvasTool } from "@chulane/rivto-edgeless/react";
import type {
  ReactCanvasToolRegistration,
  ReactCanvasToolGroupEntry,
} from "@chulane/rivto-edgeless/react";
import {
  CanvasTool,
  CanvasPanTool,
  CanvasToolContext,
  CanvasToolRegistry,
} from "@chulane/rivto-edgeless";
import type { CanvasToolOptions, CanvasToolPointer, Rect } from "@chulane/rivto-edgeless";

/** Demo-owned registration identities; no canvas code branches on them. */
export const CANVAS_DEMO_TOOLS = {
  select: "demo-select",
  pan: "demo-pan",
  rectangle: "demo-rectangle",
  shapes: "demo-shapes",
} as const;

/** Application-defined creation behavior using only the canvas tool API. */
class RectangleTool extends ReactCanvasTool {
  override readonly capturesPointer = true;
  override readonly keepsMenuOpen = true;
  private start?: { x: number; y: number; pointer: number };
  private draft?: Rect;

  /**
   * Binds the registration to the application's source mutation callback.
   *
   * @param options - Surface registration and shared group.
   * @param commit - Inserts a rectangle into the application's source when the gesture ends.
   */
  constructor(
    options: CanvasToolOptions,
    private readonly commit: (frame: Rect) => void,
  ) {
    super(options);
  }

  /**
   * Captures the primary pointer without inserting an element.
   *
   * @param input - Canvas-space pointer sample.
   * @returns Whether a new rectangle gesture was admitted.
   */
  override pointerDown(input: CanvasToolPointer): boolean {
    if (input.button !== 0) {
      return false;
    }
    this.start = { ...input.point, pointer: input.pointerId };
    this.pointerMove(input);
    return true;
  }

  /**
   * Updates the detached preview for the captured pointer.
   *
   * @param input - Current canvas-space sample.
   * @returns Only the local preview revision changes.
   */
  override pointerMove(input: CanvasToolPointer): void {
    if (!this.start || this.start.pointer !== input.pointerId) {
      return;
    }
    this.draft = {
      x: Math.min(this.start.x, input.point.x),
      y: Math.min(this.start.y, input.point.y),
      width: Math.max(1, Math.abs(input.point.x - this.start.x)),
      height: Math.max(1, Math.abs(input.point.y - this.start.y)),
    };
    this.changed();
  }

  /**
   * Inserts one final rectangle and clears local preview even if insertion fails.
   *
   * @param input - Release from the captured pointer.
   * @returns The application receives one source mutation.
   */
  override pointerUp(input: CanvasToolPointer): void {
    if (!this.start || this.start.pointer !== input.pointerId) {
      return;
    }
    try {
      this.pointerMove(input);
      if (this.draft) {
        this.commit(this.draft);
      }
    } finally {
      this.cancel();
    }
  }

  /**
   * Discards the unfinished rectangle without changing the application's source.
   *
   * @returns Whether a captured gesture was discarded.
   */
  override cancel(): boolean {
    const pending = Boolean(this.start);
    this.start = undefined;
    this.draft = undefined;
    this.changed();
    return pending;
  }

  /**
   * Paints the tool's local rectangle independently of persisted canvas elements.
   *
   * @param zoom - Current camera scale used for the preview border width.
   * @returns A world-space preview, or null while idle.
   */
  override renderPreview(zoom: number) {
    if (!this.draft) {
      return null;
    }
    return (
      <div
        data-demo-creation-preview=""
        style={{
          position: "absolute",
          left: this.draft.x,
          top: this.draft.y,
          width: this.draft.width,
          height: this.draft.height,
          border: `${2 / zoom}px dashed #3874bf`,
          background: "#dceaff80",
          pointerEvents: "none",
          boxSizing: "border-box",
        }}
      />
    );
  }
}

/**
 * Registers application tools and creates an isolated session without importing Rivto.
 *
 * Application-owned rectangle insertion is bound by the constructor callback.
 * The registry and session are shared by the demo's provider and toolbar.
 */
export class CanvasDemoTools {
  readonly registry = new CanvasToolRegistry<
    ReactCanvasToolRegistration,
    ReactCanvasToolGroupEntry
  >();
  readonly tools;

  /**
   * Registers tools bound to the application source and creates their surface session.
   *
   * @param commit - Inserts completed rectangle geometry into application storage.
   */
  constructor(commit: (frame: Rect) => void) {
    const registry = this.registry;
    this.registerSelection();
    this.registerPan();
    this.registerRectangle(commit);
    this.tools = new CanvasToolContext({
      registry,
      /**
       * Creates the demo's group identity without additional settings.
       *
       * @param registration - Shared group metadata.
       * @returns A surface-local group binding.
       */
      createGroup: (registration) => ({ registration }),
      /**
       * Invokes an application factory with the resolved surface-local group.
       *
       * @param registration - Application tool factory and identity.
       * @param group - Resolved group, absent for standalone tools.
       * @returns A new tool owned by this session.
       */
      createTool: (registration, group) => registration.createTool({ id: registration.id, group }),
    });
  }
  /**
   * Installs the default selection tool and its icon.
   *
   * @returns The demo registry contains this tool definition.
   */
  private registerSelection(): void {
    this.registry.registerTool({
      id: CANVAS_DEMO_TOOLS.select,
      title: "Select",
      default: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 3v17l5-5 4 6 3-2-4-6 7-1Z" fill="none" stroke="currentColor" />
        </svg>
      ),
      /**
       * Creates a selection tool whose ordinary gestures belong to CanvasView.
       *
       * @param options - Receiving surface's registration and optional group.
       * @returns A new passive tool instance.
       */
      createTool: (options) => new CanvasTool(options),
    });
  }

  /**
   * Installs primary-pointer panning and its toolbar icon.
   *
   * @returns The demo registry contains this tool definition.
   */
  private registerPan(): void {
    this.registry.registerTool({
      id: CANVAS_DEMO_TOOLS.pan,
      title: "Hand",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 5-9 7-12 2l-4-6a2 2 0 0 1 3-2Z"
            fill="none"
            stroke="currentColor"
          />
        </svg>
      ),
      /**
       * Creates a tool enabling primary-pointer camera panning.
       *
       * @param options - Receiving surface's registration and optional group.
       * @returns A new panning tool instance.
       */
      createTool: (options) => new CanvasPanTool(options),
    });
  }

  /**
   * Installs the custom shape group and source-bound rectangle factory.
   *
   * @param commit - Inserts final rectangle geometry into the application source.
   * @returns The demo registry contains this tool definition.
   */
  private registerRectangle(commit: (frame: Rect) => void): void {
    this.registry.registerGroup({ id: CANVAS_DEMO_TOOLS.shapes, title: "Shapes" });
    this.registry.registerTool({
      id: CANVAS_DEMO_TOOLS.rectangle,
      title: "Rectangle",
      group: CANVAS_DEMO_TOOLS.shapes,
      /**
       * Binds rectangle gestures to the demo's source insertion callback.
       *
       * @param options - Receiving surface's registration and shared group.
       * @returns A new tool with isolated preview state.
       */
      createTool: (options) => new RectangleTool(options, commit),
    });
  }
}

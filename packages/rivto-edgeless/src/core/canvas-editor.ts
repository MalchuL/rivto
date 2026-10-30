import { Canvas } from "./canvas";
import type { CanvasSource } from "./canvas-source";
import type { CanvasOptions } from "../types/canvas";
import type { CanvasToolSession } from "../types/tool-session";
import { releaseResources } from "../utils/release-resources";

/** Explicit dependencies of one independent edgeless editing session. */
export interface CanvasEditorOptions<Tools extends CanvasToolSession> {
  readonly source: CanvasSource;
  readonly tools: Tools;
  readonly canvas?: CanvasOptions;
}

/** Owns a scene and the mounted lifetime of its source and tool session. */
export class CanvasEditor<Tools extends CanvasToolSession = CanvasToolSession> {
  readonly canvas: Canvas;
  readonly tools: Tools;
  readonly source: CanvasSource;
  private state: "disconnected" | "connecting" | "connected" | "disconnecting" | "disposed" =
    "disconnected";
  private releaseConnection?: () => void;

  /**
   * Creates a surface-local scene with initial geometry without subscribing to source or registration changes.
   *
   * @param options - Source, isolated tool session and geometry/commit policies.
   * @throws If canvas limits or initial geometry are invalid, or the source read fails.
   */
  constructor(options: CanvasEditorOptions<Tools>) {
    this.canvas = new Canvas(options.canvas);
    this.tools = options.tools;
    this.source = options.source;
    this.canvas.setElements(this.source.getElements());
  }

  /**
   * Connects source projection before activating tools for a single mounted surface.
   *
   * Disconnect permits remount with retained camera and application-owned settings.
   * A failed setup releases already connected resources. Concurrent mounts must
   * create separate editors rather than sharing this session's mutable state.
   *
   * @returns Idempotent cleanup for this connection only, safe after a later remount.
   * @throws If connected, disposed, or source/tool setup fails.
   */
  connect(): () => void {
    if (this.state !== "disconnected") {
      throw new Error(`Cannot connect a ${this.state} canvas editor`);
    }
    this.state = "connecting";
    let stopSource: (() => void) | undefined;
    let stopTools: (() => void) | undefined;
    try {
      stopSource = this.source.connect(this.canvas);
      stopTools = this.tools.observeChanges();
    } catch (error) {
      this.state = "disconnecting";
      try {
        releaseResources([
          () => {
            throw error;
          },
          () => stopSource?.(),
        ]);
      } finally {
        this.state = "disconnected";
      }
    }
    this.state = "connected";
    let released = false;
    /**
     * Disconnects this mount while preserving the scene for a later connection.
     *
     * @returns Tool observation, active previews and source subscriptions are released once.
     */
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      this.releaseConnection = undefined;
      this.state = "disconnecting";
      try {
        releaseResources([
          () => stopTools?.(),
          () => this.canvas.cancelTransform(),
          () => stopSource?.(),
        ]);
      } finally {
        this.state = "disconnected";
      }
    };
    this.releaseConnection = release;
    return release;
  }

  /**
   * Permanently releases this editor after its application owner discards the surface.
   *
   * React remount cleanup uses the disposer from connect instead. Shared application
   * registries and document storage are not disposed by this surface-local owner.
   *
   * @returns Source, tools and scene observers are released; repeated calls do nothing.
   * @throws Cleanup failures propagate after all owned resources have been released.
   */
  dispose(): void {
    if (this.state === "disposed") {
      return;
    }
    if (this.state === "connecting" || this.state === "disconnecting") {
      throw new Error("Cannot dispose a canvas editor during a connection transition");
    }
    try {
      releaseResources([() => this.releaseConnection?.(), () => this.canvas.dispose()]);
    } finally {
      this.state = "disposed";
    }
  }
}

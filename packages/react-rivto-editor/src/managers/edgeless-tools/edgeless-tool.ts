import type { ReactNode } from "react";
import type { ReactPanelApi } from "../../panels/types";
import type { EdgelessOperations } from "../elements/edgeless-operations";
import type { EdgelessCreationDefaults } from "../elements/edgeless-creation-defaults";
import type { CanvasPoint } from "../../elements/visuals/utils/canvas-point";
import type { CreationSnapOptions } from "../../elements/visuals/utils/creation-geometry";
import { RevisionStore } from "../../internal-store";
import type { EdgelessToolGroup } from "./edgeless-tool-group";

/** Pointer input normalized by the mounted surface; positions are canvas coordinates. */
export interface EdgelessToolPointer {
  readonly point: CanvasPoint;
  readonly pointerId: number;
  readonly button: number;
  readonly shiftKey: boolean;
  readonly zoom: number;
  readonly snapping: CreationSnapOptions;
}

/** Dependencies bound to one registered tool in one surface; never shared across panels. */
export interface EdgelessToolOptions {
  readonly id: string;
  readonly operations: EdgelessOperations;
  readonly defaults: EdgelessCreationDefaults;
  readonly reactPanel: ReactPanelApi;
  readonly group?: EdgelessToolGroup;
}

/** Surface-local tool behavior; subclasses own gestures without changing the event adapter. */
export class EdgelessTool {
  readonly id: string;
  readonly group?: EdgelessToolGroup;
  /** Routes primary canvas input through the common gesture adapter. */
  readonly capturesPointer: boolean = false;
  /** Lets the existing viewport controller pan with the primary pointer. */
  readonly pansViewport: boolean = false;
  /** Keeps the active group popover reachable between creation gestures. */
  readonly keepsMenuOpen: boolean = false;
  private readonly changes = new RevisionStore();

  /**
   * Binds one instance to its registration and receiving surface.
   *
   * @param options - Stable dependencies; construction installs no subscriptions or document records.
   */
  constructor(protected readonly options: EdgelessToolOptions) {
    this.id = options.id;
    this.group = options.group;
  }

  /**
   * Reads the preview version used by React external-store subscriptions.
   *
   * @returns Stable version until this tool publishes a change.
   */
  get revision(): number {
    return this.changes.revision;
  }

  /**
   * Observes local preview changes without subscribing to document mutations.
   *
   * @param listener - Called synchronously after a preview change.
   * @returns Cleanup removing the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }

  /**
   * Activates this instance without creating document content.
   *
   * @param _previous - Previously active tool, if any; subclasses may apply their preset.
   * @returns Leaves the default implementation ready without changing settings.
   */
  activate(_previous?: EdgelessTool): void {}

  /**
   * Cancels local gesture state before another tool becomes active.
   *
   * @returns Discards this tool's uncommitted preview.
   */
  deactivate(): void {
    this.cancel();
  }

  /**
   * Offers primary pointer input to this tool before capture.
   *
   * @param _input - Canvas position and current viewport modifiers.
   * @returns Whether the surface should capture this pointer.
   */
  pointerDown(_input: EdgelessToolPointer): boolean {
    return false;
  }

  /**
   * Updates local hover or gesture state without writing the document.
   *
   * @param _input - Current canvas pointer sample.
   * @returns Leaves the default tool unchanged.
   */
  pointerMove(_input: EdgelessToolPointer): void {}

  /**
   * Completes an accepted pointer gesture.
   *
   * @param _input - Final canvas pointer sample.
   * Implementations commit through managers and clear their captured gesture state;
   * they may retain hover feedback after release.
   *
   * @returns Leaves the default tool unchanged.
   */
  pointerUp(_input: EdgelessToolPointer): void {}

  /**
   * Clears hover feedback when the pointer leaves the capture surface.
   *
   * @returns Leaves the default tool unchanged.
   */
  pointerLeave(): void {}

  /**
   * Discards a pending gesture without document or settings writes.
   *
   * @returns Whether a gesture was cancelled.
   */
  cancel(): boolean {
    return false;
  }

  /**
   * Renders local feedback using this instance's current state.
   *
   * @param _zoom - Canvas scale, where one is 100 percent.
   * @returns A React preview or null when this tool has none.
   */
  renderPreview(_zoom: number): ReactNode {
    return null;
  }

  /**
   * Releases resources owned by this instance after its registration or surface is removed.
   *
   * @returns Cancels previews and clears their subscribers.
   */
  dispose(): void {
    this.deactivate();
    this.changes.clear();
  }

  /**
   * Publishes changed preview state to this tool's consumers.
   *
   * @returns Advances the preview version and notifies subscribers.
   */
  protected changed(): void {
    this.changes.changed();
  }
}

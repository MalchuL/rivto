import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type {
  BlockDropTargetsApi,
  BlockDropTargetRegistration,
  BlockDropDestination,
  ResolvedBlockDropTarget,
} from "./types";

/** Captured installation fields; destination reads remain live until this entry is disposed. */
interface DropTargetEntry extends BlockDropTargetRegistration {
  readonly priority: number;
}

/** Editor-owned regions indexed by DOM identity, without a second block tree or geometry cache. */
export class BlockDropTargets implements BlockDropTargetsApi {
  private readonly targets = new Map<HTMLElement, Set<DropTargetEntry>>();

  /**
   * Borrows the editor's data and current attachment without subscribing or measuring.
   *
   * @param owner - Resource lifecycle capturing synchronous extension registrations.
   * @param blocks - Data source used only to validate candidate parents and neighbors.
   * @param getRoot - Live attachment lookup; returns null while the view is detached.
   */
  constructor(
    private readonly owner: BlockEditorResourceOwner,
    private readonly blocks: BlockEditorBlocks,
    private readonly getRoot: () => HTMLElement | null,
  ) {}

  /**
   * Captures an independently disposable target while retaining its live destination callback.
   *
   * @param registration - Mounted element, finite priority, and live destination getter.
   * @returns Idempotent disposer deleting this entry and its empty element bucket.
   * @throws If destroyed or priority is nonfinite.
   */
  register(registration: BlockDropTargetRegistration): () => void {
    this.owner.assertActive();
    const priority = registration.priority ?? 0;
    if (!Number.isFinite(priority)) {
      throw new Error("Drop target priority must be finite");
    }
    const entry = Object.freeze({ ...registration, priority });
    let entries = this.targets.get(entry.element);
    if (!entries) {
      entries = new Set();
      this.targets.set(entry.element, entries);
    }
    entries.add(entry);
    return this.owner.registerCleanup(() => {
      entries.delete(entry);
      if (entries.size === 0) {
        this.targets.delete(entry.element);
      }
    });
  }

  /**
   * Walks only the topmost browser hit's ancestors inside the current editor.
   *
   * @param clientX - Viewport X coordinate in CSS pixels.
   * @param clientY - Viewport Y coordinate in CSS pixels.
   * @returns Highest-priority valid candidate, preserving nearest/earliest tie order,
   * or undefined for detached, clipped, foreign, or invalid destinations.
   * @throws If destroyed or delegated DOM/data reads fail.
   */
  resolve(clientX: number, clientY: number): ResolvedBlockDropTarget | undefined {
    this.owner.assertActive();
    const root = this.getRoot();
    if (!root?.isConnected || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return undefined;
    }
    let element = root.ownerDocument.elementFromPoint(clientX, clientY);
    if (!element || !root.contains(element)) {
      return undefined;
    }
    const boundary = element.closest("[data-rivto-block-editor]");
    if (boundary && boundary !== root && root.contains(boundary)) {
      return undefined;
    }
    let selected: ResolvedBlockDropTarget | undefined;
    let priority = -Infinity;
    while (element) {
      for (const entry of this.targets.get(element as HTMLElement) ?? []) {
        if (entry.priority <= priority) {
          continue;
        }
        const destination = entry.getDestination();
        if (destination && this.isCurrent(destination)) {
          selected = { element: entry.element, destination };
          priority = entry.priority;
        }
      }
      if (element === root) {
        break;
      }
      element = element.parentElement;
    }
    return selected;
  }

  /**
   * Validates a candidate against live actual children rather than displayed roots or CSS.
   *
   * @param destination - Candidate owned by a mounted region.
   * @returns Whether the real parent exists and a between destination still names an adjacent gap.
   * @throws Propagates delegated node-read failures.
   */
  private isCurrent(destination: BlockDropDestination): boolean {
    const parent = this.blocks.getBlockNode(destination.parentId);
    if (!parent) {
      return false;
    }
    if (destination.kind === "inside") {
      return true;
    }
    const index =
      destination.nextId === null
        ? parent.childIds.length
        : parent.childIds.indexOf(destination.nextId);
    return index >= 0 && (parent.childIds[index - 1] ?? null) === destination.previousId;
  }
}

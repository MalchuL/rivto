import { useLayoutEffect, type ReactNode } from "react";
import {
  EdgelessTool,
  type EdgelessToolPointer,
} from "../../../../managers/edgeless-tools/edgeless-tool";
import type { CanvasPoint } from "../../../../elements/visuals/utils/canvas-point";
import { segmentIntersectsRotatedFrame } from "../../../../elements/visuals/utils/geometry";
import { useEditorRoot } from "../../../../hooks/editor/use-editor-root";
import { VISUAL_ELEMENT_TYPES } from "../../../../elements/visuals/constants";

/** Local erasure targeting with a single deletion command on release. */
export class EraserTool extends EdgelessTool {
  override readonly capturesPointer = true;
  override readonly keepsMenuOpen = true;
  private pointerId?: number;
  private previous?: CanvasPoint;
  private erased = new Set<string>();

  /**
   * Begins a local eraser gesture without deleting records.
   *
   * @param input - First primary pointer sample.
   * @returns Whether this pointer should be captured.
   */
  override pointerDown(input: EdgelessToolPointer): boolean {
    if (input.button !== 0) {
      return false;
    }
    this.pointerId = input.pointerId;
    this.previous = input.point;
    return true;
  }

  /**
   * Adds crossed elements' outermost groups to the local deletion preview.
   *
   * @param input - Current sample from the accepted pointer.
   * @returns Publishes target IDs without deleting document content.
   */
  override pointerMove(input: EdgelessToolPointer): void {
    if (input.pointerId !== this.pointerId || !this.previous) {
      return;
    }
    const operations = this.options.operations;
    for (const element of operations.elements.getElementNodes()) {
      if (
        element.type === VISUAL_ELEMENT_TYPES.group ||
        !segmentIntersectsRotatedFrame(
          this.previous,
          input.point,
          element.frame,
          operations.getRotation(element.id),
        )
      ) {
        continue;
      }
      let id = element.id;
      while (operations.getParentId(id)) {
        id = operations.getParentId(id)!;
      }
      this.erased.add(id);
    }
    this.previous = input.point;
    this.changed();
  }

  /**
   * Deletes the previewed targets through the existing batched operation.
   *
   * @param input - Accepted pointer release.
   * @returns Deletes targets once and clears local feedback.
   * @throws If document deletion fails; feedback is still cleared.
   */
  override pointerUp(input: EdgelessToolPointer): void {
    if (input.pointerId !== this.pointerId) {
      return;
    }
    try {
      this.options.operations.deleteItems([...this.erased]);
    } finally {
      this.cancel();
    }
  }

  /**
   * Drops all pending deletion targets.
   *
   * @returns Whether a gesture was cancelled.
   */
  override cancel(): boolean {
    const active = this.pointerId !== undefined;
    this.pointerId = undefined;
    this.previous = undefined;
    this.erased = new Set();
    this.changed();
    return active;
  }

  /**
   * Marks existing target hosts without mutating document records.
   *
   * @param _zoom - Unused canvas scale; targeting is calculated in canvas units.
   * @returns A scoped DOM feedback component.
   */
  override renderPreview(_zoom: number): ReactNode {
    return <EraseTargets ids={[...this.erased]} />;
  }
}

/**
 * Applies and removes erasure feedback on hosts inside the receiving editor root.
 *
 * @param props - Current IDs, including selected outermost groups.
 * @returns No additional DOM.
 */
function EraseTargets({ ids }: { readonly ids: readonly string[] }) {
  const { element: root } = useEditorRoot();
  useLayoutEffect(() => {
    const marked: HTMLElement[] = [];
    root?.querySelectorAll<HTMLElement>("[data-edgeless-object-id]").forEach((host) => {
      if (ids.includes(host.dataset.edgelessObjectId!)) {
        host.dataset.edgelessEraseTarget = "true";
        marked.push(host);
      }
    });
    return () => marked.forEach((host) => delete host.dataset.edgelessEraseTarget);
  }, [root, ids]);
  return null;
}

/** Uses the existing viewport pan behavior instead of capturing object gestures. */
export class PanTool extends EdgelessTool {
  override readonly pansViewport = true;
}

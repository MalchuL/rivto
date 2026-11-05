import { BlockDropFeedback } from "@chulane/rivto-page";
import type { EditorEvent } from "../../../managers/events/editor-event";
import { isInPanel } from "../../../panels/panel-dom";
import { fileCaretRangeAtPoint, pageFileDropTarget } from "./file-destination";
import type { FileIngestionPoint } from "./types";

/** Displays the current Page file-drop target without changing the selection. */
export class FileDropFeedback {
  private root?: HTMLElement;
  private feedback?: BlockDropFeedback;
  private caret?: HTMLElement;
  private releasePanel?: () => void;

  /**
   * Binds feedback cleanup to the owning ingestion lifecycle.
   *
   * @param signal - Aborted when the file or image extension is removed.
   */
  constructor(signal: AbortSignal) {
    signal.addEventListener("abort", () => this.clear(), { once: true });
  }

  /**
   * Shows the Page target under a file drag without moving the native caret.
   *
   * A text target shows its block outline and a caret when browser hit testing
   * can locate one. Other targets use the same geometry as file insertion.
   * Edgeless surfaces do not display Page feedback.
   *
   * @param event - Current drag event and its receiving panel.
   * @returns Updates or removes the current feedback.
   * @throws If delegated geometry lookup or DOM operations fail.
   */
  update(event: EditorEvent<"surface", "dragover">): void {
    if (event.mode !== "block") {
      this.clear();
      return;
    }
    if (this.root !== event.root) {
      this.attach(event);
    }
    const point = { x: event.raw.clientX, y: event.raw.clientY };
    if (event.contentElement && event.blockElement && event.blockId) {
      this.feedback?.update({
        element: event.blockElement,
        outlineElement: event.blockElement,
        destination: { kind: "inside", parentId: event.blockId },
      });
      this.updateCaret(event.contentElement, point);
    } else {
      this.removeCaret();
      this.feedback?.update(pageFileDropTarget(event, point));
    }
  }

  /**
   * Removes feedback and releases the active panel and browser listeners.
   *
   * @returns The drag no longer owns any feedback or subscriptions.
   * @throws A cleanup failure, or AggregateError if several releases fail.
   */
  clear(): void {
    if (!this.root && !this.feedback && !this.caret && !this.releasePanel) {
      return;
    }
    const root = this.root;
    const feedback = this.feedback;
    const caret = this.caret;
    const releasePanel = this.releasePanel;
    this.root = undefined;
    this.feedback = undefined;
    this.caret = undefined;
    this.releasePanel = undefined;
    const releases = [
      () => caret?.remove(),
      () => root?.removeEventListener("dragleave", this.onLeave, true),
      () => root?.ownerDocument.removeEventListener("drop", this.onFinish, true),
      () => root?.ownerDocument.removeEventListener("dragend", this.onFinish, true),
      () => root?.ownerDocument.defaultView?.removeEventListener("blur", this.onFinish),
      () => feedback?.clear(),
      () => releasePanel?.(),
    ];
    const errors: unknown[] = [];
    for (const release of releases) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "File drop feedback cleanup failed");
    }
  }

  /**
   * Clears feedback when a drag ends, is dropped, or the browser loses focus.
   *
   * @returns All feedback owned by the active drag is released.
   * @throws If feedback cleanup fails.
   */
  private readonly onFinish = (): void => {
    this.clear();
  };

  /**
   * Clears feedback only when the drag leaves the active surface, not a child.
   *
   * @param event - Native drag-leave event from the surface.
   * @returns Feedback remains only while the pointer is inside the surface.
   * @throws If browser hit testing or feedback cleanup fails.
   */
  private readonly onLeave = (event: DragEvent): void => {
    const root = this.root;
    if (!root) {
      return;
    }
    const next = event.relatedTarget;
    const NodeConstructor = root.ownerDocument.defaultView?.Node;
    if (NodeConstructor && next instanceof NodeConstructor && root.contains(next)) {
      const ElementConstructor = root.ownerDocument.defaultView?.Element;
      const element =
        ElementConstructor && next instanceof ElementConstructor ? next : next.parentElement;
      if (element && isInPanel(root, element)) {
        return;
      }
    }
    if (!next) {
      const hit = root.ownerDocument.elementFromPoint(event.clientX, event.clientY);
      if (hit && root.contains(hit) && isInPanel(root, hit)) {
        return;
      }
    }
    this.clear();
  };

  /**
   * Starts feedback for the receiving panel and subscribes to its cleanup.
   *
   * @param event - Drag event supplying the panel and surface root.
   * @returns The new root owns feedback until the drag or panel ends.
   * @throws If panel cleanup registration fails.
   */
  private attach(event: EditorEvent<"surface", "dragover">): void {
    this.clear();
    const { root, reactPanel } = event;
    this.root = root;
    this.feedback = new BlockDropFeedback(root);
    try {
      this.releasePanel = reactPanel.registerCleanup(() => this.clear());
      root.addEventListener("dragleave", this.onLeave, true);
      root.ownerDocument.addEventListener("drop", this.onFinish, true);
      root.ownerDocument.addEventListener("dragend", this.onFinish, true);
      root.ownerDocument.defaultView?.addEventListener("blur", this.onFinish);
    } catch (error) {
      try {
        this.clear();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "File drop feedback setup failed");
      }
      throw error;
    }
  }

  /**
   * Draws a caret at the same browser hit-test position used by insertion.
   *
   * @param content - Editable content under the pointer.
   * @param point - Pointer position in viewport pixels.
   * @returns The caret is placed or hidden when hit testing misses the content.
   */
  private updateCaret(content: HTMLElement, point: FileIngestionPoint): void {
    const range = fileCaretRangeAtPoint(content.ownerDocument, point);
    if (!range || !content.contains(range.startContainer)) {
      this.removeCaret();
      return;
    }
    const rect = range.getBoundingClientRect();
    const fallback = content.getBoundingClientRect();
    if (!this.caret) {
      this.caret = content.ownerDocument.createElement("div");
      this.caret.className = "rivto-file-drop-caret";
      this.caret.setAttribute("aria-hidden", "true");
      this.root?.append(this.caret);
    }
    this.caret.style.left = `${rect.height ? rect.left : fallback.left}px`;
    this.caret.style.top = `${rect.height ? rect.top : fallback.top}px`;
    this.caret.style.height = `${rect.height || fallback.height}px`;
  }

  /**
   * Removes the temporary visual caret without changing the native selection.
   *
   * @returns No file-drop caret remains mounted.
   */
  private removeCaret(): void {
    this.caret?.remove();
    this.caret = undefined;
  }
}

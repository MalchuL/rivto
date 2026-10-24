import type { EditorBlock as Block } from "@chulane/rivto";
import type { ReactNode } from "react";
import type { BlockDragTargetScope, ResolvedBlockDropTarget } from "@chulane/rivto-page";
import type { CrossDocumentBlockPanel } from "./cross-document/panel";

/** Live receiving attachment using canonical Page geometry in either surface. */
export interface CrossDocumentPageRootController extends BlockDragTargetScope {
  readonly reactPanel: CrossDocumentBlockPanel;
  readonly root: HTMLElement;
  /**
   * Resolves native receiving geometry and semantic policy for another source occurrence.
   *
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param sources - Live detached source roots, including selected subtrees not mounted.
   * @param sourceDocumentId - Actual source model identity used for same-document exclusion.
   * @param nativeHit - Optional current hit; omitted when the receiver must hit-test afresh.
   * @returns Current canonical destination and feedback, or null outside an eligible destination.
   */
  resolvePlacement: (
    x: number,
    y: number,
    sources: readonly Block[],
    sourceDocumentId: string,
    nativeHit?: Element,
  ) => ResolvedBlockDropTarget | null;
}

/** Properties for the page drag-and-drop boundary. */
export interface PageDragExtensionOptions {
  readonly children: ReactNode;
  readonly activationDistance?: number;
}

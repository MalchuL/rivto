import type { RefCallback, RefObject } from "react";
import type { InputRoot } from "@chulane/rivto-root";
import type { EditableText } from "@chulane/rivto-root";
import type { ReactPanelSurfaceApi } from "../../panels/types";
import type { UseBlockNodeResult } from "./use-block";
import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
  PREVENT_TEXT_EDITING_ATTRIBUTE,
} from "../../constants";

/** Text operations borrowed by a block's composition and synchronization policy. */
export type BlockEditableText = Pick<
  EditableText,
  "getIdentity" | "isCurrent" | "readText" | "synchronize"
>;

/**
 * Props for an interactive child that handles its own pointer-driven editing.
 *
 * Stopping propagation keeps an ancestor preview from switching the complete
 * block to raw-text mode. The marker also gives delegated extensions a stable
 * way to recognize the same opt-out without depending on component classes.
 */
export interface PreventTextEditingAttributes {
  readonly [PREVENT_TEXT_EDITING_ATTRIBUTE]: "";
  /**
   * Gives the nested control its pointer gesture when React delivers input.
   *
   * Spread this callback on the control; a direct call outside React does nothing.
   *
   * @returns Parent propagation is stopped and an eligible selection is tracked.
   * @throws Propagates Root selection and subscription failures.
   */
  onPointerDown(): void;
}

/** Panel availability borrowed while a nested text selection is active. */
export type NestedSelectionPanel = Pick<
  ReactPanelSurfaceApi,
  "inputRoot" | "subscribeAvailability"
>;

/** Local resources retained for one nested editable selection. */
export interface NestedSelectionSession {
  /** Exact occurrence that admitted this selection. */
  readonly root: Pick<InputRoot, "isAttached">;
  /** Releases Root's pointer tracking when a gesture was accepted. */
  cancel?: () => void;
  /** Releases the temporary panel availability observation. */
  unsubscribe?: () => void;
  /** Whether Root has already completed or cancelled the gesture. */
  finished: boolean;
}

/** Props spread onto any renderer region from which selection may begin. */
export interface BlockSelectionAnchorAttributes {
  /**
   * Presence marker consumed by the text-selection extension for gesture eligibility.
   *
   * Text mode places it on the contenteditable alongside `data-block-content`;
   * structural mode places it on the region representing the complete block.
   * Interactive elements must ignore clicks whose event is `defaultPrevented`
   * because a completed pointer drag claims the browser's synthetic click.
   */
  readonly [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "";
}

/** Props spread onto a collaborative plain-text contenteditable element. */
export interface BlockTextEditingAttributes extends BlockSelectionAnchorAttributes {
  /** Mounting callback used to identify the editable host without exposing its element. */
  readonly ref: RefCallback<HTMLDivElement>;
  /** Native plain-text editing mode; rich HTML is not persisted by this hook. */
  readonly contentEditable: "plaintext-only";
  /** Acknowledges that the browser, rather than React children, owns the text. */
  readonly suppressContentEditableWarning: true;
  /** Stable marker used by delegated events and selection utilities. */
  readonly [BLOCK_CONTENT_ATTRIBUTE]: "";
  /**
   * Persists a browser edit delivered by React to the mounted editable.
   *
   * Spread this callback on the editable; a direct call outside React does nothing.
   *
   * @returns Current plain text is committed when composition is inactive.
   * @throws Propagates text-read and document update failures.
   */
  onInput(): void;
  /**
   * Defers external synchronization while the mounted editable is composing.
   *
   * Spread this callback on the editable; a direct call outside React does nothing.
   *
   * @returns The active composition owns the editable text.
   */
  onCompositionStart(): void;
  /**
   * Commits the completed composition from the mounted editable.
   *
   * Spread this callback on the editable; a direct call outside React does nothing.
   *
   * @returns The final composition text is committed.
   * @throws Propagates text-read and document update failures.
   */
  onCompositionEnd(): void;
}

/** Optional host transaction around each text-input or composition-end delivery. */
export interface UseBlockEditingOptions {
  /**
   * Runs an input operation synchronously inside the host's transaction.
   *
   * @param apply - Applies the current input or completed composition.
   * @returns The supplied operation and host transaction have completed.
   * @throws Propagates input, transaction, and document update failures.
   */
  runTextInput?(apply: () => void): void;
}

/**
 * Renderer-facing block state, typed property commands, and text DOM attributes.
 *
 * `block` is the reactive node snapshot from `useBlockNode` and does not include
 * descendants. For callbacks created during an older render, read current values
 * through panel.blocks.getBlockNode(blockId), not the captured snapshot.
 * Current document content excludes uncommitted DOM edits; undefined denotes an
 * unknown/deleted block, while an empty string denotes an existing textless block.
 */
export interface UseBlockEditingResult<
  Props extends object = Record<string, unknown>,
> extends UseBlockNodeResult<Props> {
  /** DOM props for the single collaborative plain-text editable. */
  readonly attributes: BlockTextEditingAttributes;
  /** Props for controls or nested editors that must not activate raw block editing. */
  readonly preventTextEditingAttributes: PreventTextEditingAttributes;
}

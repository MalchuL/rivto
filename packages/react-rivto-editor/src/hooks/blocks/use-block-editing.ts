import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type RefObject,
} from "react";
import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
} from "../../constants";
import { useEditorContext } from "../../editor-context";
import {
  restoreDOMSelection,
  saveDOMSelection,
} from "../../managers";
import {
  useBlock,
  type UseBlockResult,
} from "./use-block";

/** Selects which browser interaction attributes the hook returns. */
export interface UseBlockEditingOptions<TextEdit extends boolean = boolean> {
  /**
   * Enables collaborative plain-text contenteditable synchronization.
   *
   * True by default. Set this to false for a contentless or control-based
   * custom block. Both modes return a selection-anchor marker; text mode also
   * returns the content marker and synchronization handlers.
   */
  readonly textEdit?: TextEdit;
}

/** Props spread onto a collaborative plain-text contenteditable element. */
export interface BlockTextEditingAttributes extends BlockSelectionAnchorAttributes {
  /** Ref used to synchronize external content and preserve DOM selections. */
  readonly ref: RefObject<HTMLDivElement | null>;
  /** Native plain-text editing mode; rich HTML is not persisted by this hook. */
  readonly contentEditable: "plaintext-only";
  /** Acknowledges that the browser, rather than React children, owns the text. */
  readonly suppressContentEditableWarning: true;
  /** Stable marker used by delegated events and DOM-selection utilities. */
  readonly [BLOCK_CONTENT_ATTRIBUTE]: "";
  /** Persists native browser edits through the block command API. */
  readonly onInput: NonNullable<HTMLAttributes<HTMLDivElement>["onInput"]>;
  /** Defers synchronization while an IME composition is active. */
  readonly onCompositionStart: NonNullable<HTMLAttributes<HTMLDivElement>["onCompositionStart"]>;
  /** Commits the completed IME composition as one plain-text update. */
  readonly onCompositionEnd: NonNullable<HTMLAttributes<HTMLDivElement>["onCompositionEnd"]>;
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

/**
 * Props for an interactive child that handles its own pointer-driven editing.
 *
 * Stopping propagation keeps an ancestor preview from switching the complete
 * block to raw-text mode. The marker also gives delegated extensions a stable
 * way to recognize the same opt-out without depending on component classes.
 */
export interface PreventTextEditingAttributes {
  readonly "data-prevent-text-editing": "";
  readonly onPointerDown: NonNullable<HTMLAttributes<HTMLElement>["onPointerDown"]>;
}

/** Mode-specific DOM attributes returned by {@link useBlockEditing}. */
export type BlockEditingAttributes<TextEdit extends boolean> = TextEdit extends true
  ? BlockTextEditingAttributes
  : BlockSelectionAnchorAttributes;

/**
 * Renderer-facing block state, property methods, commands, and DOM attributes.
 *
 * `block` is the reactive detached snapshot from `useBlock`. Imperative getters
 * resolve the latest editor state when called, which makes them safe inside
 * callbacks created during an older render.
 */
export interface UseBlockEditingResult<
  Props extends object,
  TextEdit extends boolean,
> extends UseBlockResult {
  /** Reads the latest complete property object, or undefined after deletion. */
  readonly getProps: () => Readonly<Props> | undefined;
  /** Reads one latest property value, or undefined after deletion/removal. */
  readonly getProp: <Key extends keyof Props>(key: Key) => Props[Key] | undefined;
  /** Validates and patches multiple native properties without replacing others. */
  readonly setProps: (props: Partial<Props>) => void;
  /** Validates and sets one native property; undefined removes that key. */
  readonly setProp: <Key extends keyof Props>(key: Key, value: Props[Key] | undefined) => void;
  /** DOM props for the requested text or structural editing mode. */
  readonly attributes: BlockEditingAttributes<TextEdit>;
  /** Props for controls or nested editors that must not activate raw block editing. */
  readonly preventTextEditingAttributes: PreventTextEditingAttributes;
}

/**
 * Connects a renderer to one block's state, properties, and browser interaction.
 *
 * The hook always creates the same React refs, effects, and callbacks, even
 * when `textEdit` changes. Only the returned `attributes` object varies, so
 * changing mode cannot violate React's hook-order rules.
 *
 * In text mode, external commands, undo/redo, and remote CRDT updates reconcile
 * into the contenteditable before paint. DOM selection offsets are saved and
 * restored when replacement is necessary, while IME composition owns the DOM
 * until composition end.
 *
 * In structural mode, the returned presence marker explicitly opts the spread
 * region into whole-block drag anchoring. Enter/Tab behavior, clipboard policy,
 * block selection, and slash commands remain extension responsibilities.
 *
 * @example
 * ```tsx
 * const editing = useBlockEditing<{ count: number }>(
 *   blockId,
 *   { textEdit: false },
 * );
 * return (
 *   <button {...editing.attributes}>
 *     Count: {editing.getProp("count") ?? 0}
 *   </button>
 * );
 * ```
 *
 * @param blockId - Stable ID permanently bound to returned methods.
 * @param options - Interaction mode; collaborative text editing is the default.
 * @returns Reactive block state, current-value property methods, commands, and DOM attributes.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockEditing<Props extends object = Record<string, unknown>>(
  blockId: string,
  options: { readonly textEdit: false },
): UseBlockEditingResult<Props, false>;
export function useBlockEditing<Props extends object = Record<string, unknown>>(
  blockId: string,
  options?: { readonly textEdit?: true },
): UseBlockEditingResult<Props, true>;
export function useBlockEditing<Props extends object = Record<string, unknown>>(
  blockId: string,
  options: UseBlockEditingOptions,
): UseBlockEditingResult<Props, boolean>;
export function useBlockEditing<Props extends object = Record<string, unknown>>(
  blockId: string,
  options: UseBlockEditingOptions = {},
): UseBlockEditingResult<Props, boolean> {
  const { editor } = useEditorContext();
  const blockResult = useBlock(blockId);
  const elementRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const pointerCleanupRef = useRef<(() => void) | undefined>(undefined);
  const textEdit = options.textEdit !== false;

  useEffect(() => () => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = undefined;
  }, []);

  // Reconcile command-driven or remote content without treating the detached
  // block snapshot as mutable React state. Structural mode never attaches this
  // ref, but retaining the effect keeps hook ordering stable across modes.
  useLayoutEffect(() => {
    if (!textEdit) return;
    const element = elementRef.current;
    if (!element || composingRef.current) return;

    const content = blockResult.block?.content ?? "";
    if (element.textContent === content) return;

    const selection = saveDOMSelection(element);
    element.textContent = content;
    restoreDOMSelection(element, selection);
  }, [blockResult.block?.content, textEdit]);

  const commit = useCallback((element: HTMLDivElement) => {
    // ponytail: composition commits whole plain text; use beforeinput deltas if
    // concurrent character-level IME merging becomes a demonstrated need.
    blockResult.operations.setContent(element.textContent ?? "");
  }, [blockResult.operations]);

  const onInput = useCallback<BlockTextEditingAttributes["onInput"]>((event) => {
    if (!composingRef.current) commit(event.currentTarget);
  }, [commit]);

  const onCompositionStart = useCallback<BlockTextEditingAttributes["onCompositionStart"]>(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback<BlockTextEditingAttributes["onCompositionEnd"]>((event) => {
    composingRef.current = false;
    commit(event.currentTarget);
  }, [commit]);

  const preventTextEditingPointerDown = useCallback<PreventTextEditingAttributes["onPointerDown"]>((event) => {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target.isContentEditable) return;
    // This hook owns the editable child's selection gesture. Prevent the
    // browser from running a second rich-content selection over highlighted DOM.
    event.preventDefault();
    const document = target.ownerDocument;
    const selection = document.getSelection();
    const anchor = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (!selection || !anchor || !target.contains(anchor.offsetNode)) return;
    target.focus({ preventScroll: true });
    selection.setBaseAndExtent(
      anchor.offsetNode,
      anchor.offset,
      anchor.offsetNode,
      anchor.offset,
    );

    const view = document.defaultView;
    if (!view) return;
    const pointerId = event.pointerId;
    let focus = anchor;
    pointerCleanupRef.current?.();
    const extend = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const next = document.caretPositionFromPoint?.(move.clientX, move.clientY);
      if (!next || !target.contains(next.offsetNode)) return;
      focus = next;
      selection.setBaseAndExtent(
        anchor.offsetNode,
        anchor.offset,
        next.offsetNode,
        next.offset,
      );
    };
    const cleanup = (): void => {
      view.removeEventListener("pointermove", extend);
      view.removeEventListener("pointerup", finish);
      view.removeEventListener("pointercancel", finish);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = undefined;
    };
    const finish = (end: PointerEvent) => {
      if (end.pointerId !== pointerId) return;
      cleanup();
      target.focus({ preventScroll: true });
      selection.setBaseAndExtent(
        anchor.offsetNode,
        anchor.offset,
        focus.offsetNode,
        focus.offset,
      );
    };
    pointerCleanupRef.current = cleanup;
    view.addEventListener("pointermove", extend);
    view.addEventListener("pointerup", finish);
    view.addEventListener("pointercancel", finish);
  }, []);

  const getProps = useCallback((): Readonly<Props> | undefined => (
    editor.blocks.getBlock(blockId)?.props as Props | undefined
  ), [blockId, editor]);

  const getProp = useCallback(<Key extends keyof Props,>(key: Key): Props[Key] | undefined => (
    getProps()?.[key]
  ), [getProps]);

  const setProps = useCallback((props: Partial<Props>): void => {
    editor.blocks.updateBlock(blockId, { props: props as Record<string, unknown> });
  }, [blockId, editor]);

  const setProp = useCallback(<Key extends keyof Props,>(
    key: Key,
    value: Props[Key] | undefined,
  ): void => {
    editor.blocks.setBlockProp(blockId, String(key), value);
  }, [blockId, editor]);

  const attributes: BlockTextEditingAttributes | BlockSelectionAnchorAttributes = textEdit
    ? {
      ref: elementRef,
      contentEditable: "plaintext-only",
      suppressContentEditableWarning: true,
      [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "",
      [BLOCK_CONTENT_ATTRIBUTE]: "",
      onInput,
      onCompositionStart,
      onCompositionEnd,
    }
    : { [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" };
  const preventTextEditingAttributes = useMemo<PreventTextEditingAttributes>(() => ({
    "data-prevent-text-editing": "",
    onPointerDown: preventTextEditingPointerDown,
  }), [preventTextEditingPointerDown]);

  return {
    ...blockResult,
    getProps,
    getProp,
    setProps,
    setProp,
    attributes,
    preventTextEditingAttributes,
  } as UseBlockEditingResult<Props, boolean>;
}

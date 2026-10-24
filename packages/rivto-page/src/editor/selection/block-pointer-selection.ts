import { BlockAutoScroll } from "../pointer/block-auto-scroll";
import type { BlockInputResult } from "../events/block-input-event";
import type { HeldKeyBinding } from "@chulane/rivto-keyboard";
import type { BlockEditorApi } from "../block-editor-api";
import type { BlockInputEvent } from "../events/block-input-event";
import type { BlockSelectionPosition as EditorPosition, BlockSelectionSnapshot } from "./types";
import { BlockDOMSelection, type DOMSelectionPoint } from "./block-dom-selection";
import { BlockSelectionRanges } from "./block-selection-ranges";
import { BlockSelectionEndpoints } from "./block-selection-endpoints";
import type { BlockSelectionBindings } from "./block-selection-extensions";
/** Ordinary selection follows explicit drag and modifier-driven selection handlers. */
const BLOCK_SELECTION_INPUT_PRIORITY = 0;

const BLOCK_SELECTION_ANCHOR_SELECTOR = "[data-block-selection-anchor]";
const PREVENT_TEXT_EDITING_SELECTOR = "[data-prevent-text-editing]";
const EDITOR_CONTROL_SELECTOR =
  "[data-editor-control], button, input, textarea, select, a, [role=button]";
const STRUCTURAL_SELECTION_EXCLUDED_TARGET_SELECTOR = `[data-block-content], ${PREVENT_TEXT_EDITING_SELECTOR}, ${EDITOR_CONTROL_SELECTOR}`;
/** Host selection operations borrowed by optional pointer features. */
interface BlockSelectionAdapter {
  readonly selection: Pick<
    BlockEditorApi["adapter"]["selection"],
    "get" | "set" | "clear" | "getSelectableBlockIds" | "getTextLength" | "canStartSelection"
  >;
}

/** Pointer behaviors coordinated by the shared gesture state. */
export type BlockPointerSelectionFeature = "click" | "toggle" | "range" | "pointer";

/** Interaction capabilities borrowed by the optional selection implementation. */
export interface BlockPointerSelectionHost {
  readonly pointer: BlockEditorApi["pointer"];
  readonly events: Pick<BlockEditorApi["events"], "register" | "observe" | "onDetach">;
  readonly keyboard: Pick<BlockEditorApi["keyboard"], "capture" | "isHeld">;
  readonly adapter: BlockSelectionAdapter;
}

/** Pointer-down origin and evolving selection, owned by one controller. */
interface PointerSelection {
  readonly root: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly anchor?: DOMSelectionPoint;
  readonly anchorPosition: EditorPosition;
  crossBlock: boolean;
  head?: DOMSelectionPoint;
  selection?: BlockSelectionSnapshot;
  wholeBlocks: boolean;
}
/** Latest client coordinates and captured binding evaluated against live keys. */
interface PointerSelectionCoordinates {
  readonly x: number;
  readonly y: number;
  readonly exact: boolean;
}
/** Owns pointer selection, delayed range restoration, and auto-scroll for one editor. */
export class BlockPointerSelection {
  private readonly dom: BlockDOMSelection;
  private readonly features = new Set<BlockPointerSelectionFeature>();
  private pointerId: number | undefined;
  private exactBinding: HeldKeyBinding | undefined;
  private pointer: PointerSelection | null = null;
  private timerView: Window | null = null;
  private autoScroll: BlockAutoScroll | undefined;
  private releasePointer: (() => void) | undefined;
  private releaseTimer: number | undefined;
  private suppressClickBlockId: string | undefined;
  private ownsCrossBlockSelection = false;
  private latestPointer: PointerSelectionCoordinates | undefined;

  /**
   * Coordinates optional selection capabilities through bounded editor APIs.
   *
   * @param editor - Borrowed input registration, held-key queries, pointer reservation and selection data.
   * @param bindings - Host semantic action IDs; no default keys are installed.
   */
  constructor(
    private readonly editor: BlockPointerSelectionHost,
    private readonly bindings: BlockSelectionBindings,
  ) {
    this.dom = new BlockDOMSelection(editor.adapter.selection);
  }

  /**
   * Installs one independently disposable selection capability.
   *
   * @param feature - Capability to install for the current extension scope.
   * @returns Cleanup cancelling active work before captured registrations are released.
   */
  install(feature: BlockPointerSelectionFeature): () => void {
    if (this.features.has(feature)) {
      throw new Error(`Selection feature ${feature} is already installed`);
    }
    this.features.add(feature);
    try {
      return this.installFeature(feature);
    } catch (error) {
      this.features.delete(feature);
      this.cancel();
      throw error;
    }
  }

  /**
   * Reads whether a pointer gesture or its delayed native restoration owns selection.
   *
   * @returns True while native selectionchange must leave synthetic coverage intact.
   */
  isSelectionOwned(): boolean {
    return this.ownsCrossBlockSelection;
  }

  /**
   * Reads whether structural toggle selection is currently installed.
   *
   * @returns Whether the capability remains installed.
   */
  isToggleInstalled(): boolean {
    return this.features.has("toggle");
  }

  /**
   * Installs scoped listeners after reserving the feature identity.
   *
   * @param feature - Capability to activate.
   * @returns Cleanup removing active feature state and pending gesture work.
   */
  private installFeature(feature: BlockPointerSelectionFeature): () => void {
    const events = this.editor.events;
    if (feature === "pointer" || feature === "range") {
      this.installStart(feature);
    }
    if (feature === "pointer") {
      this.installPointer();
    }
    if (feature === "click") {
      this.installClick();
    }
    if (feature === "toggle") {
      this.installToggle();
    }
    events.onDetach(this.cancel);
    events.observe(
      `selection.${feature}.escape`,
      { type: "keydown", target: "window", priority: BLOCK_SELECTION_INPUT_PRIORITY },
      (event) => {
        if (event.raw.key === "Escape") {
          this.cancel();
        }
      },
    );
    events.observe(
      `selection.${feature}.blur`,
      { type: "blur", target: "window", priority: BLOCK_SELECTION_INPUT_PRIORITY },
      this.cancel,
    );
    return () => {
      this.features.delete(feature);
      this.cancel();
    };
  }

  /**
   * Installs start selection registrations into the current extension scope.
   *
   * @param feature - Pointer-start behavior and dispatch priority to install.
   * @returns Feature registrations have been captured by the extension owner.
   */
  private installStart(feature: "pointer" | "range"): void {
    const events = this.editor.events;
    events.register(
      `selection.${feature}.start`,
      { type: "pointerdown", scope: "block", priority: feature === "range" ? 20 : 0 },
      (event) => {
        if (
          feature === "range" &&
          !this.editor.keyboard.isHeld(this.editor.keyboard.capture(this.bindings.range))
        ) {
          return "continue";
        }
        if (
          feature === "pointer" &&
          this.bindingHeld(this.bindings.range) &&
          this.features.has("range")
        ) {
          return "continue";
        }
        return this.onPointerDown(event);
      },
    );
  }
  /**
   * Installs pointer selection registrations into the current extension scope.
   *
   * @returns Feature registrations have been captured by the extension owner.
   */
  private installPointer(): void {
    const events = this.editor.events;
    events.register(
      "selection.move",
      {
        type: "pointermove",
        target: "window",
        capture: true,
        priority: BLOCK_SELECTION_INPUT_PRIORITY,
      },
      this.onPointerMove,
    );
    events.observe(
      "selection.end",
      {
        type: "pointerup",
        target: "window",
        capture: true,
        priority: BLOCK_SELECTION_INPUT_PRIORITY,
      },
      (event) => {
        if (event.raw.pointerId === this.pointerId) {
          this.stop();
        }
      },
    );
    events.observe(
      "selection.cancel",
      {
        type: "pointercancel",
        target: "window",
        capture: true,
        priority: BLOCK_SELECTION_INPUT_PRIORITY,
      },
      (event) => {
        if (event.raw.pointerId === this.pointerId) {
          this.cancel();
        }
      },
    );
    events.register(
      "selection.suppress-click",
      { type: "click", capture: true, scope: "block", priority: 100 },
      (event) => {
        if (this.suppressClickBlockId === event.blockId) {
          this.suppressClickBlockId = undefined;
          event.raw.preventDefault();
          return "handled";
        }
        return "continue";
      },
    );
  }
  /**
   * Installs click selection registrations into the current extension scope.
   *
   * @returns Feature registrations have been captured by the extension owner.
   */
  private installClick(): void {
    const events = this.editor.events;
    events.register(
      "selection.click",
      { type: "click", capture: true, scope: "block", priority: BLOCK_SELECTION_INPUT_PRIORITY },
      this.onClick,
    );
    events.observe(
      "selection.clear",
      {
        type: "pointerdown",
        capture: true,
        scope: "root",
        priority: BLOCK_SELECTION_INPUT_PRIORITY,
      },
      this.onPlainPointerDown,
    );
  }
  /**
   * Releases existing coverage before a plain pointer enters text or page whitespace.
   *
   * Controls retain coverage for their commands. Modifier gestures keep their
   * existing anchor, and native ranges are cleared before delayed selectionchange.
   *
   * @param input - Primary input scoped to this occurrence, excluding nested editors.
   * @returns Previous coverage is released when ordinary selection may begin.
   */
  private onPlainPointerDown = ({ raw, root }: BlockInputEvent<"pointerdown">): void => {
    if (
      this.editor.adapter.selection.canStartSelection?.(raw) === false ||
      raw.button !== 0 ||
      (this.features.has("toggle") && this.bindingHeld(this.bindings.toggle)) ||
      this.bindingHeld(this.bindings.range) ||
      !this.isElement(raw.target) ||
      raw.target.closest(`${EDITOR_CONTROL_SELECTOR}, ${PREVENT_TEXT_EDITING_SELECTOR}`)
    ) {
      return;
    }
    this.editor.adapter.selection.clear();
    root.ownerDocument.getSelection()?.removeAllRanges();
  };

  /**
   * Installs toggle selection registrations into the current extension scope.
   *
   * @returns Feature registrations have been captured by the extension owner.
   */
  private installToggle(): void {
    const events = this.editor.events;
    events.register(
      "selection.toggle",
      { type: "pointerdown", capture: true, scope: "block", priority: 50 },
      this.onToggle,
    );
  }

  /**
   * Reads canonical selectable order from the host, including collapse filtering.
   *
   * @param _root - Current occurrence; ordering comes from its adapter, not DOM queries.
   * @returns Block IDs in the order selection commands must cover.
   */
  private selectionBlockIds = (_root: HTMLElement): readonly string[] =>
    this.editor.adapter.selection.getSelectableBlockIds();

  /**
   * Publishes the synthetic endpoint chosen for a cross-host gesture.
   *
   * @param active - Current gesture retaining the fixed endpoint and latest coverage.
   * @param head - Native endpoint, or undefined for structural contentless blocks.
   * @param headPosition - Portable moving UTF-16 endpoint.
   * @param forceWholeBlocks - Whether to replace text offsets with whole-block sentinels.
   * @returns Host coverage and native range reflect the resolved endpoints when valid.
   */
  private publish = (
    active: PointerSelection,
    head: DOMSelectionPoint | undefined,
    headPosition: EditorPosition,
    forceWholeBlocks = false,
  ): void => {
    const root = active.root;
    active.crossBlock = headPosition.blockId !== active.anchorPosition.blockId;
    active.head = head;
    active.wholeBlocks = forceWholeBlocks;
    active.selection = active.wholeBlocks
      ? this.dom.createVisibleStructuralSelection(
          this.selectionBlockIds(root),
          active.anchorPosition.blockId,
          headPosition.blockId,
        )
      : this.dom.createSelection(active.anchorPosition, headPosition);
    if (!active.selection) {
      return;
    }

    this.editor.adapter.selection.set(active.selection);
    if (active.wholeBlocks) {
      root.ownerDocument.getSelection()?.removeAllRanges();
      // Keep the originating contenteditable focused for the duration of the
      // gesture. Focusing the root here would blur MarkdownContent, replace
      // its raw editor with formatted preview geometry, and make a return to
      // the original block resolve a different character offset.
    } else if (active.anchor && head) {
      this.dom.setNativeSelection(active.anchor, head);
    }
  };

  /**
   * Resolves and publishes the moving endpoint at current pointer coordinates.
   * @param active - Gesture retaining the fixed endpoint.
   * @param current - Latest viewport coordinates and selection modifiers.
   * @returns Whether the pointer currently identifies a selectable endpoint.
   */
  private updatePointerSelection = (
    active: PointerSelection,
    current: PointerSelectionCoordinates,
  ): boolean => {
    const root = active.root;
    const pointedBlockId = this.dom.readBlockIdAtPoint(root, current.x, current.y);
    const head = active.anchor
      ? this.dom.readDOMSelectionPoint(root, current.x, current.y)
      : undefined;
    const headPosition = head && this.dom.readDOMPointPosition(root, head);
    // Caret hit-testing falls back to a nearby editable host over contentless
    // blocks. The configured exact-endpoint binding keeps that DOM point only for native painting and
    // uses the actual BlockView hit as the portable selection endpoint.
    //
    // Nested parents wrap descendant rows, so a bottom-to-top drag can sit
    // in the margin between children while `elementFromPoint` still reports
    // the parent. `readBlockIdAtPoint` maps that wrapping hit to the nearest
    // nested row. Promoting the parent here would select the whole subtree
    // even though the pointer never entered the parent's own row.
    const partialContentlessBlockId =
      current.exact && pointedBlockId !== headPosition?.blockId ? pointedBlockId : undefined;
    const effectiveHeadPosition = partialContentlessBlockId
      ? { blockId: partialContentlessBlockId, offset: 0 }
      : headPosition;
    // Structural selection follows the owning block under the pointer. A
    // contentless body can make caret lookup fall back to the anchor or a
    // neighboring editable block, which must not decide the range boundary.
    const crossBlock =
      (pointedBlockId ?? effectiveHeadPosition?.blockId) !== active.anchorPosition.blockId;
    const wholeBlocks = Boolean(crossBlock) && !current.exact;
    let handled = false;
    if (
      wholeBlocks &&
      pointedBlockId &&
      pointedBlockId !== headPosition?.blockId &&
      (pointedBlockId !== active.anchorPosition.blockId || !active.anchor)
    ) {
      this.ownsCrossBlockSelection = true;
      if (!active.anchor) {
        this.suppressClickBlockId = active.anchorPosition.blockId;
      }
      this.publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
      handled = true;
    } else if (head && effectiveHeadPosition) {
      const sameBlock = effectiveHeadPosition.blockId === active.anchorPosition.blockId;
      if (!(sameBlock && !this.ownsCrossBlockSelection)) {
        this.ownsCrossBlockSelection = true;
        this.publish(active, head, effectiveHeadPosition, wholeBlocks);
        handled = true;
      }
    } else if (
      pointedBlockId &&
      (pointedBlockId !== active.anchorPosition.blockId || !active.anchor)
    ) {
      // Contentless structural blocks have no caret geometry, so their stable
      // BlockView marker advances a whole-block range instead.
      this.ownsCrossBlockSelection = true;
      if (!active.anchor) {
        this.suppressClickBlockId = active.anchorPosition.blockId;
      }
      this.publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
      handled = true;
    }
    return handled;
  };

  /**
   * Stops the frame loop that advances a selection beside a viewport edge.
   *
   * @returns Pending animation work is cancelled and its handle is cleared.
   */
  private stopAutoScroll = (): void => {
    this.autoScroll?.stop();
    this.autoScroll = undefined;
  };

  /**
   * Scrolls the page and resolves the selection endpoint under the held pointer.
   *
   * Browsers do not reliably emit another pointermove while native drag
   * scrolling advances the document. Run the same frame loop with and without
   * virtualization so the portable editor selection cannot stop at its first
   * edge hit while the viewport continues moving.
   *
   * @param root - Active page surface containing the pointer selection.
   * @returns The gesture has one scroll session using the latest pointer coordinates.
   */
  private scheduleAutoScroll = (root: HTMLElement): void => {
    if (!this.autoScroll) {
      this.autoScroll = new BlockAutoScroll(root, this.updateAfterScroll);
    }
    if (this.latestPointer) {
      this.autoScroll.update(this.latestPointer);
    }
  };

  /**
   * Resolves the held selection endpoint after nested or page scrolling.
   *
   * @returns Current selection follows the moved content using the gesture's captured binding.
   */
  private updateAfterScroll = (): void => {
    if (this.pointer && this.latestPointer) {
      this.updatePointerSelection(this.pointer, {
        ...this.latestPointer,
        exact: this.exactBinding ? this.editor.keyboard.isHeld(this.exactBinding) : false,
      });
    }
  };

  /**
   * Ends pointer selection, stops auto-scroll, and preserves the final native or structural selection through delayed browser events.
   *
   * @returns False so pointer-up remains available to other handlers.
   */
  private stop = (): false => {
    this.stopAutoScroll();
    this.releasePointer?.();
    this.releasePointer = undefined;
    this.latestPointer = undefined;
    const completed = this.pointer;
    const root = completed?.root;
    this.pointer = null;
    if (
      !root ||
      !completed?.selection ||
      (!completed.wholeBlocks && !completed.head) ||
      (!completed.crossBlock && !this.ownsCrossBlockSelection)
    ) {
      return false;
    }

    if (completed.wholeBlocks) {
      root.ownerDocument.getSelection()?.removeAllRanges();
      // The gesture really ended as structural selection, so keyboard block
      // commands should now be routed through the surface root.
      root.focus({ preventScroll: true });
    } else {
      this.dom.setNativeSelection(completed.anchor!, completed.head!);
    }
    // Firefox and Chromium can emit one delayed selectionchange after
    // pointer-up. Keep the synthetic result authoritative through that task.
    this.timerView = root.ownerDocument.defaultView;
    this.releaseTimer = this.timerView?.setTimeout(() => {
      if (completed.wholeBlocks) {
        root.ownerDocument.getSelection()?.removeAllRanges();
      } else {
        this.dom.setNativeSelection(completed.anchor!, completed.head!);
      }
      this.suppressClickBlockId = undefined;
      this.ownsCrossBlockSelection = false;
    });
    return false;
  };

  /**
   * Starts or extends text and structural pointer selection while respecting interactive targets and modifier keys.
   *
   * @param input - Pointer-down event with the occurrence root, native input, and optional block ID.
   * @returns "handled" when shift-extension consumes input; otherwise "continue".
   */
  private onPointerDown = (input: BlockInputEvent<"pointerdown">): BlockInputResult => {
    const { raw, root } = input;
    if (this.editor.adapter.selection.canStartSelection?.(raw) === false) {
      return "continue";
    }
    if (raw.button !== 0 || (this.pointer && raw.pointerId !== this.pointerId)) {
      return "continue";
    }
    this.cancel();
    if (this.features.has("toggle") && this.bindingHeld(this.bindings.toggle)) {
      return "continue";
    }
    const start = this.readPointerStart(input);
    if (!start) {
      return "continue";
    }
    this.releasePointer = this.editor.pointer.acquire();
    if (!this.releasePointer) {
      return "continue";
    }
    this.pointerId = raw.pointerId;
    this.exactBinding = this.editor.keyboard.capture(this.bindings.exact);
    this.timerView = root.ownerDocument.defaultView;
    const extend = this.features.has("range") && this.bindingHeld(this.bindings.range);
    const handled = extend && this.extendRange(start);
    if (!handled) {
      this.pointer = start;
    }
    if (handled) {
      raw.preventDefault();
    }
    if (!this.features.has("pointer")) {
      this.stop();
    }
    return handled ? "handled" : "continue";
  };

  /**
   * Resolves an eligible text or structural gesture origin without consuming input.
   *
   * Keep the original event target, not only its owning anchor. Nested
   * controls and structural selection receive the same pointerdown;
   * checking only the ancestor would start both gestures at once.
   * Three entry paths, because click-to-activate and drag-to-select share
   * this pointerdown and must not steal each other:
   * - Editable anchors always enter so caret drags keep working.
   * - Controls explicitly marked as selection anchors seed a drag only.
   *   Nothing is published until the movement threshold, so a click still
   *   activates the control; a drag becomes structural selection and the
   *   later click is suppressed. Marking a containing region does not opt
   *   its controls in, and `data-prevent-text-editing` always opts them out.
   * - Remaining structural surface starts selection only when the target
   *   is not an excluded control (inputs, links, drop fields, sortable
   *   rows, `data-prevent-text-editing`). Those keep their own gesture.
   * The anchor marker is the only gesture-entry contract. Text mode puts
   * it directly on a contenteditable; structural mode puts it on a normal
   * renderer region. `data-block-content` remains an offset-mapping detail
   * owned by the DOM-selection utilities rather than pointer routing.
   * A second click can arrive before the browser dispatches the first
   * click's selectionchange. Read its live caret before extending it.
   * Shift extends the existing selection instead of replacing its anchor.
   * `readDOMSelectionPoint` intentionally falls back to the nearest
   * editable host. Explicit structural anchors bypass that fallback so
   * they retain their own block ID before movement begins.
   *
   * @param input - Primary pointer input inside this occurrence.
   * @returns Fixed gesture origin, or undefined for excluded controls or missing caret geometry.
   */
  private readPointerStart(input: BlockInputEvent<"pointerdown">): PointerSelection | undefined {
    const { raw, root, blockId } = input;
    const target = this.isElement(raw.target) ? raw.target : null;
    const region = target?.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR);
    if (!target || !region || !root.contains(region)) {
      return;
    }
    const optedControl =
      target.closest(STRUCTURAL_SELECTION_EXCLUDED_TARGET_SELECTOR) === region &&
      !target.closest(PREVENT_TEXT_EDITING_SELECTOR);
    if (!region.isContentEditable && !optedControl && this.isExcluded(target)) {
      return;
    }
    const anchor = region.isContentEditable
      ? this.dom.readDOMSelectionPoint(root, raw.clientX, raw.clientY)
      : undefined;
    let anchorPosition: EditorPosition | undefined;
    if (region.isContentEditable) {
      anchorPosition = anchor && this.dom.readDOMPointPosition(root, anchor);
    } else if (blockId) {
      anchorPosition = { blockId, offset: 0 };
    }
    if (!anchorPosition) {
      return;
    }
    return {
      root,
      startX: raw.clientX,
      startY: raw.clientY,
      anchor,
      anchorPosition,
      crossBlock: false,
      wholeBlocks: false,
    };
  }

  /**
   * Extends current directed coverage using the host's configured range binding.
   *
   * Live DOM selection is read before stored coverage because selectionchange can
   * arrive after a second click. The fixed endpoint stays with the existing gesture.
   *
   * @param clicked - Resolved pointer-down endpoint and occurrence.
   * @returns Whether an existing anchor could be extended.
   */
  private extendRange(clicked: PointerSelection): boolean {
    const selection = this.editor.adapter.selection;
    const native = this.dom.readEditorDOMSelection(clicked.root);
    if (native) {
      selection.set(native);
    }
    const current = native ?? selection.get();
    const ends = current
      ? BlockSelectionEndpoints.resolve(current, (id) => selection.getTextLength(id) ?? 0)
      : undefined;
    const originId = ends?.anchor.blockId ?? current?.anchorBlockId;
    if (!originId) {
      return false;
    }
    if (originId !== clicked.anchorPosition.blockId && !this.bindingHeld(this.bindings.exact)) {
      this.extendWholeBlocks(clicked.root, originId, clicked.anchorPosition.blockId);
      return true;
    }
    let position = ends?.anchor;
    if (!position) {
      const ids = selection.getSelectableBlockIds();
      position = {
        blockId: originId,
        offset:
          ids.indexOf(originId) > ids.indexOf(clicked.anchorPosition.blockId)
            ? (selection.getTextLength(originId) ?? 0)
            : 0,
      };
    }
    const anchor = this.dom.resolveDOMSelectionPoint(clicked.root, position);
    if (!anchor || !clicked.anchor) {
      return false;
    }
    this.ownsCrossBlockSelection = true;
    const active = { ...clicked, anchor, anchorPosition: position };
    this.pointer = active;
    this.publish(active, clicked.anchor, clicked.anchorPosition);
    return true;
  }

  /**
   * Publishes a structural extension and protects it from delayed native selectionchange.
   *
   * @param root - Current occurrence root.
   * @param originId - Existing fixed endpoint.
   * @param headId - Clicked moving endpoint.
   * @returns Host coverage is extended and focus is routed to the editor root.
   */
  private extendWholeBlocks(root: HTMLElement, originId: string, headId: string): void {
    this.ownsCrossBlockSelection = true;
    const next = this.dom.createVisibleStructuralSelection(
      this.selectionBlockIds(root),
      originId,
      headId,
    );
    if (next) {
      this.editor.adapter.selection.set(next);
    }
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    this.releaseTimer = this.timerView?.setTimeout(() => {
      this.ownsCrossBlockSelection = false;
      this.releaseTimer = undefined;
    });
  }

  /**
   * Updates an active selection after the movement threshold and schedules edge auto-scroll.
   *
   * @param input - Pointer-move event and the mounted surface root.
   * @returns "handled" when the active selection consumes movement; otherwise "continue".
   */
  private onPointerMove = ({
    raw: event,
    root,
  }: BlockInputEvent<"pointermove">): BlockInputResult => {
    const active = this.pointer;
    if (
      !active ||
      event.pointerId !== this.pointerId ||
      Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3
    ) {
      return "continue";
    }
    this.latestPointer = {
      x: event.clientX,
      y: event.clientY,
      exact: this.exactBinding ? this.editor.keyboard.isHeld(this.exactBinding) : false,
    };
    const handled = this.updatePointerSelection(active, this.latestPointer);
    this.scheduleAutoScroll(root);
    if (handled) {
      event.preventDefault();
    }
    return handled ? "handled" : "continue";
  };

  /**
   * Selects a structural anchor on a plain click and consumes clicks suppressed after a structural drag.
   *
   * @param input - Click event with the occurrence root, native input, and optional block ID.
   * @returns "handled" for a consumed structural click; otherwise "continue".
   */
  private onClick = ({ raw: event, blockId, root }: BlockInputEvent<"click">): BlockInputResult => {
    if (this.editor.adapter.selection.canStartSelection?.(event) === false) {
      return "continue";
    }
    if (!blockId) {
      return "continue";
    }
    if (blockId === this.suppressClickBlockId) {
      // A control may still receive `click` after its pointer gesture became a
      // structural drag. Claim that click so controls respecting
      // `defaultPrevented` do not perform their normal action.
      this.suppressClickBlockId = undefined;
      return "handled";
    }
    if (
      event.button !== 0 ||
      (this.features.has("toggle") && this.bindingHeld(this.bindings.toggle)) ||
      (this.features.has("range") && this.bindingHeld(this.bindings.range)) ||
      !this.isElement(event.target) ||
      this.isExcluded(event.target)
    ) {
      return "continue";
    }
    const anchor = event.target.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR);
    if (!anchor || anchor.isContentEditable || !root.contains(anchor)) {
      return "continue";
    }

    const selection = this.dom.createVisibleStructuralSelection(
      this.selectionBlockIds(root),
      blockId,
      blockId,
    );
    if (selection) {
      this.editor.adapter.selection.set(selection);
    }
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    event.preventDefault();
    return "handled";
  };

  /**
   * Cancels a gesture and delayed restoration without changing host coverage.
   *
   * @returns Timers, animation frames, and pointer references are released.
   */
  private cancel = (): void => {
    this.stopAutoScroll();
    this.releasePointer?.();
    this.releasePointer = undefined;
    if (this.releaseTimer !== undefined) {
      this.timerView?.clearTimeout(this.releaseTimer);
    }
    this.releaseTimer = undefined;
    this.timerView = null;
    this.exactBinding = undefined;
    this.pointer = null;
    this.pointerId = undefined;
    this.latestPointer = undefined;
    this.ownsCrossBlockSelection = false;
    this.suppressClickBlockId = undefined;
  };

  /**
   * Tests a semantic binding outside an active gesture.
   *
   * @param id - Host-configured action identity.
   * @returns Whether its current keys are held.
   */
  private bindingHeld(id: string): boolean {
    return this.editor.keyboard.isHeld(this.editor.keyboard.capture(id));
  }

  /**
   * Narrows a native target using its DOM node kind.
   *
   * @param target - Native event target.
   * @returns Whether the target is an element.
   */
  private isElement(target: EventTarget | null): target is Element {
    return !!target && "nodeType" in target && target.nodeType === 1;
  }

  /**
   * Protects controls from structural click and range behavior.
   *
   * @param target - Deepest native event element.
   * @returns Whether a control or editable ancestor owns normal interaction.
   */
  private isExcluded(target: Element): boolean {
    return !!target.closest(STRUCTURAL_SELECTION_EXCLUDED_TARGET_SELECTOR);
  }

  /**
   * Toggles whole-block membership in canonical visible order.
   *
   * Controls participate only when the control itself is a selection anchor;
   * marking an ancestor does not opt them in. Explicit prevention always wins.
   *
   * @param input - Native block pointer input.
   * @returns "handled" when a configured toggle gesture changes selection; otherwise "continue".
   */
  private onToggle = (input: BlockInputEvent<"pointerdown">): BlockInputResult => {
    if (this.editor.adapter.selection.canStartSelection?.(input.raw) === false) {
      return "continue";
    }
    const { raw, blockId, root } = input;
    if (
      raw.button !== 0 ||
      !blockId ||
      !(this.features.has("toggle") && this.bindingHeld(this.bindings.toggle)) ||
      !this.isElement(raw.target) ||
      raw.target.closest(PREVENT_TEXT_EDITING_SELECTOR)
    ) {
      return "continue";
    }
    const control = raw.target.closest(EDITOR_CONTROL_SELECTOR);
    if (control && !control.matches(BLOCK_SELECTION_ANCHOR_SELECTOR)) {
      return "continue";
    }
    this.cancel();
    const selection = this.editor.adapter.selection;
    const current = selection.get();
    const ids = new Set(
      current?.blocks
        .filter((block) => block.start === 0 && block.end === -1)
        .map((block) => block.id),
    );
    if (ids.has(blockId)) {
      ids.delete(blockId);
    } else {
      ids.add(blockId);
    }
    const ordered = selection.getSelectableBlockIds().filter((id) => ids.has(id));
    if (ordered.length) {
      selection.set(
        BlockSelectionRanges.createStructuralSelection(
          ordered,
          current?.anchorBlockId && ids.has(current.anchorBlockId)
            ? current.anchorBlockId
            : ordered[0],
          ids.has(blockId) ? blockId : ordered.at(-1),
        ),
      );
    } else {
      selection.clear();
    }
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    raw.preventDefault();
    return "handled";
  };
}

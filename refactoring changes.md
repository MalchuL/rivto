The target design should let interaction code work with **block IDs, text positions, geometry, and semantic operations**. DOM elements remain inside browser adapters and React rendering.

The existing core managers, selection model, and drop resolver remain the foundation. This proposal adds a surface boundary and extracts drag lifecycle ownership; it does not require changing persisted document data.

All interfaces below are proposed contracts, not implemented code.

**1. A surface adapter for browser operations**

A surface adapter represents one mounted interaction surface: a page, the edgeless canvas, or an editable card inside it.

```
interface SurfaceAdapter {
  /** Whether this mounted surface owns the block. */
  containsBlock(blockId: string): boolean;

  /** Expanded selection order, including virtualized blocks. */
  getSelectionBlocks(): readonly PageVirtualizationSelectionBlock[];

  /** Resolves a whole-block target from viewport coordinates. */
  readBlockIdAtPoint(point: PointerCoordinates): string | undefined;

  /** Resolves a text endpoint from viewport coordinates. */
  readPositionAtPoint(point: PointerCoordinates): EditorPosition | undefined;

  /** Reads the portable form of this surface's browser selection. */
  readDOMSelection(): Selection | undefined;

  /** Mounts endpoints if necessary and restores a directed text range. */
  restoreDOMSelection(
    selection: Selection,
    options?: RestoreDOMSelectionOptions,
  ): boolean;

  /** Focuses a block and places its caret without changing model selection. */
  focusBlock(
    position: EditorPosition,
    options?: RestoreDOMSelectionOptions,
  ): boolean;

  /** Focuses the surface while preserving viewport position. */
  focus(): boolean;

  /** Resolves rendered visual-line navigation, mounting neighbors if needed. */
  verticalCaretPosition(
    position: EditorPosition,
    direction: "up" | "down",
  ): EditorPosition | undefined;

  /** Supplies geometry consumed by the existing drop resolver. */
  collectDropLayout(): readonly DropLayoutBlock[];
}

```

Implementations:


| Implementation           | Responsibilities                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `PageSurfaceAdapter`     | Page block lookup, virtualized mounting, selection order, caret operations, and outline drop measurements. |
| `EdgelessSurfaceAdapter` | Canvas block lookup and measurement; routes text operations to the appropriate editable card.              |


Both reuse shared DOM selection functions. They should not duplicate `TreeWalker`, range restoration, or caret conversion algorithms.

The important distinction is between a missing block and an unmounted block. A virtualized adapter can mount an existing block before focusing it. A deleted block returns failure.

**2. Extend the existing surface manager**

The current `SurfaceManager` registers React components and wrappers. Extend it to associate mounted surfaces with adapters:

```
interface SurfacesCapability {
  // Existing component, wrapper, and slot registration stays.

  registerAdapter(
    root: HTMLElement,
    adapter: SurfaceAdapter,
  ): () => void;

  /** Resolves the mounted surface associated with a browser node. */
  resolveAdapter(node: Node): SurfaceAdapter | undefined;

  /** Resolves the surface owning a block in this React editor. */
  resolveBlockAdapter(blockId: string): SurfaceAdapter | undefined;
}

```

`SurfaceManager` implements these additions.

DOM registration happens at the React boundary, where the root ref already exists. The disposer removes that exact registration on unmount. Nested card roots resolve to their own adapter before the enclosing canvas.

This also removes the need for selection and navigation callers to retrieve `PageVirtualizationController` themselves. The page adapter delegates to that existing controller.

**3. Extend the existing selection manager**

`ReactSelectionManager` remains the public owner of selection coordination. Add semantic focus operations rather than introducing another selection manager:

```
interface SelectionCapability {
  // Existing selection state, DOM restoration, and scheduler stay.

  /** Publishes a caret, then restores focus after rendering. */
  focusCaret(
    position: EditorPosition,
    options?: RestoreDOMSelectionOptions,
  ): () => void;

  /** Restores focus for an already-published caret after rendering. */
  scheduleBlockFocus(
    position: EditorPosition,
    options?: RestoreDOMSelectionOptions,
  ): () => void;
}

```

`ReactSelectionManager` implements these methods by resolving the appropriate surface adapter and using its existing `scheduleIfSelectionUnchanged` scheduler.

The distinction between these methods matters:

- `focusCaret` changes model selection immediately.
- `scheduleBlockFocus` preserves model selection and schedules browser focus.
- Both return cancellation functions.
- New selection, surface replacement, document replacement, or destruction invalidates stale work.

Existing callers would change from:

```
focusCaret(reactEditor, root, blockId, offset);

```

to:

```
reactEditor.selection.focusCaret({ blockId, offset });

```

Consolidate the duplicated text-offset conversion in packages/react-rivto-editor/src/managers/events/block-dom.ts:170 and packages/react-rivto-editor/src/managers/selection/editor-dom-selection.ts:519 underneath these operations.

Native `Node` endpoints can still exist inside browser selection code. The portable boundary exposes `EditorPosition`.

**4. Normalize surface context in editor events**

`EventManager` already resolves block identity once per event. It should also resolve the surface adapter:

```
interface EditorEventInit {
  // Existing native event, editor, mode, selection, and block context stay.

  readonly surface: SurfaceAdapter;
}

```

`EditorEvent` carries that property. `EventManager` supplies it.

A navigation handler can then use:

```
const next = event.surface.verticalCaretPosition(position, "down");

if (next) {
  event.reactEditor.selection.focusCaret(next);
}

```

It no longer queries the DOM or mounts virtualized neighbors.

Keep the native event available: handlers still need modifiers, composition information, and browser default handling. Element fields may remain for browser-specific extensions, but semantic handlers should use normalized identities and surface operations.

Once migrated, remove `root` from `BlockViewContext` where its consumers only use it for focus or selection.

**5. Extract a drag controller**

PageDragProvider (packages/react-rivto-editor/src/extensions/block-drag/provider.tsx:108) should render the provider and preview and translate dnd-kit events. A concrete `PageDragController` should own the active gesture.

Its contract can be:

```
interface DragController {
  /** Captures eligible move roots and initial selection. */
  start(blockId: string): boolean;

  /** Resolves and publishes feedback for the current viewport point. */
  update(
    point: PointerCoordinates,
    target: CrossDocumentPageRootController | null,
    options: DropLayoutOptions,
  ): void;

  /** Revalidates the destination, commits the move, and ends the gesture. */
  commit(): boolean;

  /** Ends the gesture without a document mutation. */
  cancel(): void;

  /** Cancels active work and releases owned resources. */
  destroy(): void;
}

```

`PageDragController` implements this contract. It remains internal to the drag extension; no global drag manager is needed.

The controller owns:

- Captured move roots and original selection.
- Current local or foreign destination.
- Placement-store updates.
- Commit validation and selection reconciliation.
- Idempotent gesture teardown.

The dnd-kit integration owns sensors, keyboard stand-in rectangles, and translating library events into controller calls. Preview rendering stays in React. Existing pointer tracking remains browser-specific.

**6. Remove the root element from cross-document drag operations**

Adapt the existing cross-document contract:

```
interface CrossDocumentPageRootController {
  readonly reactEditor: ReactEditor;
  readonly surface: SurfaceAdapter;

  resolvePlacement(
    point: PointerCoordinates,
    sources: readonly EditorBlock[],
    options: DropLayoutOptions,
  ): {
    readonly destination: BlockDropDestination;
    readonly indicator: DropPlacement | null;
  } | null;

  setPlacement(
    placement: DropPlacement | null,
    empty?: boolean,
  ): void;
}

```

The browser lookup still discovers destination roots through DOM hit testing. After lookup, the drag controller uses this contract.

An empty-document destination needs an explicit semantic destination even when no block exists to anchor an indicator.

Commit continues through existing block managers and cross-document transfer helpers. Revalidate destination structure and acceptance at drop time because document contents can change during a gesture.

**What remains unchanged**

The existing `resolveDropPlacement`, destination types, selection types, snapping calculations, and core mutation managers remain reusable. Coordinate conversion should first reuse `canvasPoint`; it does not need its own manager.

DOM measurements must stay current during scrolling, resizing, and zooming. Adapter extraction alone does not justify persistent geometry caches.

**Implementation order and acceptance criteria**

1. Consolidate endpoint conversion; add semantic focus methods to `ReactSelectionManager`.
2. Introduce surface adapters and registration; migrate selection and navigation.
3. Add surface context to events; remove redundant DOM resolution.
4. Extract `PageDragController`; migrate cross-document targeting.

Completion means semantic interaction paths no longer require root elements, while browser-specific rendering and input integration still can. Verification must cover directed selection, virtualized navigation, nested cards, drag cancellation, keyboard dragging, cross-document movement, iframe ownership, and cleanup during unmount or document replacement. Run the repository’s required performance verification after implementation.
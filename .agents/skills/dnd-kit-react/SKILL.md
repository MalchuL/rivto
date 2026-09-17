---
name: dnd-kit-react
description: Build drag and drop in any React codebase with the new-generation dnd-kit packages (@dnd-kit/react, @dnd-kit/dom, @dnd-kit/collision, @dnd-kit/helpers, 0.5.x). Covers sortable reordering, free-form drop targets, multi-container boards, custom placement resolution, handles, keyboard and screen-reader support, auto-scroll inside nested scroll containers, and staying fast with hundreds or thousands of draggable items. Use for new dnd-kit work or when migrating from @dnd-kit/core and @dnd-kit/sortable; do not use for the legacy v6 API.
---

# dnd-kit for React (new generation)

Use `@dnd-kit/react` on top of `@dnd-kit/dom`. The new generation is a
different library from `@dnd-kit/core` + `@dnd-kit/sortable`: a framework
neutral `DragDropManager` owns sensors, plugins, collision detection, and the
drag operation; React hooks only register entities and subscribe to state.
Design integrations so that heavy work happens in the manager layer (plugins,
collision detectors, event handlers) and React re-renders stay narrow.

## Install the right packages

```bash
pnpm add @dnd-kit/react @dnd-kit/dom @dnd-kit/collision @dnd-kit/helpers
```

- Pin all four to the same minor version; they share `@dnd-kit/abstract`,
  `@dnd-kit/geometry`, and `@dnd-kit/state` transitively.
- Never import `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, or
  `@dnd-kit/utilities` in the same tree. The generations are incompatible.
- Import from the public subpaths only:
  - `@dnd-kit/react`: `DragDropProvider`, `DragOverlay`, `useDraggable`,
    `useDroppable`, `useDragDropManager`, `useDragDropMonitor`,
    `useDragOperation`, event types.
  - `@dnd-kit/react/sortable`: `useSortable`, `isSortable`,
    `isSortableOperation`.
  - `@dnd-kit/dom`: `PointerSensor`, `KeyboardSensor`,
    `PointerActivationConstraints`, `AutoScroller`, `Scroller`, `Feedback`,
    `Accessibility`, `Cursor`, `PreventSelection`, `StyleInjector`,
    `defaultPreset`.
  - `@dnd-kit/dom/modifiers`: `RestrictToElement`, `RestrictToWindow`.
  - `@dnd-kit/collision`: `closestCenter`, `closestCorners`,
    `pointerIntersection`, `shapeIntersection`, `pointerDistance`,
    `directionBiased`, `defaultCollisionDetection`.
  - `@dnd-kit/helpers`: `arrayMove`, `arraySwap`, `move`, `swap`.
  - `@dnd-kit/abstract` (add as a direct dependency only if you need it):
    `CollisionPriority`, `configure` for plugins without a static `configure`,
    `Plugin`/`Modifier` base classes for custom plugins.

## Mental model

| Concept | Where it lives | Notes |
| --- | --- | --- |
| `DragDropManager` | one per `DragDropProvider` | Holds `registry`, `dragOperation`, `collisionObserver`, `monitor`, `actions`. |
| Sensors | provider `sensors` prop | `PointerSensor`, `KeyboardSensor`. Passing an array replaces the defaults, so list every sensor you need. |
| Plugins | provider `plugins` prop | Default preset: `Accessibility`, `AutoScroller`, `Cursor`, `Feedback`, `PreventSelection`. Pass `(defaults) => [...defaults, X]` to extend, or an array to replace. |
| Modifiers | provider or per-draggable `modifiers` | Transform the pointer delta, e.g. `RestrictToElement`. |
| Entities | `useDraggable`, `useDroppable`, `useSortable` | `id` must be unique per manager. `data` is arbitrary and available on `source.data` / `target.data`. |
| Drag operation | `event.operation` | `source`, `target`, `position` (`current`, `initial`, `delta`, `direction`), `transform`, `shape`, `status`, `canceled`. |
| Events | `onBeforeDragStart`, `onDragStart`, `onDragMove`, `onDragOver`, `onCollision`, `onDragEnd` | There is no `onDragCancel`; check `event.canceled` in `onDragEnd`. |

Do not mutate application state from `onDragMove`. Commit in `onDragEnd`
(or `onDragOver` for optimistic sorting) and show intent with feedback.

## Provider setup

Create a stable sensor array with `useMemo`; the provider re-creates sensors
when the array identity changes. Instantiate activation constraints inside the
`activationConstraints` callback because each constraint instance owns one
pending gesture.

```tsx
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { useMemo } from "react";

const ACTIVATION_DISTANCE_PX = 4;

export function BoardDnd({ children, onDrop }: { children: React.ReactNode; onDrop: (event: DragEndEvent) => void }) {
  const sensors = useMemo(() => [
    PointerSensor.configure({
      activationConstraints: () => [new PointerActivationConstraints.Distance({ value: ACTIVATION_DISTANCE_PX })],
    }),
    KeyboardSensor.configure({ offset: 16 }),
  ], []);

  return (
    <DragDropProvider
      sensors={sensors}
      onDragEnd={(event) => {
        if (event.canceled) return;
        onDrop(event);
      }}
    >
      {children}
    </DragDropProvider>
  );
}
```

Rules:

- A distance constraint of a few pixels keeps clicks, text selection, and
  buttons inside draggable rows working. Use `PointerActivationConstraints.Delay`
  with a small `tolerance` for touch surfaces where scroll and drag compete.
- Use `preventActivation(event, source)` on `PointerSensor` to bail out when
  the pointer started on an interactive element (`input`, `button`, contenteditable).
- Keep one provider per independent drag domain. Nested providers do not share
  a manager; a draggable can only drop on droppables registered with the same manager.
- Pass a `manager` prop only when you need to construct `DragDropManager`
  yourself (tests, non-React hosts, cross-window setups).

## Sortable lists

`useSortable` registers one draggable and one droppable per item and, with the
default `OptimisticSortingPlugin`, animates items into their new positions
while the gesture is in flight. Supply `index` and, for multi-list boards,
`group`.

```tsx
import { useSortable } from "@dnd-kit/react/sortable";

function Row({ id, index, group }: { id: string; index: number; group: string }) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, group, type: "row", accept: "row" });
  return (
    <li ref={ref} data-dragging={isDragging || undefined}>
      <button ref={handleRef} aria-label="Reorder">⋮⋮</button>
      {id}
    </li>
  );
}
```

Commit order in `onDragEnd` with the helpers, which understand `source` and
`target` indexes and groups:

```tsx
import { move } from "@dnd-kit/helpers";

// items: Record<columnId, Array<{ id: string }>>
onDragEnd={(event) => {
  if (event.canceled) return;
  setItems((current) => move(current, event));
}}
```

- Single list: `arrayMove(items, source.sortable.initialIndex, target.sortable.index)`
  or `move(items, event)` with a flat array.
- Multi-list (kanban): keep `Record<groupId, items>` and call `move(items, event)`
  in `onDragOver` for live column changes and again in `onDragEnd` to finalize.
  Give each column a droppable whose `id` equals the group id and `accept` the
  row type so empty columns remain targets.
- Use `isSortable(event.operation.source)` before reading `sortable.index`.
- Keep `index` in sync with rendering order. Stale indexes produce wrong
  optimistic transforms and wrong helper results.
- Disable movement per direction with `disabled: { draggable: true }` or
  `{ droppable: true }` rather than unmounting the hook.
- Pass `transition: null` to opt out of optimistic animation for very dense
  lists or when a virtualizer already animates layout.

## Free-form drop targets

Use `useDraggable` and `useDroppable` when the target is not "swap positions"
but "drop into zone X".

```tsx
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { pointerIntersection } from "@dnd-kit/collision";
import { CollisionPriority } from "@dnd-kit/abstract";

function Card({ id }: { id: string }) {
  const { ref, isDragging } = useDraggable({ id, type: "card", data: { id } });
  return <article ref={ref} data-dragging={isDragging || undefined}>…</article>;
}

function Bin({ id, nested }: { id: string; nested?: boolean }) {
  const { ref, isDropTarget } = useDroppable({
    id,
    type: "bin",
    accept: ["card"],
    collisionDetector: pointerIntersection,
    collisionPriority: nested ? CollisionPriority.High : CollisionPriority.Normal,
  });
  return <section ref={ref} data-over={isDropTarget || undefined}>…</section>;
}
```

- `accept` takes a type, an array of types, or `(source) => boolean`. Filter by
  data (owner, permissions) inside the predicate instead of disabling
  droppables in render.
- `collisionDetector` is per target, so a nested zone can use
  `pointerIntersection` while its parent uses `closestCenter`.
- `collisionPriority` breaks ties: higher wins. Give inner targets higher
  priority so a card dropped on a nested list does not resolve to the list's
  container. Plain numbers work if you do not want to depend on
  `@dnd-kit/abstract` for the `CollisionPriority` enum.
- Read the winning target in `onDragEnd` via `event.operation.target`; for the
  full ranked list subscribe to `onCollision` (`event.collisions`), which can
  also `preventDefault()` to veto a collision set.

## Custom placement resolution (before/after/inside)

When the visual target is a line between items rather than an item (outliners,
block editors, trees), do not model each gap as its own droppable. Register
one droppable per block, then compute placement from the pointer inside a
library-neutral resolver:

1. In `onDragMove`, read `event.operation.position.current` and the target's
   `element.getBoundingClientRect()` (or `dragOperation.shape` when dragging by keyboard).
2. Resolve `{ targetId, placement: "before" | "after" | "inside" }` from the
   pointer offset within the rect. Treat padding and gaps between siblings as
   before/after edges; only the content body counts as "inside".
3. Store the result in a ref or an external store and render one indicator
   element. Do not `setState` on every move at the provider level.
4. In `onDragEnd`, read the stored placement and commit.

Keep the resolver a pure function of `{ pointer, sourceRect, targetRect, targetData }`
so unit tests do not need dnd-kit or a DOM.

## Drag handles and activator elements

- `handleRef` (from `useDraggable` / `useSortable`) limits pointer and keyboard
  activation to the handle while the whole element still moves.
- Keep the handle a real `<button>` so it is focusable; the `KeyboardSensor`
  starts on `Space`/`Enter` from the focused activator.
- `PointerSensor.configure({ activatorElements: (source) => [...] })` allows
  several activators for one draggable.

## Feedback and overlays

The `Feedback` plugin decides what moves under the pointer. Modes: `default`
(source element promoted and translated, placeholder keeps layout), `move`,
`clone`, `none`. Configure globally with `Feedback.configure({ feedback })`
in `plugins` or per entity with `plugins: (defaults) => [...defaults, Feedback.configure({ feedback: "clone" })]`.

Use `DragOverlay` when the dragged visual differs from the source (a compact
preview, a stack of selected items, a cross-container ghost):

```tsx
<DragOverlay dropAnimation={null}>
  {(source) => <CardPreview id={String(source.id)} />}
</DragOverlay>
```

- With `DragOverlay`, leave feedback on `default`; the overlay is used as the
  feedback element and the source keeps its placeholder box.
- Set `dropAnimation={null}` when your app applies its own settle animation or
  when the source will unmount on drop.
- The feedback element is placed in a top-layer popover, so it renders above
  `<dialog>`s and stacking contexts without z-index games. If your host uses a
  Shadow DOM or a `<dialog>`, pass `Feedback.configure({ rootElement })` so
  hit-testing and styles stay inside that root.

## Keyboard and accessibility

- Keep `KeyboardSensor` in your `sensors` array. Arrow keys move by `offset`
  (default 10px); use a larger offset for block lists so one press crosses a row.
- With `useSortable`, the `SortableKeyboardPlugin` moves the item between
  indexes instead of by pixel offset.
- For custom placement (section above), decide placement from
  `dragOperation.shape.current` when the operation has no pointer
  (`activatorEvent instanceof KeyboardEvent`).
- Keep the `Accessibility` plugin. It has no static `configure`, so customize
  announcements with `configure(Accessibility, { announcements, screenReaderInstructions })`
  from `@dnd-kit/abstract` and place that descriptor in `plugins`. Provide
  `aria-roledescription` on handles and `aria-label`s that include the item's
  name so announcements are meaningful.
- Add `Escape` cancellation to any custom UI; `event.canceled` is `true` in
  `onDragEnd` and the same cleanup path must run.

## Scrolling and auto-scroll

The `Scroller` core plugin tracks scrollable ancestors of the element under
the pointer; the `AutoScroller` plugin scrolls them when the pointer enters an
edge zone.

```tsx
import { AutoScroller, defaultPreset } from "@dnd-kit/dom";

const plugins = defaultPreset.plugins.map((plugin) =>
  plugin === AutoScroller ? AutoScroller.configure({ threshold: { x: 0, y: 0.15 }, acceleration: 30 }) : plugin,
);
```

Rules for scroll-heavy layouts:

- Make the scroll container an ordinary overflow element (`overflow: auto`,
  bounded height). Auto-scroll cannot drive a container whose overflow is
  `hidden` or whose size is unbounded.
- Nested scrollers (window > page > column) are all candidates. If some must
  never auto-scroll (sidebars, sticky headers, code blocks), filter them:

```tsx
import { useDragDropManager } from "@dnd-kit/react";
import { Scroller } from "@dnd-kit/dom";
import { useLayoutEffect } from "react";

export function AutoScrollPolicy({ allow }: { allow: (el: Element) => boolean }) {
  const manager = useDragDropManager();
  useLayoutEffect(() => {
    const scroller = manager?.registry.plugins.get(Scroller);
    if (!scroller) return;
    const unfiltered = scroller.getScrollableElements;
    // Return a fresh Set so the scroller's own change detection keeps working.
    scroller.getScrollableElements = () => {
      const elements = unfiltered();
      return elements ? new Set([...elements].filter(allow)) : elements;
    };
    return () => {
      scroller.getScrollableElements = unfiltered;
    };
  }, [manager, allow]);
  return null;
}
```

  Render this component inside the provider.
- Droppable shapes are refreshed on scroll by the `ScrollListener` core
  plugin; you do not need to recompute rects yourself, but your custom
  placement resolver must read rects on each move rather than caching them for
  the whole gesture.
- Do not call `scrollIntoView` or change `scrollTop` from `onDragOver`; the
  scroller and your handler will fight. Use `manager.registry.plugins.get(Scroller)?.scroll({ by })`
  if you need a programmatic nudge.
- Sticky headers overlap real targets. Exclude them from hit-testing with
  `pointer-events: none` during a drag (toggle a body attribute in
  `onDragStart`/`onDragEnd`) or use a collision detector that ignores them.
- Horizontal boards: set `threshold: { x: 0.2, y: 0 }` on the board's provider
  and rely on each column's own vertical scrolling being detected as a nested scroller.

## Many objects: staying fast

Registration cost is per hook instance, and the collision observer visits every
registered droppable on each move. Budget for both.

- **Virtualize long lists.** Only mounted rows register entities. Use a
  windowing library and keep `index` equal to the item's real position in the
  full list, not its position among mounted rows. `OptimisticSortingPlugin`
  only transforms mounted siblings, which is acceptable inside a window.
- **Register lazily.** For grids of thousands of cells, register droppables
  only for the containers (columns, groups) and resolve the exact slot from the
  pointer in a resolver. Register draggables on hover/focus of the handle when
  even mounting the hooks is too expensive.
- **Never fan state out on move.** `onDragMove` fires every frame. Write to a
  ref or a tiny external store (`useSyncExternalStore`) that only the
  indicator subscribes to. Provider-level `useState` on move re-renders every
  child.
- **Subscribe narrowly.** `useSortable`/`useDraggable` return reactive
  booleans (`isDragging`, `isDropTarget`) that only re-render that item. For
  cross-cutting UI use `useDragOperation()` (source/target) or
  `useDragDropMonitor({ onDragStart, onDragEnd })` in the component that needs
  it, not in a parent that owns the list.
- **Keep `data` small and stable.** `data` is stored by reference; pass ids and
  look up the model in the handler instead of passing whole objects that change
  identity each render.
- **Prefer a single `DragOverlay`.** Rendering a preview of one item is cheaper
  than the `default` feedback on a source with heavy children; disable
  `dropAnimation` when the source will re-layout anyway.
- **Freeze structure for the gesture.** Snapshot the ordered list of candidate
  targets at `onDragStart` (ids + owner) and reuse it in the resolver; only rects
  need to be live. Rebuild if a remote update arrives.
- **Avoid layout thrash.** Read all rects for a move first, then write DOM
  (indicator position, attributes). Do not toggle classes that change layout
  on siblings during a drag; use transforms and outlines.
- **Check stylesheet churn.** The `Feedback` plugin injects a stylesheet into
  the active document via the `StyleInjector` at drag start. On huge documents
  this can trigger a full style recalc; if profiling shows it, keep the overlay
  host out of flow and ship the equivalent rules statically instead of relying
  on injection.
- **Measure.** Trace a drag in DevTools Performance with 500+ items before
  shipping. Targets: first move under 16ms, no long tasks over 50ms, no
  per-move React commit outside the indicator.

## Multi-select and cross-container moves

- Drag one source but carry a set: store selected ids in a ref at
  `onDragStart` (`source.data.id` plus current selection) and apply the drop to
  the whole set in `onDragEnd`. Mark the other selected items
  `data-dragging` manually so they show as part of the gesture.
- Moving between two independent React trees (two editors, two panes) requires
  one shared provider above both, or a shared `manager` instance passed to
  both providers. Droppables registered under different managers are invisible
  to each other.
- Iframes and cross-frame drops are supported by the feedback plugin, but
  collision uses frame-transformed rects; test with real frames rather than
  mocks.

## Testing

Unit test the resolver and the commit function without dnd-kit: they are pure
functions of rects, pointer, and model state.

For hook-level Jest tests, construct the manager yourself, pass it through the
`manager` prop, and drive `manager.actions` instead of synthesizing pointer
events (jsdom has no layout, so stub `getBoundingClientRect` on the elements
you care about):

```tsx
import { DragDropManager } from "@dnd-kit/dom";

const manager = new DragDropManager();
render(<DragDropProvider manager={manager} onDragEnd={onDragEnd}><List /></DragDropProvider>);

manager.actions.start({ source: "row:1", coordinates: { x: 10, y: 10 } });
manager.actions.move({ to: { x: 10, y: 50 } });
await manager.actions.setDropTarget("row:3");
manager.actions.stop();
// stop({ canceled: true }) exercises the Escape path
```

For browser behavior use Playwright with a real pointer sequence that
satisfies the activation constraint: `mouse.move` to the handle, `mouse.down`,
at least two moves exceeding the distance, then assert the indicator/target,
then `mouse.up`. Cover keyboard: focus the handle, `Space`, `ArrowDown`,
`Space`. Add an `Escape` case and assert the model did not change. For scroll,
drag into the edge zone and assert `scrollTop` increases before dropping.

## Pitfalls

- Passing `sensors` as a new array each render re-binds every draggable.
- Forgetting `KeyboardSensor` when replacing the default sensors removes
  keyboard access silently.
- Using `onDragOver` to commit permanent state without also handling
  `event.canceled` in `onDragEnd` leaves optimistic changes applied after `Escape`.
- Registering a droppable and a draggable with the same `id` outside
  `useSortable` collides in the registry; namespace ids (`row:1`, `zone:1`).
- Rendering `DragOverlay` outside the provider: it must be a descendant.
- `element` and `handle` accept refs or elements; when you pass your own ref,
  keep it attached for the lifetime of the hook or the entity loses its shape.
- Relying on `transform` styles from the legacy `CSS.Transform.toString`
  helper: the new generation applies transforms itself through the
  `Feedback` and sorting plugins.

## Legacy to new-generation map

| `@dnd-kit/core` / `sortable` (v6) | New generation (0.5.x) |
| --- | --- |
| `DndContext` | `DragDropProvider` |
| `useSensors(useSensor(PointerSensor, {...}))` | `sensors={[PointerSensor.configure({...}), KeyboardSensor]}` |
| `activationConstraint: { distance }` | `activationConstraints: () => [new PointerActivationConstraints.Distance({ value })]` |
| `SortableContext` + `useSortable` + `CSS.Transform` | `useSortable({ id, index, group })`, transforms applied by plugin |
| `arrayMove(items, oldIndex, newIndex)` | `move(items, event)` or `arrayMove` |
| `onDragCancel` | `onDragEnd` with `event.canceled === true` |
| `event.active`, `event.over` | `event.operation.source`, `event.operation.target` |
| `collisionDetection` prop on context | `collisionDetector` per droppable, `collisionPriority` for ties |
| `modifiers={[restrictToParentElement]}` | `modifiers={[RestrictToElement.configure({ element })]}` |
| `autoScroll={{ threshold }}` | `AutoScroller.configure({ threshold, acceleration })` in `plugins` |
| `DragOverlay` from `@dnd-kit/core` | `DragOverlay` from `@dnd-kit/react`, feedback controlled by `Feedback` plugin |
| `useDndMonitor` | `useDragDropMonitor` |
| `setNodeRef`, `setActivatorNodeRef` | `ref`, `handleRef` |

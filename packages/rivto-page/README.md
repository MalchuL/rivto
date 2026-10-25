# Rivto Page

A standalone structural BlockEditor with a bounded adapter. Concrete renderers and
data belong to the host. ReactEditor/EditorPanel uses the shared block surface
for writing pages and edgeless card content; document policy remains in the host.

## Usage

```tsx
import {
  BlockEditor,
  BlockEditorThemeProvider,
  BlockEditorController,
  BlockListSlot,
  BlockCollapseSlot,
} from "@chulane/rivto-page";
import "@chulane/rivto-page/styles.css";

// Run when the host starts an editing session, outside React rendering.
// The adapter exposes only blocks and selection; MarkdownBlock belongs to the host.
const editor = new BlockEditorController({ adapter });
const removePresentation = editor.extensions.register("block-presentation", {
  /**
   * Installs host content and package structural controls for this editor.
   *
   * @param editor - Instance owning all registrations made during this setup.
   * @returns Registrations remain active until the extension is removed.
   */
  setup(editor) {
    editor.renderers.register("markdown", { content: MarkdownBlock });
    editor.slots.register({ position: "start", component: BlockListSlot, priority: 300 });
    editor.slots.register({ position: "start", component: BlockCollapseSlot, priority: 200 });
  },
});

<BlockEditorThemeProvider
  theme={{ "--rivto-block-padding": "8px", "--rivto-block-indent": "24px" }}
>
  <BlockEditor editor={editor} />
</BlockEditorThemeProvider>;

// To disable the feature while the editor remains alive:
removePresentation();
// When the host ends the session, after unmounting the view:
editor.destroy();
```

The host creates the data-only `adapter`: see the [working adapter](demo/demo-adapter.ts)
and [session owner](demo/demo-session.ts). React ownership is demonstrated by
[DemoRoot](demo/main.tsx), which creates its session after commit and destroys it
on cleanup. Do not create an editor or install features in React render, useMemo,
or a useState initializer. Adapter snapshots retain their reference until changed;
mutations publish a new snapshot before notifying subscribers.

The host owns `BlockEditorController`; `<BlockEditor editor={editor}>` only borrows
it. View unmount/replacement and StrictMode replay detach native listeners and
release React subscriptions, preserving registrations and ID-bound nodes. Different
simultaneously mounted views need separate editor objects; they may share an adapter.
Final `destroy()` releases extensions, all remaining manager registrations, events,
and cached nodes, without destroying the host adapter or document.

Components using `useBlockEditorController()` and extension `setup` callbacks borrow
`BlockEditorApi`. It is the same controller object, typed without editor attachment,
editor destruction, or manager lifecycle methods. The controller keeps one concrete
field per manager; there are no duplicate API/implementation references or wrappers.
The host retains the concrete controller to attach its view and end its session.
This is a TypeScript boundary, not a runtime access restriction.
`getNode`, `useBlockNode`, slot props, and internal presentation contexts borrow
`BlockEditorNodeApi`, which excludes node destruction. The controller alone keeps
concrete cached nodes for teardown; snapshots, commands, and object identities are
unchanged.

`editor.slots.register()` and `editor.renderers.register(type, { content?, layout? })` accept plain contributions
and return independent, idempotent disposers. Renderers remain implemented by the
host and can be added/removed dynamically. Duplicate nonempty renderer types are
rejected. Set `fallbackRenderer` in the editor options to display a stable component
for unregistered types; omission leaves their content empty while retaining shells
and children. Slots retain their own IDs and priority order across neighboring changes.

`editor.extensions.register(id, extension)` installs a synchronous feature under a
unique nonempty registration ID. The extension contains `setup` and can be reused
under different IDs; each installation has independent resources and cleanup.
Keep installation-local mutable state inside `setup`; reusing the object does not
clone its fields or remove uniqueness constraints in other registries.
Slot/renderer registrations, their subscriptions, editor event observers,
and nested extensions installed during setup are captured. Node/data subscriptions
remain explicit: return their disposer from setup or pass it to registerCleanup. A setup failure releases captured resources and reports
setup/cleanup errors together. Setup may return synchronous cleanup; removal runs
it first, then captured resources in reverse order. Every cleanup is attempted even
when another fails. Destruction during setup and asynchronous setup results are
rejected. Register external disposers with `editor.extensions.registerCleanup()` or
return them from setup. Resources created later in asynchronous/event callbacks have
editor ownership; their extension must retain their disposers in its returned cleanup
if they must be released when that extension is removed.

Use addressed node subscriptions for data changes, registry subscriptions for
contribution changes, and `editor.events.on("focus" | "blur", listener)` for focus
crossing the whole editor's DOM boundary. Internal focus moves emit neither event.
Event subscriptions survive view detachment; native listeners do not. These are
synchronous observations, not keyboard dispatch or a global render invalidation.
Keyboard and command behavior will be added with the first migrated interaction.

Server rendering reads synchronous host snapshots and renders the same configured
components without attaching DOM or subscribing. The host must provide matching
server/client data and registrations for hydration; production SSR integration has
not been migrated.

`adapter.blocks.getBlockIds()` returns the ordered display list, and
`subscribeBlockIds(listener)` observes changes to that list and to accessible
canonical `getRootIds()` snapshots, including changes hidden by a projected list. The host may select
blocks from different parents; no common owner or synthetic hierarchy is required.
Each listed node still renders its real `childIds`. An empty array displays no blocks.
Keep the array reference stable until IDs or order change, then publish a new
immutable array before notifying listeners. Individual node edits use separate
`subscribeBlockNode` subscriptions and do not notify display-list subscribers.

The theme provider is optional. Importing the package CSS is sufficient; demo styles
are not required. All spacing and dimensions affecting structural layout belong to
the package and can be customized through public parameters. The provider applies
the typed `BlockEditorTheme` through CSS inheritance; a host theme container also
works. Supply CSS lengths as strings with units or `calc`/`clamp` expressions valid
for the corresponding property. The provider does not bridge variables into detached portals.

## Tailwind CSS and shadcn/ui

Structural classes use Tailwind CSS v4 through `@apply`, preserving the public names
in `BLOCK_EDITOR_CLASSES` and the dimension parameters. Checkbox and collapse controls
use shadcn Checkbox and Button; example demo forms also use NativeSelect, Textarea,
and Badge. CSS counters and the border shorthand remain in the stylesheet as list
numbering behavior and the theme parameter protocol. The host supplies the actual color palette.

The package build compiles the finished `dist/esm/styles.css` through the Tailwind CLI.
Consumers do not need to scan package sources or install Tailwind. Utilities use the
`page:` prefix, and Tailwind variables use `--page-*`. The reset is scoped to
`[data-rivto-page-ui]`; global Preflight is disabled. Shadcn theme tokens read public
Page parameters, including foreground/background and selection for primary/ring.
Add new primitives through the official CLI from the package directory:

```sh
pnpm dlx shadcn@latest add <component> --yes
```

`components.json` targets the presentation layer. After generation, retain the `page:`
prefix, named props, JSDoc, and the `data-rivto-page-ui` marker for the scoped reset.
Internal primitives are not an additional public UI kit API of this package.

Source CSS rules live beside their owners: `block-editor.css` in `components/block-editor`,
`block-layout.css` in `components/block-layout`, `block-view.css` in `components/block-view`, `ui.css`
in `components/ui`, and `block-slots.css` and `block-controls.css` in `slots`.
Shared theme tokens live in `presentation/theme.css`. `presentation/styles.css`
contains Tailwind configuration and imports in cascade order; consumers still import
one compiled stylesheet.

## Geometry parameters

| CSS parameter                  | Default                     | Purpose                                              |
| ------------------------------ | --------------------------- | ---------------------------------------------------- |
| `--rivto-block-padding`        | `16px`                      | Shared row padding for content and controls          |
| `--rivto-block-gap`            | `4px`                       | Shared gap between roots, above and between children |
| `--rivto-block-indent`         | `28px`                      | Logical indentation of the child group               |
| `--rivto-slot-gap`             | `4px`                       | Gap between controls and row slots/content           |
| `--rivto-default-block-height` | `24px`                      | Minimum first-line height for rows/flow slots        |
| `--rivto-block-control-size`   | `20px`                      | Checkbox/collapse control size                       |
| `--rivto-block-marker-width`   | `24px`                      | Numeric marker width                                 |
| `--rivto-block-start-width`    | control + marker + slot gap | Minimum start gutter, including an empty slot        |
| `--rivto-block-radius`         | `10px`                      | Block background corner radius                       |
| `--rivto-block-border`         | `none`                      | Optional block border                                |

The start gutter preserves content alignment when built-in controls appear or
disappear. Wider custom contributions can expand it; its minimum width is configurable.
Renderers do not need compensating padding or translations relative to slots.

`--rivto-background`, `--rivto-block-foreground`, and `--rivto-block-selection` define
the base background, text, and selection. Each node's `color` is a ready-to-use CSS
color or expression, such as `#3366ff`, `rgb(10, 20, 30)`, or a host-defined `var(...)`.
The host resolves persisted palette names before supplying a snapshot and handles
any reverse mapping when applying color commands. Page has no palette registry,
reserved color names, token syntax rules, or per-color theme properties. Omit the
color to use the base background. The demo's named choices are resolved in its own
controls before calling node.setColor; those names are not part of the Page API.

`--rivto-block-background` is the common block background override and takes priority
over node.color. Like other theme parameters, it inherits through the subtree. It can
also be supplied through style on an individual BlockView. Each node uses its own
resolved color: a parent's selected color does not color its children. BlockView applies
the selected color as the non-inherited backgroundColor property; it does not create
a separate inherited CSS variable for that node color. Parameters also inherit between
nested providers; one provider can serve multiple editors.

## Slots and current limitations

The registry supports start/end/body and the 12 perimeter anchors in `SLOT_POSITIONS`.
Priority and when determine order and visibility. The host chooses registrations
for its surface; Page does not receive or interpret an editor/surface mode. `when` must depend on the
supplied context; changing an arbitrary external variable does not notify the registry.
Each installation has its own ID and disposer, even when a component is registered
more than once. `BLOCK_EDITOR_CLASSES` exports six structural names for
block/row/content/children/slot/marker.

Checkbox and collapse controls use `BlockEditorNode`. Collapsing unmounts descendant
renderers/subscriptions while retaining data and cached nodes. The body slot remains
outside the child container. Numbering uses CSS counters for fully mounted sibling
groups. Virtualization, host childrenVisible policies for concrete containers,
navigation, drag and drop, clipboard, Enter behaviors, and production undo have not
been migrated yet.

For running and checking the package, see the [standalone demo](demo/README.md).
Browser tests disable the entire demo stylesheet: package geometry, controls, the
host-supplied CSS background values, and public theme overrides must continue working without it.

## JSX layouts and explicit drop targets

Register `{ content, layout }` to choose content and composition independently.
Content receives `blockId`; layout receives `BlockLayoutProps` with the same ID and
composes owner-bound primitives in any JSX order. No whole editor/panel/document is
passed through the layout contract. The default remains the standard outline.

```tsx
/**
 * Places a board's tiles before its own row through the public layout primitives.
 *
 * @param props - Identity of the host-owned board.
 * @param props.blockId - Real parent used by the explicit inside drop target.
 * @returns Children, body contributions, and then the board content row.
 */
function BoardLayout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockChildren item={TileItem} dropAxis="grid" dropPlacement="siblings" style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }} />
      </BlockDropTarget>
      <BlockBody />
      <BlockRow><BlockContent /></BlockRow>
    </>
  );
}

editor.renderers.register("board", { content: BoardTitle, layout: BoardLayout });
```

The primitives are exported from the package. `BlockRow` owns inline/perimeter
slots, `BlockContent` resolves live host content, and `BlockBody` places body slots
where the layout mounts it. Each corresponding region should be placed once per
occurrence. A headerless layout can omit BlockRow; selection belongs to BlockView.
`BlockChildren` alone maps the real child IDs. Mount it once instead of recursively
calling host renderers. Its `children` append non-block controls after the mapped
nodes, allowing an add-column button inside the actual flex/grid group.

The optional `item` component receives `BlockChildrenItemProps` with a child ID and
the Page-rendered child element. Use `BlockItem` there for placement styles or
controls; it preserves the single block identity and owns the child's sibling-level
CSS counter. Nested node counters do not increment twice. `gap` receives
`BlockChildrenGapProps` for each canonical gap, including the start/end and an empty
list. Linear lists attach declarative edges to their existing shells. Grid items
compose `BlockDropWrapper` around their supplied children. Physical gaps are enabled
through `dropGaps`, independently of item edges and background append. Keep item
component identities stable. Declarations add no DOM and never change layout spacing.

Child-order/collapse context is separate from chrome, selection, and slot entries.
Stable ID arrays avoid mapping children for unrelated updates. Layout composition
is memoized independently of primitive updates; content retains its own memo boundary
and addressed hooks. Reordering siblings preserves keyed nodes; changing layout or
moving across different React parents may remount content. The editor's ID-bound
node objects still survive until final destroy.

Outline indentation is opt-in through the standard layout, not forced on every
child host. The standard outline sets `renderEmpty={false}` to omit unused leaf hosts.
Empty custom child hosts are retained by default and can reserve space via public style parameters;
collapse retains the host and hides it even with an explicit display style. Defaults,
row geometry, item positioning, counters, and gap CSS ship in styles.css. Geometry
remains configurable through native style and the existing theme parameters, plus
`--rivto-drop-target-size` (8 local CSS pixels, independent of layout spacing).
Demo CSS does not override these structural selectors.

`BlockItem controlsPlacement="inside"` places the matching block's `left-top`
slot in row flow before content, reserving space for the handle and collapse controls.
The default `"outside"` retains perimeter placement. This setting applies only to
that item's block ID; descendant rows retain their own layout choice. Hidden
controls keep their in-flow width, so hovering does not shift text.
`BlockDropWrapper` accepts the same prop and forwards it to its existing item.

For CSS Grid or wrapping tiles, wrap each existing child with `BlockDropWrapper`
through `BlockChildren.item`. The wrapper remains one cell/flex item and preserves
its existing 8px visual frame. Data-only edge declarations are measured on that
item; they create no strips, event listeners, overlays, or extra cells:

```tsx
function TileItem({ children }: BlockChildrenItemProps) {
  return <BlockDropWrapper style={{ width: 280 }}>{children}</BlockDropWrapper>;
}

<BlockChildren item={TileItem} dropAxis="grid" dropPlacement="siblings"
  dropGaps={false} dropBackground
  style={{ display: "grid", gridTemplateColumns: "repeat(2, max-content)" }} />;
```

`axis` defaults to `grid` (four edges); `vertical` and `horizontal` enable only
block or inline edges. Before uses block-start/inline-start, after uses block-end/
inline-end. Inline sides follow RTL. Block edges win corners. `targetSize` overrides
`--rivto-drop-target-size` in local CSS pixels; scale is measured from the mounted
anchor. Changing this size never changes content width or any layout dimension.
A 280px wrapper still leaves 264px of content with its existing 8px visual padding.

Every block shell declares inside insertion over its content, including native controls.
`data-editor-control` affects ordinary interaction, not an already active drop gesture.
Declared placement edges retain priority within the nearest layout, and nested layouts
prevent a child hit from falling through to an enclosing block. `BlockDropTarget asChild` attaches explicit
`regions` to one existing ref-forwarding element. An edge declares `side`, optional
`size`, and a canonical `destination`; an inside region declares `coverage` (`bounds`
or `background`). The `destination` convenience prop declares an inside bounds region.
Background excludes child items, text, explicit exclusions and nested editors. For custom
existing ordered hosts, `BlockDropLayout` composes a single child without creating DOM.
Its options provide `axis`, stable `order`, `gaps`, and optional background `regions`.

`BlockChildren.dropGaps` defaults to true for linear lists, false for grids. Disabling
it disables insertion in free gaps, while keeping independently declared item edges.
`dropBackground` enables append in unoccupied host space, including filtered lists.
Inside feedback covers the receiving block's complete registered shell, including
its descendants. The resolved target carries this explicit `outlineElement`
separately from the hit anchor; rendering does not infer hierarchy from DOM ancestry.
Custom resolvers may supply `outlineElement` directly; omission paints their hit anchor.

Bento enables shared boundaries and background append: unoccupied space beneath
a shorter tile belongs to the board, while declared neighboring edges remain
available for sibling insertion. `emptyDropTarget` limits background append to a canonical
empty child list. Neither option gives the host an artificial minimum height.

Mounted anchors are published in supplied canonical order after structural commits;
that order must match visual flow. No DOM-order comparisons occur. Linear
gaps use binary search and query-local measurements; row-major grids can opt into
same-row gaps and row transitions whose canonical neighbors overlap horizontally.
Other inter-row space belongs to background. CSS dense packing, visual
reordering, and arbitrary rotation are outside this ordered-axis contract. Scrolling,
resizing and zoom read current geometry without a persistent rectangle cache.
Virtual roots require consecutive mounted indices; unmounted holes remain inert.

The closest layout bounds discovery. Native hit testing preserves clipping and
occurrence isolation. Within one anchor, explicit priority wins, then block edge,
inline edge, and inside; ties retain registration order. Physical gap wins over
background append. Source rejection or stale neighbors return no target and never
search an outer structural level. The inspector changes feedback only.

Canonical parent and neighbor IDs come from the shared iterator, including after
reordering and filtering. Both sides of a hidden canonical sibling retain their own
destination; the nearer visible anchor owns its half of a physical gap. Source
exclusion adjusts canonical neighbors without moving the physical indicator.
Wrappers compose BlockItem for ref forwarding and one sibling counter, retain the
existing subtree, and do not create another BlockNode or choose renderers.
A wrapper without canonical child placement throws instead of inventing a parent.

Refs/effects release registrations on replacement, collapse and unmount, including
StrictMode replay. Controllers own final cleanup. Nested occurrences reset layout
and depth contexts. Host permission checks, cross-document transfer, transactional
move commands and undo remain outside this geometry API. Adding a container requires
composition of these declarations, not a block-type branch in the resolver.

## Registered block decorators

`editor.wrappers.register({ component, priority })` installs a wrapper around every
existing block's shared shell. Priority is required and must be finite. Higher
priorities are outermost; equal priorities retain registration order. Each call
returns an idempotent disposer removing only that installation. Register during
extension setup for automatic rollback/removal/destruction, or retain the disposer:

```tsx
const removeWrapper = editor.wrappers.register({
  component: MyBlockWrapper,
  priority: 100,
});
removeWrapper();
```

`BlockWrapperProps` contains the immutable own-node `block` snapshot and already
rendered `children`. Render those children exactly once; Page still owns renderer
lookup, layout composition, recursive traversal, subscriptions, and the one BlockView.
The generic BlockWrapper pipeline has no CSS geometry or drag-and-drop policy.
`BlockDropWrapper` is the separate concrete insertion frame used by tile layouts.

A decorator may provide React context or wrap children in its own element. It owns
that element's React event handlers, local ref, native listeners, and cleanup. Events
bubble/capture through nested wrappers normally. The editor API is available through
useBlockEditorController when needed; no shared reference to BlockView is supplied.
BlockView retains its ordinary explicit ref for direct consumers.

Use `BlockItem block={block}` when a decorator needs a counter-aware element
outside BlockChildren.item. The borrowed snapshot supplies identity/list decoration without a second subscription.
The outermost item for a block owns its sibling counter; nested items for the same
ID and the inner BlockView do not count again. Canonical drop destinations still
require the actual BlockChildren placement. See demo/demo-wrapper.tsx for a wrapper
owning its element and pointer-capture handler without a shared-ref provider.

Registry snapshots retain identity until registration changes; observing them does
not subscribe to document data. View detach/remount retains installed wrappers.
Changing the decorator chain can remount React descendants because ancestry changes;
host data and cached node objects survive, but local React state/focus is not promised.
Additional wrapper geometry remains a host layout choice. Use Page primitives to
preserve existing counters/placement rather than creating a second block identity.

## Input and optional selection

`editor.events.register(id, definition, handler)` registers typed native input.
Definitions require a finite `priority`; optional `target` is `root` (default),
`document`, or `window`. `scope` filters occurrence-owned block/content/anchor
context. A handler returning `"handled"` claims this input for this editor; it must
call `event.raw.preventDefault()` explicitly. DOM propagation is unchanged.
Handlers return `"continue"` when leaving input available.
`editor.events.observe` registers non-consuming observers, delivered before handlers
in the same queue even when another queue already claimed the event.
Priority orders handlers sharing native target and capture phase; browser capture and
bubble phases order different realms/options. Nested editor targets do not
acquire the parent's block context. `on("focus" | "blur", observer)` remains a
separate observation API; `onDetach` releases pending gestures and timers.

The host creates and owns `BlockEditorController`. Its `keyboard` manager uses
`@chulane/rivto-keyboard`; borrowed APIs exclude destruction and transport
attachment. Registrations survive view remounts. Register default keys in the
host, and replace them through `setKeymapOverride` or `replaceKeymap`.

```tsx
const editor = new BlockEditorController({ adapter });
editor.keyboard.register({ id: "selection.toggle", keys: ["Control", "Meta"] }, () => false);
editor.keyboard.register({ id: "selection.range", keys: "Shift" }, () => false);
editor.keyboard.register({ id: "selection.exact", keys: "Shift+Alt" }, () => false);
const selection = new BlockSelectionExtensions({
  toggle: "selection.toggle",
  range: "selection.range",
  exact: "selection.exact",
});
for (const feature of ["native", "click", "toggle", "range", "pointer", "feedback"] as const) {
  editor.extensions.register(`selection.${feature}`, selection.feature(feature));
}
// The host retains editor and calls editor.destroy() after unmounting the view.
<BlockEditor editor={editor} />;
```

Each selection feature is independently disposable and installs once per editor.
One `BlockSelectionExtensions` coordinates their gesture state independently for
each editor. Text renderers remain host-owned: mark their editable host with
`data-block-content` and `data-block-selection-anchor`; mark structural selection
regions with `data-block-selection-anchor`. Native controls retain interaction.
`data-prevent-text-editing` excludes nested interactions; a control explicitly
marked as a selection anchor can seed a drag while retaining ordinary clicks.
JavaScript activation handlers on such controls must honor `event.defaultPrevented`
to avoid activating after a drag.
The package stylesheet owns structural geometry and binding feedback. Hosts own
editable geometry, including minimum height, padding and text wrapping, so rich
text overlays retain their renderer-defined bounds. Hosts may customize the
selection binding cursor with `--rivto-selection-cursor`.

The selection adapter owns current coverage, updates/clears, cached visible
selectable order (including collapse), UTF-16 text length, and addressed whole-block
membership subscriptions. `BlockSelectionSnapshot` contains directed canonical
ranges; `end: -1` denotes whole-block live-end coverage. Canvas/plugin selection
is outside this contract. Same-editable selection remains native; cross-editable
drag defaults to whole blocks, with exact endpoints enabled by the configured
binding. Active drags retain captured bindings through keymap edits and observe
live key state. Drag work stops on cancellation, window loss, detach, or feature
removal. Keyboard selection navigation, DnD, virtualization, and main-editor
selection integration remain separate stages.

Held-key cursor feedback updates only the hovered selection anchor, avoiding a
root attribute change that would restyle every block in a large document.

### Window-scrolled virtualization

```tsx
<BlockEditor
  editor={editor}
  virtualization={{ enabled: true, estimateSize: 240, overscan: 3 }}
/>
```

Omit `virtualization` or set `enabled: false` to render the complete display list.
When settings are supplied, `enabled` defaults to true, `estimateSize` to 240, and
`overscan` to 3. The estimate must be positive and finite; overscan must be a
non-negative integer. Sizes are CSS pixels;
`overscan` counts complete display roots. Import the package stylesheet as usual.
The implementation follows `react-rivto-editor`'s variable-height root windowing
using `@tanstack/react-virtual`, without depending on that package or its panel.

`BlockTree` uses one keyed row hierarchy for both modes. Changing settings does
not replace retained roots, so visible embeddings do not reacquire their source
merely because windowing was switched. Offscreen roots can still unmount normally.
The package demo exposes a live toggle and both numeric settings.

The view owns `BlockVirtualizationController`, measurement, native endpoint pins,
and cleanup. Blocks outside the window unmount their renderers and child subscriptions.
Lightweight root metadata subscriptions remain for correct list numbering after
an offscreen list-mode change. Ordinary text changes do not rerender the virtual tree.
The adapter must implement `blocks.getParentId(id)` using actual model hierarchy;
this lets endpoint mounting walk ancestors instead of scanning the document.

Selection stays in `adapter.selection`. `getSelectableBlockIds()` includes
unmounted blocks and excludes blocks absent from the active surface, together with
descendants hidden by the host's collapse policy. Structural selections never pin
all selected blocks. Focused content, canonical endpoints, and native text endpoints
retain their DOM; intermediate selected blocks can unmount.
DOM endpoint resolution mounts an expanded target synchronously without scrolling.
Indent/outdent must consume stored selection IDs and delegate mutations to the host,
not collect selected DOM elements. The demo registers Tab / Shift+Tab for structural
selection and demonstrates this boundary without adding a Page document manager.

Open `?repeat=200&virtual` in the package demo. Virtualization currently uses window
scrolling and complete display subtrees, as in the original page surface. A single
large nested container still mounts its expanded children; grid/board child windowing
requires its own layout policy. Production host integration, history restoration,
keyboard navigation and DnD migration remain separate stages.

## Optional handle dragging

Register `new BlockDragExtension(moveAdapter)` through `editor.extensions`, and
register `BlockDragHandle` in a slot (the demo uses `end`, preserving the start
gutter). Custom handles can use `data-block-drag-handle`. Existing `BlockDropTarget`,
`BlockChildren`, `BlockDropTarget` and `BlockDropWrapper` declare real destinations; a handle alone
creates no destinations or implicit hierarchy.

`BlockDragAdapter.canMove(ids, destination)` checks current host permissions without
writing data. Page uses it for target feedback and rechecks on pointer release.
`BlockDragAdapter.moveBlocks(ids, destination)` is a synchronous host operation.
It validates current source existence/access, destination neighbors, container
policy and cycles before writing, commits the complete group, and preserves
structural selection in its new canonical order. Return false for a rejected move
without partial writes. Production hosts supply transactions and undo; the demo
adapter is in-memory and has no history.

The gesture completes in window capture for `pointerup`, before descendant controls
can stop bubbling. If release was unavailable and a later pointermove reports the
primary button released, Page completes the last displayed destination after a
live permission check. That movement's new coordinates do not select another
receiver. A last held position without a destination performs no move. Escape,
blur, pointercancel and detach cancel without committing; native clicks retain
ordinary browser delivery.

A destination with `parentId: null` addresses real document roots. Page validates
its neighbors against `blocks.getRootIds()`, independently of display IDs.
An undefined root snapshot disables that destination; an empty array exposes an
empty document. Supply `BlockEditor.emptyDropParentId` to mount an empty-view
region (null for document roots); omission disables that region. `BlockRootNode`
renders a root with actual-parent regions, including canvas block
projections. `BlockList` accepts an explicit null parent for root gaps; omitting
the parent continues to mean an arbitrary display list without canonical gaps.

A structural selection containing the active handle supplies all source IDs,
including unmounted blocks and roots with different parents. Selected descendants
of selected ancestors move with their ancestors rather than becoming duplicate
sources. Partial text selection or an unselected handle moves only that block.
The group is captured at the four-pixel activation threshold. Pointer movement
uses native target resolution and parent-chain checks, not recursive source
snapshots or previews. The count preview mounts no block content.

Escape, pointer cancellation, window blur, view detach and extension removal
cancel the gesture. The runtime supports window edge autoscroll. Keyboard dragging,
nested scroll containers remain outside this extension. Cross-occurrence transport
uses registered receiver regions and host transfer policy. Root insertion uses
canonical parent regions; display roots do not imply a shared real parent.
Keyboard activation of the handle does not move blocks. Keep keyboard movement in
host commands until its interaction extension is migrated.

Selection text classification is also model-backed: `selection.getTextLength(id)`
returns a UTF-16 length, including zero for editable empty text, or `undefined`
when the block has no text range. Do not derive this from mounted DOM. Text range
construction reads lengths only inside the selected interval; contentless members
use `end: -1` even while virtualized. Locating endpoints still scans the cached ID
order; this does not promise constant-time range construction.

Drop feedback identifies a geometric candidate, not host permission. The host may
still reject the move during its validating commit. The runtime currently supplies
no keyboard move command or permission-specific feedback.

## Host selection and navigation bridges

`BlockDOMSelection` converts native ranges using the adapter's displayed block
order and text metadata, including unmounted contentless blocks. Its restoration
method expects the host to mount surface-specific endpoints first.
`BlockSelectionEndpoints.resolve` recovers directed text endpoints without a
second host implementation. Neither class owns document selection or subscriptions.

`BlockNavigation` resolves adjacent and first/last displayed roots from borrowed
hierarchy and selection reads. A host subclass implements synchronous `mountBlocks`;
Page virtualization and canvas-card projection keep ownership of their own mounts.
The host owns occurrence lookup, scrolling policy, and registration cleanup.

### Explicit drop exclusions

Use `BlockDropExclude` to exclude an area while allowing registered drop regions
inside it, or set `exclude` on an existing `BlockDropTarget`. Both retain the existing DOM, dimensions,
child refs and ordinary event handlers. They prevent fallback to an enclosing target.
A matching nested drop region remains eligible; another exclusion below it blocks that portion again. On the same element,
exclusion wins over its target registration.

```tsx
<BlockDropExclude asChild>
  <div><SomeInteractiveContent /></div>
</BlockDropExclude>

<BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }} exclude={blocked}>
  <section>{children}</section>
</BlockDropTarget>
```

`BlockDropExclude.exclude` defaults to true; `BlockDropTarget.exclude` defaults to
false. Disabling BlockDropExclude removes only that boundary and does not declare
a target. Disabling BlockDropTarget.exclude restores its registered regions, which
can accept drops inside an excluded ancestor. The standalone primitive requires no
editor context and owns no registrations. Virtual trailing spacers use it explicitly. Search inputs,
buttons and resize controls otherwise participate in their declared containing drop
regions; starting a gesture and native control interaction remain independently owned.

Shared sibling boundaries use one midpoint indicator by default. Set
`<BlockEditor dropBoundaries="separate" ... />` to retain nearest-edge feedback
throughout a view. Override a child layout with
`<BlockChildren dropBoundaries="merged" ... />` or use
`BlockDropLayout` with `options.boundaries`. Changing the mode affects neither DOM
structure nor layout dimensions. Both modes cover the complete physical gap,
including fractional pointer coordinates whose native hit rounds onto a neighbor.

Only matching canonical sibling boundaries merge. Their preceding trailing edge
supplies one set of inside/outdent depth choices across the entire shared region;
vertical movement alone does not change depth. Distinct boundaries around filtered
children retain their own feedback.
Virtual roots merge only across consecutive mounted display indices; unmounted
intervals remain unavailable. `dropGaps={false}` still disables shared gap handling.

The tree and canvas forests add no ending spacer. Hosts that already render a
trailing control can declare end insertion on that same element:

```tsx
<BlockEditorEnd blockId={lastDisplayedId}>
  <div data-page-end-slot="true">{/* Host-owned trailing controls. */}</div>
</BlockEditorEnd>
```

`BlockEditorEnd` composes its single ref-forwarding child without adding DOM,
classes or minimum dimensions. Its canonical neighbor subscription preserves
hidden next siblings and works without mounting the final root. The host places
its real trailing element after virtual reserves. Views without trailing controls,
including embedded editors, retain ordinary block-edge insertion without acquiring
extra whitespace or a hidden ending box.

An edge declaration may use `coverage: "bounds"` to accept its whole anchor while
keeping the insertion line on the declared edge. `indicatorInset` independently
adjusts the logical-start inset of a block-edge line in local CSS pixels; negative
values extend feedback without extending hit coverage. Inline-edge lines ignore
this inset. These declarations do not add DOM or change layout dimensions.

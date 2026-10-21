# Rivto Page

A standalone structural BlockEditor with a bounded adapter. Concrete renderers and
data belong to the host; production ReactEditor/EditorPanel integration is not connected yet.

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
`subscribeBlockIds(listener)` observes changes to that list. The host may select
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

| CSS parameter                  | Default                     | Purpose                                       |
| ------------------------------ | --------------------------- | --------------------------------------------- |
| `--rivto-block-padding`        | `16px`                      | Shared row padding for content and controls   |
| `--rivto-block-gap`            | `16px`                      | Gap between displayed blocks                  |
| `--rivto-block-children-gap`   | `12px`                      | Space above and between child blocks          |
| `--rivto-block-indent`         | `28px`                      | Logical indentation of the child group        |
| `--rivto-slot-gap`             | `4px`                       | Gap between controls and row slots/content    |
| `--rivto-default-block-height` | `24px`                      | Minimum first-line height for rows/flow slots |
| `--rivto-block-control-size`   | `20px`                      | Checkbox/collapse control size                |
| `--rivto-block-marker-width`   | `24px`                      | Numeric marker width                          |
| `--rivto-block-start-width`    | control + marker + slot gap | Minimum start gutter, including an empty slot |
| `--rivto-block-radius`         | `10px`                      | Block background corner radius                |
| `--rivto-block-border`         | `none`                      | Optional block border                         |

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
        <BlockChildren item={TileItem} gap={BlockDropGap} style={{ flexDirection: "row", flexWrap: "wrap" }} />
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
list. `BlockDropGap` supplies configurable hit geometry; custom gap components can
use arbitrary JSX and BlockDropTarget. Keep item/gap component identities stable.

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
`--rivto-drop-gap-size` (8px) and `--rivto-drop-min-height` (32px for horizontal gaps).
Demo CSS does not override these structural selectors.

For CSS Grid or wrapping tiles, wrap each existing child with `BlockDropWrapper`
through `BlockChildren.item`. The wrapper itself is one cell/flex item; its internal
CSS Grid reserves four insertion strips around center content. Do not pass a flow
gap through `BlockChildren.gap` for this layout:

```tsx
function TileItem({ children }: BlockChildrenItemProps) {
  return <BlockDropWrapper style={{ width: 280 }}>{children}</BlockDropWrapper>;
}

<BlockChildren
  item={TileItem}
  style={{ display: "grid", gridTemplateColumns: "repeat(2, max-content)", gap: 0 }}
/>;
```

All four strips are always hit-testable. They occupy their own space instead of
covering content, so text and controls remain clickable during inspection as well
as ordinary editing. No activation prop or pointer-events switch is required.
The inspector only displays feedback and does not change target registrations.
Normal browser hit testing handles clipping, overlapping views, and nested editors.

The layout remains host-owned. Before uses top and inline-start strips, after uses
bottom and inline-end; logical inline sides follow RTL. Top/bottom own the corners,
so strips do not overlap each other or center content. The wrapper composes BlockItem
for native sizing, ref forwarding, and a single sibling counter. It does not create
a second BlockNode or data-block-id, choose renderers, or recurse through children.
Strips borrow the actual parent and adjacent IDs from the shared child iterator;
multiple strips can name the same canonical destination across a row break.
A wrapper outside an item with a real parent throws instead of inventing a parent
for an arbitrary display list. Registration cleanup follows ref detachment and
editor ownership, including StrictMode replay, collapse, and view unmount.

`--rivto-drop-gap-size` sets each strip thickness (8px by default). Declared wrapper
width includes both inline strips: a 280px wrapper leaves 264px for center content.
Two adjacent wrappers contribute two strips, yielding a default 16px content gap.
Set the child host's public `style.gap` to zero when wrappers provide all spacing;
any additional host gap is additive and is not itself covered by the strips.
Geometry follows wrapping and resizing through CSS without observers, rectangle
caches, or scans on pointer movement. Required styles ship in the exported styles.css,
even without demo CSS. Public theme overrides affect both strips and content space.
Empty grids retain an explicit inside target on the child host. Canonical order
remains independent from dense placement or visual CSS reordering. Real drag gestures,
source permissions, and move commits remain outside this geometry API.

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

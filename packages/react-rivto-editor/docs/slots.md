# Ordered owner slots

Block rows expose the in-flow logical slots `start` and `end`. They sit before
and after the renderer content, align to its first line, and participate in the
row's layout. They are the preferred positions for list markers, checkboxes,
and trailing metadata.

The names refer to the block row's inline direction, not positions in its text.
Because the renderer wrapper grows to fill the row, `start` appears immediately
before the first character while `end` appears at the far edge beside the first
line. An `end` slot does not follow the final character or the final visual line
of multiline content.

Block rows and first-class canvas elements also expose twelve layout-neutral
perimeter slots, three for each edge:

- Top: `top-left`, `top`, `top-right`.
- Right: `right-top`, `right`, `right-bottom`.
- Bottom: `bottom-right`, `bottom`, `bottom-left`.
- Left: `left-bottom`, `left`, `left-top`.

Corner pairs such as `top-left` and `left-top` share an anchor but expand along
their named edge.

Register slot content from an extension:

```tsx
const commentsExtension = (): ReactEditorExtension => ({
  id: "comments",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockSlot({
      position: "right",
      priority: 50,
      mode: ["block", "edgeless"],
      when: ({ block }) => hasComments(block.id),
      component: ({ block, selected }) => (
        <CommentCount blockId={block.id} emphasized={selected} />
      ),
    });
  },
});
```

Use `registerElementSlot` for first-class edgeless elements. Its component and
predicate receive `{ element, mode, selected }`; block registrations receive
`{ block, mode, selected }`.

Higher priorities sit closer to the owner. Equal priorities preserve
registration order. Registrations are owned by the installing extension and
are removed automatically during editor destruction.

Slots use `.rivto-slot`, `data-slot-owner`, and `data-slot-position`. Perimeter
slots are absolutely positioned and do not affect layout by default. Block
`start` and `end` slots are in flow; public selectors may customize their gap,
alignment, or owner layout.

Use slots for visible controls, badges, and labels. Keep block wrappers for
context boundaries, DOM measurement, and interaction mechanics that must
decorate the complete block shell.

## Universal block handle

`standardPreset()` installs `blockHandleExtension()` independently of dragging.
Custom presets can install it explicitly. `pageDragExtension()` supplies the
existing pointer and keyboard mechanics; it no longer installs a second button.
The exported `BlockHandle` can also be used by a host-owned block slot.

Wrap the panel's surface in `BlockHandleContext.Provider` to provide `onOpen`
and optional `renderIcon(block, collapsed)`. Navigation remains application-owned:
it does not prescribe a window, tab, or persistence mechanism. The shared handle
occupies the left-top row slot; do not retain a second Open button there. The
button alone activates dragging. `clickMovementThreshold` sets the finite positive
maximum pointer excursion from its press origin in viewport CSS pixels; it defaults
to **4**. Reaching the threshold prevents that press from opening the block even
if the cursor returns to its origin. It measures distance from the origin rather
than accumulated path length, independently of the drag activation distance.
Configure it on `BlockHandleContext` or override it on an individual `BlockHandle`;
standalone `DragHandle` accepts the same prop. Enter and Space retain native button
activation, and Shift+F10 opens the menu. A new press starts a new click decision;
other controls retain their clicks after dragging. Collapsed blocks
keep the default four-dot grip (2×2) and filled circular halo visible.
Set `alwaysVisible: true` in the context to show handles without hover or focus;
it defaults to `false` and can also be overridden on an individual `BlockHandle`.

```tsx
<BlockHandleContext.Provider
  value={{
    onOpen: openBlock,
    clickMovementThreshold: 4,
    alwaysVisible: true,
    renderIcon: (block, collapsed) => <MyIcon collapsed={collapsed} />,
  }}
>
  <PageSurface />
</BlockHandleContext.Provider>
```

Extensions register dedicated contributions with `editor.blockContextMenu.register`.
Registration returns an idempotent disposer and follows extension cleanup. Entries
have stable `id`, `title`, optional `order` (ascending), `parentId`, `isAvailable`,
and a `kind`: action (default), submenu, separator, or custom. Actions supply
`execute`, which returns `void` for synchronous work or `Promise<void>` for asynchronous completion;
custom entries supply `render`. Submenus receive children registered
with their ID as `parentId`. Register submenu parents before their children.
Custom content owns its controls' accessibility and uses the supplied `close`
callback when interaction is complete. Only the active menu mounts its contents.

Callbacks receive the invoking `reactPanel`, clicked `blockId`, captured `blockIds`,
and ancestor-deduplicated `rootIds` in document order. Right-click preserves the
selected group only when the clicked block belongs to it; otherwise it selects
that block. The panel-bound `blockContextMenu.execute` rechecks existence and
availability. Batch multi-block mutations through the supplied panel. A pending
clipboard cut rechecks content after the asynchronous write and refuses to delete
blocks edited in the meantime.

The list, collapse, clipboard, todo, and embedding extensions contribute their
own entries. Slash commands remain independent. Copy block embedding writes one
live reference per selected root, with document-qualified source IDs; normal paste
creates reference blocks rather than copies of source content. Clipboard errors
propagate to the host's existing asynchronous error handling.

The shadcn/ui menu separates formatting, outline, clipboard, and deletion actions
with horizontal dividers. Background swatches render inline as a custom component,
without opening a submenu.

Background swatches persist `listProps.backgroundColor`: empty/default, gray,
red, orange, yellow, green, blue, or purple. Colors cover the owning subtree;
explicit descendant colors override their ancestor visually. Clearing a color
removes only that block's override. Override `--rivto-block-<color>` theme tokens
to customize the palette. Fonts and persisted per-block handle icons are outside
this feature.

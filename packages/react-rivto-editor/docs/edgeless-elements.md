# First-class edgeless elements

Canvas state is stored in the document's `elements` collection, independently
from block content. Every element has an ID, a renderer-defined `type`, a
complete `frame`, a finite `zIndex`, and opaque `props`. The model validates the
common envelope; DocumentEditor validates registered element definitions on local
insertion and updates. React registrations install these definitions together with
rendering, clipboard, creation and property-editing contributions. Remote data and
loaded snapshots do not run editor validation.

Snapshots contain independent block and element trees. Blocks do
not contain coordinates. The structured clipboard uses version 4: page copies
contain blocks and internal links, while edgeless copies may additionally carry
elements and selected top-level element IDs.

## React-owned element types

The optional visual extension persists `rectangle`, `ellipse`, `drawing`,
`text`, `sticker`, `connector`, and `group` elements. Groups store child element IDs and
derive their visible bounds from those children. The core remains usable
without this extension and never interprets these types.

A `block` element stores `{ startBlockId: string, endBlockId: string }`. These
inclusive boundaries resolve to the current document-order root range, so blocks
inserted between them—including several empty blocks—remain in the same card.
Its frame belongs to the element; the referenced roots and their recursive
children remain normal blocks and retain existing editing and list behavior.
Canvas selection stores element IDs, whereas selection inside a block card uses
the regular block selection managers.

## Visual tools and properties

`edgelessVisualsExtension()` mounts a bottom-centered tool bar with always-visible
Select and Pan controls plus categorized shape, drawing, text, sticky, and
connector popovers. Pan moves the viewport with a left-drag (Space-drag and
middle-mouse pan still work in any tool). Clicking a category activates the last
tool used in that category (or the first default) and opens its popover. Shape,
text, and sticky presets enter a place tool: click-drag on the canvas rubber-bands
the size, a click without drag places a default `160×120` frame at the point, and
dragging a preset from the toolbar onto the canvas still drops it at the pointer.
Place previews and committed frames use the same grid and object-alignment
snapping as move/resize. Hold Alt to bypass snapping. A completed drag becomes
the active preset's click size until another preset or tool is selected; hold
Shift while dragging any place tool to constrain its frame to a square.
Pencil, pen, and marker store their brush preset with each drawing; the eraser
removes intersected whole canvas objects in one transaction. Escape or right-click
on the canvas returns to Select while a place, pan, drawing, eraser, or connector
tool is active (Escape also cancels an in-progress transform).

Selected non-connector visuals have four corner and four edge-center resize
handles. Edge-center handles change one local axis. The top-center rotation
handle rotates freely; hold Shift to snap the angle to 15-degree increments.
Rotation is stored with shapes, text, stickers, and drawings and is preserved by
clipboard and undo.

`sticker` is a styled editable sticky note. Its props are `text`, `fill`,
`color`, `fontFamily`, `fontSize`, and `align`; image/emoji sticker props are
not supported. Applications may append font and sticky presets:

```ts
const reactEditor = createReactEditor({
  editor,
  extensions: [standardPreset(), ...edgelessPreset({ visuals: {
    fonts: [{ label: "Brand", fontFamily: "Brand Sans, sans-serif" }],
    stickers: [{ id: "brand", label: "Brand sticky", fill: "#e8f0ff" }],
    orphanConnectors: "detach",
  } })],
});
```

Inside an EditorPanel subtree, a canvas component can own typed operations through the React hook:

```tsx
function CreateRectangle() {
  const operations = useEdgelessOperations();
  return <button onClick={() => operations.createElement({
    type: "rectangle",
    frame: { x: 40, y: 40, width: 160, height: 100 },
    zIndex: 1,
  })}>Rectangle</button>;
}
```

`edgelessVisualsExtension()` remains an installable extension for manual composition;
do not add it again beside `edgelessPreset()`. It exposes no command facade.
String-based `edgeless.*` commands remain available for command palettes and integrations.
Register custom types through `reactEditor.elementTypes.register({ definition, render,
behavior, clipboard, creation, properties })`. `definition.resize` or `behavior.resize`
returns property changes for core frame updates, including programmatic resize and
Moveable commits. Disposing a registration removes presentation and contributions;
persisted unknown elements remain visible through the fallback renderer.

### Custom renderers and editable properties

Built-in figures and custom types use the same registration path. A renderer receives
`element` with registered defaults and local property previews already merged into
`props`, together with `reactPanel`, the mounted canvas `operations`, `zoom`, and
`selected`. Render only the contents: the shared host owns position, rotation,
identity, selection markers and element slots. During a transform the host previews
geometry directly in the DOM; `element.frame` still contains the persisted size until
release. Renderers that scale their contents should follow the host's size through
CSS or an SVG `viewBox` with a `100%` viewport, rather than computing a scale from
the persisted frame. This does not require per-pointer React state or document writes.
`behavior.editableLabel` enables the
host's double-click editing state (`editing`, `setEditing`, `focusPointRef`). Internal
buttons and inputs should use `data-edgeless-ui="true"` and stop pointer propagation
so editing a control does not begin a canvas drag.

The `properties` component explicitly declares which fields are editable. Document
validation and defaults belong in `definition`; they do not automatically generate
controls. The component supplies only the sidebar contents:

```tsx
function BadgeProperties({ common, preview }: ElementPropertiesProps) {
  return <label>Title
    <input value={String(common("title") ?? "")}
      onChange={event => preview({ title: event.target.value })} />
  </label>;
}

// In extension.setup(editor); return this disposer for extension cleanup.
return editor.elementTypes.register({
  title: "Badge",
  definition: { type: "badge", defaults: { title: "Badge", color: "blue" } },
  render: BadgeElement,
  properties: BadgeProperties,
  creation: { title: "Badge", create: () => ({ type: "badge" }) },
  rememberedProperties: ["color"],
});
```

`common(key)` returns the shared value (compared with `Object.is`) or `undefined`
for mixed values. `elements` contains the same previewed snapshots as the renderers.
`preview(patch)` validates and normalizes the candidate properties without persisting
them. An outside pointer press, selection change, or property-panel unmount commits
pending edits as one undo entry; Escape inside the panel cancels them. Components
can also call `commit()` or `cancel()`. The shell owns its title, collapse/close
controls and selection count, and remains available with `visuals.toolbar: false`.
Use property patches for properties only; a key named `id` or `frame` is not
interpreted as element identity or geometry by this API.

`rememberedProperties` explicitly opts fields into canvas-local creation defaults.
Leave content such as a mindmap tree out of this list. Related registrations can
share a `behavior.defaultsGroup`; its initial property keys define shared settings.
The built-in categories retain their palette defaults. `behavior.creationDefaults`
can derive defaults before explicit creation properties are applied. Geometry
preparation belongs in `behavior.create`; `behavior.resize` handles persisted frame
changes. `behavior.relatedElements` returns referenced IDs so a same-level element
can follow its selected references into a group, as built-in connectors do.
World-space elements can declare `behavior.absoluteGeometry` and provide their own
controls instead of using the ordinary resize/rotate handles.

The main demo installs `demo/src/extensions/mindmap/mindmap.tsx` as a host extension.
Choose **Mindmap** in the bottom toolbar and click the canvas. Every node has an
editable label and a **+** button; each button adds a child, including on newly added
nodes. The tree is stored as a flat node array inside one element, with iterative
validation and layout and no configured branch/depth limit. It uses normal canvas
selection, moving, resizing, clipboard and undo, plus registered color/font-size
property contents. Large maps still have browser memory, DOM and canvas-coordinate
limits; this demo does not virtualize individual nodes.

Snapping preferences can be shared and persisted by the host without entering
the collaborative document:

```ts
const saved = JSON.parse(localStorage.getItem("canvas-snapping") ?? "{}");
const snapping = new EdgelessSnappingStore(saved);
snapping.subscribe(() => {
  localStorage.setItem("canvas-snapping", JSON.stringify(snapping.getSnapshot()));
});

edgelessPreset({
  surface: {
    snapping,
    avoidBlockElementOverlap: true,
    blockElementWidth: 720,
  },
});
```

The same store can be updated programmatically with
`snapping.set({ snapToGrid, alignObjects })`; mounted toolbar toggles publish
through that store.

New block cards avoid existing block cards by default. Pass
`avoidBlockElementOverlap: false` to retain the exact requested creation point;
visual objects never participate in this placement check.

New cards use the page surface's `720px` width by default. Set
`blockElementWidth` in the edgeless surface options to choose another initial
width; existing and manually resized cards retain their persisted width.

Shapes (`rectangle` / `ellipse`) and connectors also accept optional label props
(`text`, `color`, `fontFamily`, `fontSize`, `align`, `verticalAlign`). Shapes also
store `filled` / `stroked` booleans so fill and border can be toggled off while
keeping their colors. Double-click a shape or connector to edit its label; shape
labels sit inside the fill, connector labels sit at the path midpoint. The
properties panel groups Style / Line and Text controls, including horizontal and
vertical text alignment toggles.

Connectors attach to any non-connector element using a stable element ID and a
normalized edge anchor. Straight, orthogonal, and curved routes are supported.
Grouping objects automatically includes same-level connectors whose two
endpoints are contained by the selection, including endpoints inside nested
groups. Layer commands derive the same relationship for older persisted groups
that do not list those connectors in their children.
Deleting an endpoint detaches it at its last absolute coordinate by default;
set `orphanConnectors: "delete"` to remove such connectors instead. Clipboard
paste remaps included endpoints and detaches references to objects outside the
copied bundle.

One properties panel edits an exact-type multi-selection atomically. Its header
has icon-only collapse and close actions; close clears the selection. Creation
properties become session-local defaults for that editor instance. They are not
stored in snapshots or synchronized. Moving and resizing honor two independent
toggles next to zoom: **snap to grid** (20px canvas grid) and **object
alignment** (edges, centers, and equal spacing guides). Hold Alt to temporarily
disable both. Multi-select align/distribute actions live on the selection
toolbar. Connectors and brush drawings are selected by clicking near the stroke (not the
frame bbox); empty space inside a large frame does not select them, so clicks can
reach blocks or shapes underneath. Selected drawings still show the normal bbox
outline.

Groups use progressive single-click entry (AFFiNE-style). The first click on a
child selects its group; the next click drills into that child (or switches
siblings). A later single click on a drilled-in shape returns selection to the
group. Empty space inside the selected group's bbox (gaps between children) also
keeps / drags the group; the outline sits above children while a hit plate sits
under them so drill-in is not blocked. Nested groups are supported: Primary-click
(Ctrl/Cmd) an existing group together with another top-level object, then Group
again. Marquee selection lifts hits to outermost groups so a group can be
multi-selected with siblings. Double-click edits text and sticky notes
and is not used for selection cycling. Double-click also edits labels on shapes
and connectors. Only the currently selected group renders
its outline and drag handle.
Property edits preview live and commit one undo step when clicking outside the
properties panel. Create-toolbar category menus stay open after picking a tool
or placing a preset so multiple objects can be created quickly.

## Block projection and separators

Block cards fit their complete block content vertically by default, retaining
their configured width without a vertical scrollbar. A manual resize stores
`autoHeight: false` in the block element props and makes both dimensions fixed.
Set the same element prop back to `true` to retain its current width and resume
automatic content-height measurement. Selecting one or more block cards opens
the shared right-side properties panel with the same **Automatic card height**
toggle used to switch between automatic and fixed layout.

React reconciles root-block runs after document updates. A root partitions
adjacent block elements when its React block registration declares
`separatesBlockElements: true`. Empty paragraphs always remain editable card
content. Nested separator blocks render as dividers without splitting the
current root projection.

Custom block plugins can provide their own separator type:

```ts
blockExtension({
  definition: { type: "custom.separator" },
  render: CustomSeparator,
  separatesBlockElements: true,
});
```

Each contiguous run belongs to exactly one block element and its boundaries
follow document order. On split, the original element keeps the first segment and its
geometry; subsequent deterministic elements use 24-pixel cascading offsets. On
merge, the element owning the earliest root survives. Reconciliation uses a
dedicated collaborative transaction origin, so repairs synchronize without
creating additional local undo steps.

Deleting a block element is a React structural operation: it deletes the
referenced block trees and removes affected group references atomically. Core
element deletion itself deliberately has no implicit effects on blocks, links,
groups, or opaque props.

## Implementation ownership

The React package keeps canvas operations and local tool state in
`src/managers/elements/`, with their lifecycle hooks in `src/hooks/elements/`.
Visual definitions, renderers, creation geometry and shared styles live in
`src/elements/`; the viewport, block cards, snapping and surface configuration
live in `src/surfaces/edgeless/`. Extensions install these contributions and own
optional interaction handlers, creation gestures, toolbars and property panels.

`EdgelessOperations` remains owned by the mounted canvas representation, even
though its implementation lives beside the element managers. Separate calls to
`useEdgelessOperations()` create independent tools and previews; pass the existing
operations to child UI that must share the canvas state. The toolbar remains a
separate component receiving that instance. Extension UI is mounted beneath the
receiving panel context, where `usePanel()` exposes the core panel contract and
`useReactPanel()` exposes the React panel and its `editor`. This refactor does
not add toolbar slots, sidebars or floating-window APIs.

## Creation toolbar groups

`reactEditor.edgelessToolbar` registers groups and tools for all panels of that
React editor. Open menus, active tools and each group's last-used entry remain
local to the mounted edgeless panel; toolbar interactions do not write document
state or history. A group button opens its menu and activates the last-used member,
then its `defaultToolId`, then its first available member. Clicking the open group
closes the menu without deactivating its tool. Select, Pan and Escape close menus.

An element's `creation` automatically registers a toolbar tool with ID
`element:${definition.type}`. Add `group` to place it inside a group, or omit it
for a standalone button. Its disposer removes the toolbar entry together with the
renderer and definition. Removing presentation never deletes persisted elements.

```tsx
setup(editor) {
  editor.edgelessToolbar.registerGroup({
    id: 'diagrams', title: 'Diagrams', icon: <DiagramIcon />,
    defaultToolId: 'element:mindmap', order: 10,
  });
  return editor.elementTypes.register({
    definition: mindmapDefinition,
    render: MindmapElement,
    properties: MindmapProperties,
    creation: {
      title: 'Mindmap', icon: <MindmapIcon />, group: 'diagrams', order: 0,
      create: () => ({ type: 'mindmap', frame: { x: 0, y: 0, width: 240, height: 160 } }),
    },
  });
}
```

Registrations made in extension setup follow its lifecycle. Each register method
also returns an idempotent disposer. Group and tool IDs are unique within their
respective registries; duplicates throw. Groups may be registered after their
tools: members remain available in `getTools()` but are hidden until their group
exists. Empty groups are hidden. Ascending `order` defaults to zero and ties use
registration order, including between groups and standalone tools. `getEntries()`
returns those visible top-level entries; `getGroup`, `getTool`, `getGroups`,
`getTools`, `subscribe` and `revision` support custom hosts.

A group's `render` component controls its contents, while the common toolbar owns
popover positioning and dismissal. Always render the supplied `items`, including
members registered by other extensions. Use `renderTool(item, children?)` to keep
activation, keyboard access, active styling and optional drag bindings. It renders
the registered icon plus the title by default; pass children to replace the title
with custom content, or `null` for an icon-only item.

```tsx
editor.edgelessToolbar.registerGroup({
  id: 'diagrams', title: 'Diagrams', icon: <DiagramIcon />,
  render: ({ items, renderTool, operations, reactPanel }) => (
    <div className="diagram-tools">
      <h3>Diagrams</h3>
      <div className="diagram-grid">{items.map(item => renderTool(item))}</div>
      <DiagramCreationSettings operations={operations} reactPanel={reactPanel} />
    </div>
  ),
});
```

Each resolved item also exposes `tool`, `active` and `activate` for a fully custom
control. Preserve accessible labels, active styling and keyboard activation when
replacing the standard button. Internal UI must carry `data-edgeless-ui="true"`.
Group content describes creation settings; selection editing still belongs to the
element's `properties` component and its shared preview/commit/cancel lifecycle.

For tools independent of a registered element type, use `registerTool` with `id`,
`title`, optional `icon`/`group`/`order`, `activate({ operations, reactPanel })` and a
pure `isActive(currentTool)` predicate. Predicates should identify distinct tools
or presets so remembered group choices are unambiguous. For example, built-in
brushes select drawing mode instead of directly inserting an element. Toolbar
activation must not create document content; placement/drawing gestures do that.
Optional `getButtonProps` supplies pointer bindings for draggable presets. Its
click handler may call `preventDefault()` when pointer release already activated
the tool, avoiding a duplicate activation. Leave keyboard clicks unhandled to
use the common `activate` behavior.

Removing the active tool resets affected panels to Select. Removing an open group
closes its menu and clears its remembered choice; registered members remain and
can reappear when the group is installed again. Existing elements, their properties
and undo history are unaffected. Groups are one level deep.

## Creation preview lifecycle

Place tools and toolbar presets preview the registered `render` component using a
detached draft. Built-in figures and host types such as Mindmap use this same path.
`ElementRenderProps.preview` is true for drafts and false for persisted elements.
The draft has a temporary ID, complete prepared props and the preview frame in
canvas units. Render from those supplied values; the ID cannot identify a stored
node. The preview host is inert and hidden from assistive technology, cannot be
selected, and does not mount element slots or transform controls. A dashed outline
shows empty or transparent content. There is no fabricated text for an empty label.

Renderers must not mutate documents or autofocus/register document resources when
`preview` is true. DOM inertness prevents ordinary control interaction but does not
suppress component effects. For example, guard an effect inside the effect callback,
without changing the order in which React hooks are called.

`creation.create` runs once when a prospective placement first needs a draft. Keep
it free of document writes: return data, not an inserted record. Its width/height
set the initial preview size; a remembered completed drag size takes precedence.
Movement reuses that input, and release inserts it with the final placement frame.
Escape, pointer cancellation, tool changes and panel deactivation discard the
active gesture without creating an element. Merely leaving the viewport while
hovering hides the ghost; the next hover can reuse the same prospective input.

`EdgelessOperations.prepareElementCreation` shares detached defaults and pure
`behavior.create` preparation with insertion. It validates preview props without
allocating persisted IDs, selecting a node or notifying document subscribers.
Insertion retains its ordinary core validation/middleware path; do not insert the
normalized preview record instead of the original input. In particular, validators
must not accidentally run twice on already-normalized values at commit.

Canvas placement uses local gesture preview geometry; toolbar preset ghosts move
imperatively after mounting their renderer. Neither path publishes intermediate
geometry to the document or undo history. Existing-element transform previews keep
their separate DOM geometry lock: their renderer still sees the persisted frame.
Drawing and connector tools keep geometric previews for their unfinished gestures.

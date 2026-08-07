# First-class edgeless elements

Canvas state is stored in the document's `elements` collection, independently
from block content. Every element has an ID, a renderer-defined `type`, a
complete `frame`, a finite `zIndex`, and opaque `props`. Core validates only the
common envelope and exposes CRUD through `document.elements` and
`editor.elements`; React extensions own type-specific validation and behavior.

Schema-v5 snapshots always contain `blocks`, `links`, and `elements`. Blocks do
not contain coordinates. The structured clipboard uses version 3: page copies
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
Pencil, pen, and marker store their brush preset with each drawing; the eraser
removes intersected whole canvas objects in one transaction. Escape or right-click
on the canvas returns to Select while a place, pan, drawing, eraser, or connector
tool is active (Escape also cancels an in-progress transform).

`sticker` is a styled editable sticky note. Its props are `text`, `fill`,
`color`, `fontFamily`, `fontSize`, and `align`; image/emoji sticker props are
not supported. Applications may append font and sticky presets:

```ts
edgelessVisualsExtension({
  fonts: [{ label: "Brand", fontFamily: "Brand Sans, sans-serif" }],
  stickers: [{ id: "brand", label: "Brand sticky", fill: "#e8f0ff" }],
  orphanConnectors: "detach",
});
```

Shapes (`rectangle` / `ellipse`) and connectors also accept optional label props
(`text`, `color`, `fontFamily`, `fontSize`, `align`, `verticalAlign`). Shapes also
store `filled` / `stroked` booleans so fill and border can be toggled off while
keeping their colors. Double-click a shape or connector to edit its label; shape
labels sit inside the fill, connector labels sit at the path midpoint. The
properties panel groups Style / Line and Text controls, including horizontal and
vertical text alignment toggles.

Connectors attach to any non-connector element using a stable element ID and a
normalized edge anchor. Straight, orthogonal, and curved routes are supported.
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

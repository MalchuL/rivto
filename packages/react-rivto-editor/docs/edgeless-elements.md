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
`text`, `sticker`, and `group` elements. Groups store child element IDs and
derive their visible bounds from those children. The core remains usable
without this extension and never interprets these types.

A `block` element stores `{ startBlockId: string, endBlockId: string }`. These
inclusive boundaries resolve to the current document-order root range, so blocks
inserted between them—including several empty blocks—remain in the same card.
Its frame belongs to the element; the referenced roots and their recursive
children remain normal blocks and retain existing editing and list behavior.
Canvas selection stores element IDs, whereas selection inside a block card uses
the regular block selection managers.

## Block projection and separators

React reconciles root-block runs after document updates. By default, an unowned
empty paragraph separates adjacent block elements. Only roots participate:
nested empty paragraphs never split a card, and an empty root already referenced
by a block element remains intentional editable content.

Configure a different rule when creating the React runtime:

```ts
const view = createReactEditor({
  editor,
  edgeless: {
    isBlockElementSeparator: (block) =>
      block.type === "paragraph" && block.content === "---",
  },
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

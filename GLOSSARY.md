# Rivto glossary

Rivto presents one collaborative document as a writing page or an edgeless canvas. Terms are grouped by the part of the editor that gives them their meaning. The short definitions follow the repository’s [language guide](CONTEXT.md#language) and [glossary convention](dev_notes/code-style-ru.md).

## Documents and hierarchy

| Term | Meaning in Rivto |
| --- | --- |
| **Document model** | The collaborative state of one identified document. It owns the block forest, element hierarchy, document plugin data and snapshot operations. |
| **Block** | An identified, typed unit of document content with ordered children. A `Block` read includes the complete descendant tree. |
| **Block node** | A shallow read of one block’s fields and direct child IDs. A change deep in a child’s subtree can leave the parent node unchanged. |
| **Block content** | The block’s Markdown source, stored as collaborative text and exposed as a string on a block read. |
| **Block props** | Type-specific properties of a block, such as a TODO item’s status. |
| **Block list props** | Properties interpreted when a block appears in a page or outline, including extension-defined presentation styles. |
| **Plugin data** | Data keyed by an extension’s namespace. A document and an individual block each have their own plugin data. Selection also supports local plugin data. |
| **Root block** | A block in the document’s ordered top-level list. A panel can display a nested block at its top level while the block retains its document parent. |
| **Block forest** | An ordered collection of block trees, such as the roots in a snapshot or the subtrees being imported together. |
| **Block destination** | A position in one parent’s ordered child list. A null parent selects document roots, and omitting the sibling to insert before means append. |
| **Import ID map** | The correspondence between source block IDs and destination IDs for an import. Available IDs are preserved and collisions receive new IDs. |
| **Element** | An identified canvas object with a type, frame, stacking order, properties and ordered child elements. Blocks and elements have separate hierarchies. |
| **Element node** | The shallow record of one element, including its direct child IDs. A `DocumentElement` read instead expands the complete child tree. |
| **Element frame** | An element’s axis-aligned position and positive dimensions in unscaled canvas units. A nested element’s coordinates are still measured in the canvas coordinate system. |
| **Element destination** | A position before a sibling or at the end of an element child list. A null parent selects the ordered root elements. |
| **Document snapshot** | A versioned portable document containing recursive block trees, flat element records, ordered root element IDs and optional document plugin data. |
| **Snapshot update** | A replacement of the supplied sections of a document snapshot. Omitted sections retain their current state. |

Sources include the [public document contracts](packages/document-model/src/core/types/document.ts) and [collaborative storage fields](packages/document-model/src/core/types/storage.ts).

## Collaborative storage and history

| Term | Meaning in Rivto |
| --- | --- |
| **CRDT document** | The adapter boundary for one collaborative document’s shared values, transactions, updates, providers and undo scopes. `YjsDoc` implements this boundary with Yjs. |
| **Shared map, array and text** | The collaborative values underlying keyed records, ordered sequences and editable text. A detached value becomes part of the document when inserted into an attached container. |
| **Text delta** | A portable run of inserted text with optional formatting attributes returned by collaborative text. |
| **Transaction origin** | The identity associated with a collaborative write. The adapter uses its private local origin by default and can distinguish that origin in observed transactions. |
| **Deep observation** | Notification of changes within a shared container and its descendants. Each change has a relative path, and callbacks for the same transaction share an identity. |
| **Undo scope** | A shared map, array or text whose tracked changes participate in an undo manager’s history. |
| **Provider** | A synchronization connection attached to a CRDT document. Finishing attachment establishes the connection and remote document content may arrive later. |
| **Document registry** | A workspace’s independently synchronized root document and its set of registered document IDs, including documents whose content is unloaded. |
| **Document storage** | The host boundary that opens a registered document as a fresh model and attaches its providers. The caller owns the opened model. |
| **Editor storage** | The React host’s lifetime boundary for sharing document editors among consumers that acquire and release them. |

Sources include the [CRDT document](packages/crdt-doc/src/types/doc.ts), [Yjs adapter](packages/crdt-doc/src/yjs-doc/yjs-doc.ts), [text](packages/crdt-doc/src/types/text.ts), [observation](packages/crdt-doc/src/types/observe.ts), [undo](packages/crdt-doc/src/types/undo.ts), [registry](packages/crdt-doc/src/types/document-registry.ts), [document storage](packages/document-model/src/core/document-storage.ts) and [editor storage](packages/react-rivto-editor/src/editor/editor-storage.ts).

## Editors, panels and references

| Term | Meaning in Rivto |
| --- | --- |
| **Document editor** | The framework-neutral editing interface over a document model. Its managers expose document operations, commands, selection, mode, history and clipboard behavior. |
| **React editor** | The document-level host that connects core editing to React capabilities such as block presentation, extensions, surfaces and attachments. |
| **Panel** | A scoped editing view over a borrowed document editor. Its block and element roots can be chosen independently. |
| **Children panel** | A panel that shows the children of a chosen block. At document level it shows document roots, and deriving one from another panel can preserve the existing boundary. |
| **Embedding panel** | A panel that includes the referenced source block as a protected root together with its descendants. |
| **Block reference** | A document ID and block ID identifying a source block. Resolution from a block ID alone can be ambiguous across documents. |
| **Embedding** | A view of a referenced source block inside another editing context. Edits through the embedding panel address the source subtree. |
| **Surface** | The presentation registered for an editor mode. Page lays out a block outline and Edgeless positions elements on a canvas. |
| **Extension** | An installable feature whose setup contributes behavior or presentation to an editor. Removing its registration releases the resources owned by that installation. |
| **Block definition** | The editor’s registration of a native block type and its data rules. The host can associate presentation metadata with that definition. |
| **Structural behavior** | A block type’s policy for hierarchy operations. A behavior can handle an action, reject it, or leave it to another applicable behavior. |
| **Slash command** | An action exposed through the React editor’s slash menu, such as inserting a registered block type. |

Sources include the [document editor](packages/rivto-editor-core/src/editor/document-editor.ts), [React editor contracts](packages/react-rivto-editor/src/editor/types.ts), [children panel](packages/rivto-editor-core/src/panels/children-panel.ts), [embedding panel](packages/rivto-editor-core/src/panels/embedding-panel.ts), [block references](packages/rivto-editor-core/src/references/types.ts), [embedding extension](packages/react-rivto-editor/src/extensions/embedding/embedding.tsx), [block definitions](packages/rivto-editor-core/src/managers/block-registry-manager/types.ts), [structural behavior](packages/rivto-editor-core/src/block-behaviors/types.ts) and [slash commands](packages/react-rivto-editor/src/managers/slash/types.ts).

## Writing, selection and transfer

| Term | Meaning in Rivto |
| --- | --- |
| **Text-editable block** | A block whose content supports a text caret and character-range selection. |
| **Empty writing block** | A text-editable block whose host finds no meaningful writing content. Its emptiness can depend on the block type. |
| **Default writing block** | The writing block supplied by the host for operations that need a fresh place to type. |
| **Markdown hyperlink** | A URL or in-document href within a writing block’s Markdown. A block reference, by comparison, identifies its source using document and block IDs. |
| **First-child promotion** | Replacement of an empty parent with its first child. The parent’s remaining children stay under the promoted child in their existing order. |
| **Selection** | One local value that can combine block ranges, element IDs and extension-owned data. Its lifetime is independent of collaborative document state. |
| **Editor position** | A concrete caret boundary in a named block, measured in UTF-16 code units from the start of its content. |
| **Block range** | Coverage of one block from an inclusive start to an exclusive end, in UTF-16 units. An end of `-1` follows the block’s current end. |
| **Whole-block selection** | Selection of complete blocks. Each whole block has a range from zero to the live end, including when its content is empty. |
| **Structural selection anchor** | The region of a block where a pointer gesture may begin whole-block selection. |
| **Anchor and focus** | The starting and active ends of a directed selection gesture. A backward gesture can have its focus earlier in the document than its anchor. |
| **Resolved selection** | A selection whose block ranges have been checked against the current document and paired with the corresponding blocks. |
| **Clipboard bundle** | Rivto’s lossless transfer format for blocks, hierarchy and associated data. It can also carry elements and identify which elements were selected. |
| **Paste placement** | The destination intent for pasted blocks, including sibling insertion or insertion into a parent. Text-selection paste can also merge with a destination text range. |
| **Paste strategy** | One paste algorithm chosen from the available clipboard content and the destination intent. |
| **Cross-document block transfer** | A move that imports source subtrees into a different document and removes the source blocks after insertion. |

Sources include the [established writing terminology and discouraged synonyms](CONTEXT.md#language), [selection offsets and direction](packages/rivto-editor-core/src/managers/selection-manager/selection.ts), [resolved selection](packages/rivto-editor-core/src/managers/selection-manager/resolved-selection.ts), [default writing block](packages/react-rivto-editor/src/extensions/built-ins/page/default-writing-block/types.ts), [clipboard formats and placement](packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-data.ts), [paste strategy](packages/rivto-editor-core/src/managers/clipboard-manager/strategies/types.ts) and [cross-document transfer](packages/react-rivto-editor/src/block-transfer/cross-document-block-transfer.ts).

## Page layout and block interaction

| Term | Meaning in Rivto |
| --- | --- |
| **Block editor** | The standalone structural editor used for Page outlines and the contents of Edgeless cards. Its host supplies block data and selection through an adapter. |
| **Display list** | The ordered block IDs chosen for one block editor to display. They can have different actual parents, and each block brings its own descendants. |
| **Occurrence** | One mounted presentation of a block in a particular view. Geometry and pointer targets belong to that occurrence even when another panel shows the same block ID. |
| **Block view** | The DOM boundary of a complete rendered block, including its identity, selection styling and chosen layout. |
| **Block row** | The primary row containing a block’s own content and its row slots. Descendants can extend the block view beyond this row. |
| **Block content** | In Page presentation, the region rendering the host component registered for this block type. In document data, the same words refer to the stored Markdown string. |
| **Block body** | The layout region for contributions registered at the body slot, independent of the main content and the child list. |
| **Block children** | The layout region for a block’s child list. A custom layout controls how those children are placed. |
| **Block item** | An optional placement wrapper around one already-rendered block, used for item dimensions or controls in a list. |
| **Block slot** | A named presentation position where matching contributions appear in priority order, such as list and collapse controls at the start of a row. |
| **Block handle** | The block-level control used to act on or begin dragging a block. Its occurrence identifies which rendered block the user is interacting with. |
| **Drop region** | Geometry declared on a mounted target, such as an edge strip or free background, that proposes a block destination. |
| **Inside destination** | A proposed append to the children of a real parent or to the document root list. |
| **Between destination** | A proposed gap in a real sibling list identified by the parent and its previous and next neighbors. Either neighbor can be absent at a list boundary. |
| **Drop indicator** | The viewport line showing an insertion boundary. A body drop can outline the receiving block, while an indented append at an edge can still show a line. |
| **Trailing block** | A page-end insertion target shown after the document roots so a user can start another block. |

Sources include the [Page adapter](packages/rivto-page/src/adapter/types.ts), [block editor and registrations](packages/rivto-page/README.md), [layout primitives](packages/rivto-page/src/presentation/components/block-layout/README.md), [drop contracts](packages/rivto-page/src/editor/drag-and-drop/types.ts), [block handle](packages/react-rivto-editor/src/extensions/built-ins/block-handle/extension.ts) and [trailing block](packages/react-rivto-editor/src/extensions/built-ins/page/trailing-block/types.ts).

### Block drop geometry and CSS

A pointer near a block edge can choose an insertion boundary. Moving into the block’s own content can choose an inside destination. The layout declares which regions exist, the block behavior determines which moves are allowed, and the feedback stylesheet paints the accepted target. Page outlines and block cards inside the Edgeless viewport share the React host’s geometry values. [Drop contracts](packages/rivto-page/src/editor/drag-and-drop/types.ts) · [Host surface CSS](packages/react-rivto-editor/src/surfaces/page/page-surface.css)

| Term or setting | Value and effect |
| --- | --- |
| **Edge target size** · `--rivto-drop-target-size` | How far the hit strip reaches **inward** from a registered edge, measured in local CSS pixels before viewport scaling. Standalone Page falls back to `12px`. The React host sets `9px` on both surfaces. A child layout’s `targetSize` overrides the inherited value for its subtree, and an explicit edge-region `size` takes precedence. Page caps the strip to preserve the center of the block’s own content or row. [Edge geometry](packages/rivto-page/src/editor/drag-and-drop/block-drop-region-geometry.ts) · [BlockChildren](packages/rivto-page/src/presentation/components/block-layout/block-children.tsx) |
| **Drop gutter** · `dropGutterSize` | How far a placement extends **outward** into free space beside a mounted item when gap targeting is enabled. A number is a distance in local CSS pixels, `0` disables the continuation, and the default `"row"` uses the available cross-axis extent. Changing this value adds no layout padding. [Layout geometry](packages/rivto-page/src/editor/drag-and-drop/block-drop-layout-geometry.ts) |
| **Depth band** · `--rivto-block-indent`, `--rivto-block-drop-child-offset` | In an outline gap offering multiple depths, the host spaces levels by `24px` and adds `12px` to the distance needed to choose the child. For a simple sibling/child gap with no in-flow controls, that puts the child threshold at `36px` from the logical start. Setting the child offset to zero moves it to `24px`. [Depth calculation](packages/rivto-page/src/editor/drag-and-drop/block-drop-region-geometry.ts) · [Host values](packages/react-rivto-editor/src/surfaces/page/page-surface.css) |
| **Insertion line inset** · `--rivto-block-drop-line-inset` | The host starts a horizontal indicator `12px` farther in at the selected depth. This moves the painted line independently of the pointer threshold. [Host surface CSS](packages/react-rivto-editor/src/surfaces/page/page-surface.css) |
| **Boundary mode** · `dropBoundaries` | For matching sibling edges, `merged` shows one line at their midpoint. `separate` shows the nearer edge. Layouts inherit the view setting, which defaults to `merged`. [Block editor](packages/rivto-page/src/presentation/components/block-editor/block-editor.tsx) · [Drop contracts](packages/rivto-page/src/editor/drag-and-drop/types.ts) |
| **Drop placement** · `outline` and `siblings` | Outline placement offers eligible nesting depths. Sibling placement keeps a boundary drop in the same child list. The owner’s registered `childDropPlacement` takes precedence over the layout prop. An explicitly declared inside target remains available subject to acceptance. [BlockChildren](packages/rivto-page/src/presentation/components/block-layout/block-children.tsx) |
| **Background and empty targets** · `dropBackground`, `emptyDropTarget`, `dropEndGaps` | A layout can accept an append on unoccupied background or retain a target when it has no children. In a linear list, setting `dropEndGaps={false}` keeps the near-edge strips while leaving farther space before the first or after the last item available for background drops. [Layout declarations](packages/rivto-page/src/editor/drag-and-drop/types.ts) |
| **Drop feedback** · `--rivto-drop-indicator-thickness`, `--rivto-drop-indicator-color`, `--rivto-drop-indicator-radius`, `--rivto-drop-inside-background` | The React drag extension paints a `2px` accent line or inside border, uses the theme radius on inside targets, and tints the background with 4% indicator color. Standalone Page’s respective fallbacks are `4px`, system `Highlight`, `0px` and an 8% Highlight tint. Changing thickness changes the visible mark while preserving the hit strip. [React drag theme](packages/react-rivto-editor/src/extensions/block-drag/block-drag.css) · [Page feedback CSS](packages/rivto-page/src/presentation/drag-and-drop/block-drag.css) |
| **Drop neighbor** · `data-block-drop-neighbor` | A rendered block bordering the accepted insertion line, or the receiving parent for an indented append. During a drag, the handle stylesheet reveals its handle and gives an unselected neighbor a `1px` dashed outline. [Feedback markers](packages/rivto-page/src/editor/drag-and-drop/block-drop-feedback.ts) · [Block handle CSS](packages/react-rivto-editor/src/components/block-handle/block-handle.css) |

### Container drop settings

The shared `--rivto-container-padding` defaults to `16px` and creates real space around child areas. Several layouts also set `targetSize={16}`. These values can be tuned independently: padding changes the measured layout, while target size changes how much of an existing edge accepts a drop. [Container styling](packages/react-rivto-editor/docs/styling.md) · [Theme tokens](packages/react-rivto-editor/src/styles/tokens.css)

| Container | Where a drop lands |
| --- | --- |
| **Bento** | Tiles have a `16px` inward edge strip and a `32px` outward gutter. Near a tile, edges and physical seams offer tile insertion. Farther out, unoccupied grid background appends to the board. The board behavior keeps direct tile boundaries at sibling depth. [Grid layout](packages/react-rivto-editor/src/extensions/containers/bento/bento-layout.tsx) · [Board behavior](packages/react-rivto-editor/src/extensions/containers/bento/bento-behavior.ts) · [Tile CSS](packages/react-rivto-editor/src/extensions/containers/bento/bento.css) |
| **Kanban** | Board columns use horizontal sibling boundaries. Within a column, cards have `16px` edges and sibling-only boundary drops. With `dropEndGaps={false}`, space well beyond the last card can append to the column through its background. Empty columns also accept drops. [Layouts](packages/react-rivto-editor/src/extensions/containers/kanban/kanban-layout.tsx) · [Column behavior](packages/react-rivto-editor/src/extensions/containers/kanban/kanban-behavior.ts) · [Kanban CSS](packages/react-rivto-editor/src/extensions/containers/kanban/kanban.css) |
| **TODO storage** | Direct children use a vertical outline with `16px` edges. The header is an explicit inside target, and the child area accepts background and empty drops. The empty field sits inside the measured child area. [Storage layout](packages/react-rivto-editor/src/extensions/todo-item/todo-storage.tsx) · [Empty-field CSS](packages/react-rivto-editor/src/extensions/todo-item/todo-item.css) |
| **Columns** | The outer row places columns at horizontal sibling boundaries. Within each column, children use vertical outline placement. An empty or collapsed column exposes its header as an inside target. The layout inherits its edge size. [Column layouts](packages/react-rivto-editor/src/extensions/containers/columns/columns-layout.tsx) · [Divider and spacing CSS](packages/react-rivto-editor/src/extensions/containers/columns/columns.css) |
| **Table** | Rows use vertical sibling boundaries and cells are arranged horizontally. Both child layouts retain empty targets and inherit their edge size. The table accepts rows and each row accepts cells. [Table layout](packages/react-rivto-editor/src/extensions/containers/table/table.tsx) · [Hierarchy rules](packages/react-rivto-editor/src/extensions/containers/table/table-behavior.ts) · [Empty-table CSS](packages/react-rivto-editor/src/extensions/containers/table/table.css) |

## Containers and tasks

| Term | Meaning in Rivto |
| --- | --- |
| **Container block** | A block type whose layout and structural behavior govern its children. Its children still participate in the document’s block hierarchy. |
| **Columns** | A container that arranges column blocks side by side. Each column holds its own child blocks. |
| **Kanban board** | A block container with columns whose children appear as cards. Moving a card changes its place in the block tree. |
| **Bento** | A block container that displays its children as tiles. A tile’s size affects its placement in the grid. |
| **Table** | A container whose structural children are rows, each containing cells. A cell can contain writing blocks, and pressing Enter in a cell inserts a writing child. |
| **TODO item** | A task block with a workflow status of `todo`, `doing` or `done`, plus a description, timestamps, priority and project. |
| **TODO storage** | A container that can filter and order its direct children. Search and filtering belong to the mounted view, while ordering preferences and child positions are collaborative. |

Sources include [Columns](packages/react-rivto-editor/src/extensions/containers/columns/columns.tsx), [Kanban](packages/react-rivto-editor/src/extensions/containers/kanban/kanban.tsx), [Bento](packages/react-rivto-editor/src/extensions/containers/bento/bento-layout.tsx), [table behavior](packages/react-rivto-editor/src/extensions/containers/table/table-behavior.ts), [TODO item](packages/react-rivto-editor/src/extensions/todo-item/todo-item-model.ts) and [TODO storage](packages/react-rivto-editor/src/extensions/todo-item/todo-storage.tsx).

## Edgeless canvas and visual elements

| Term | Meaning in Rivto |
| --- | --- |
| **Canvas projection** | The host’s geometry for each canvas element, keyed by stable ID. The canvas uses this projection for rendering, hit queries and transforms while the host owns the content. |
| **Block element** | A persisted element of type `block` that displays a range of document root blocks as one canvas card. |
| **Card range** | The inclusive first and last root block IDs displayed by a block element. A new root inserted between them appears in the card automatically. |
| **Camera** | The viewport translation in CSS pixels and the positive world-to-screen zoom scale. |
| **Painted bounds** | The axis-aligned world extent occupied by an element, including features such as labels outside its frame. The rotated frame supplies the default bounds. |
| **Stacking order** | The paint order specified by an element’s `zIndex`. The standalone canvas preserves insertion order for ties. |
| **Viewport virtualization** | Mounting renderers for visible elements plus a margin while retaining the complete geometry projection for queries. |
| **Pin** | A temporary request to keep specified canvas elements mounted, for example while an element has DOM focus. |
| **Marquee selection** | Selection by dragging a rectangle over selectable canvas elements. |
| **Transform preview** | Temporary geometry shown during a move, resize or rotation gesture. Cancelling the gesture discards the preview. |
| **Transform commit** | The final batch of geometry changes delivered to the host when a gesture changes the selection’s geometry. The host applies accepted changes to its source and projection. |
| **Snapping** | Alignment of a moving or resizing selection to the grid or to guides derived from other elements. |
| **Tool session** | The view’s active canvas tool and its activation lifecycle. Resetting the session discards pending previews and restores the registered fallback when available. |
| **Visual group** | A persisted logical group whose members are first-class elements in the element hierarchy. |
| **Sticker** | A styled, editable sticky note on the canvas. |
| **Drawing** | A freehand stroke with points relative to its frame, an associated brush and optional pressure on each point. |
| **Shape** | A rectangle or ellipse with configurable fill, stroke and an optional text label. |
| **Text visual** | A canvas text element with its own typography and alignment, independent of document block content. |
| **Connector** | A visual path between source and target endpoints. Its route can be straight, orthogonal or curved. |
| **Connector endpoint** | One end of a visual connector. It can attach to an element at an anchor and retains an absolute position for use if that element disappears. |

Sources include the [canvas geometry contracts](packages/rivto-edgeless/src/types/canvas.ts), [canvas gestures and visibility](packages/rivto-edgeless/README.md), [tool session](packages/rivto-edgeless/src/types/tool-session.ts), [block element boundaries](packages/react-rivto-editor/src/elements/types.ts), [block element projection](packages/react-rivto-editor/src/elements/block-element-projection.ts) and [visual element types](packages/react-rivto-editor/src/elements/visuals/types.ts).

## Attachments

| Term | Meaning in Rivto |
| --- | --- |
| **Attachment reference** | The URI and metadata by which a file or image can be resolved. The binary provider handles the underlying bytes. |
| **Binary provider** | The host’s attachment storage boundary. It writes bytes to obtain a durable URI and reads bytes for URIs it recognizes. |
| **Local file bridge** | An adapter for host filesystem callbacks in the attachment pipeline. |
| **File open handler** | A registered action for opening an attachment reference. A matching handler takes precedence over the selected default handler. |

Sources include the [attachment contracts](packages/react-rivto-editor/src/attachments/types.ts) and [file pipeline](packages/react-rivto-editor/src/attachments/README.md).

## Keyboard input and editor events

| Term | Meaning in Rivto |
| --- | --- |
| **Keyboard action** | A registered operation with a stable semantic ID. Users can change its shortcut while preserving the operation’s identity. |
| **Effective keymap** | The shortcut assignments in effect after overrides are applied. An empty override disables the action’s shortcuts. |
| **Orphan override** | A keymap override whose semantic action ID has no current registration. It remains visible in the keyboard inventory. |
| **Keyboard transport** | The host boundary that delivers native input to the keyboard runtime and handles native default prevention for claimed input. |
| **Held keys** | The currently held ordinary keys and modifier flags. A held-key binding captures a gesture’s effective shortcuts and checks them against live physical state. |
| **Event channel** | One named event in an owner’s listener collection. Emission calls the subscribers captured at its start, so subscription changes take effect on later emissions. |

Sources include the [keyboard runtime guide](packages/rivto-keyboard/README.md), [held-key bindings](packages/rivto-keyboard/src/held-keys.ts) and [shared listener collection](packages/rivto-utils/src/listeners/listeners.ts).

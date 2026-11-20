# Interaction paths for blocks, containers and elements

These are navigation pointers and current contracts, not a substitute for reading
the affected code. A container is a block with a child layout; a canvas element
is a separate persisted entity. A block card can display a range of blocks on
the canvas, so a feature may need both paths.

## Selection and editing

- `packages/rivto-editor-core/src/managers/selection-manager/` owns the local,
  non-persisted selection value and deletion/resolution. It combines block ranges,
  element IDs and optional plugin data. Block offsets are UTF-16 boundaries;
  `end: -1` follows the current end. Distinguish caret, text ranges and structural
  selection: copying or deleting one is not equivalent to the others.
- `packages/react-rivto-editor/src/managers/selection/` bridges native DOM
  selection per panel to shared core selection. Panel commands are scoped to the
  active occurrence; visual block coverage can be read across panels. Scheduled
  restoration is invalidated by newer selection changes. Read the actual scope and
  focus scheduling before adding an editable, control or asynchronous update.
- Page selection and keyboard dispatch live in `src/surfaces/page/page-selection*`
  and `src/extensions/built-ins/{selection,page/navigation}/`. Edgeless selection
  and mixed canvas items use `src/extensions/edgeless/edgeless-selection*` and
  `src/extensions/built-ins/selection/edgeless-runtime.ts`. Preserve native text
  selection and controls as well as structural selection; test the actual surface.
- `use-block-editing.ts` owns editable DOM reconciliation and composition;
  `use-block-selection-anchor.ts` anchors a non-text body. A container's hidden,
  collapsed or filtered children must agree with traversal and interaction policy,
  not merely be visually hidden. Inspect `BlockBehavior.childrenVisible` and the
  layout's visibility mechanism for the intended semantics.

## Clipboard and identity

- Core `src/managers/clipboard-manager/` copies selected top-level subtrees into
  a versioned bundle. Structural copies preserve subtree content; text copies slice
  selected ranges, and a collapsed caret does not copy text. Paste validates the
  bundle and dispatches strategies within a history batch. Placement, text merge
  and plain-text newline behavior affect the result; inspect the strategy used.
- React's `src/extensions/built-ins/clipboard/clipboard.ts` synchronizes DOM
  selection before browser actions and bridges Rivto MIME, HTML, Markdown and plain
  text. Native structured data, the HTML envelope and fallback parsing have distinct
  paths; plain-text paste has its own behavior. Check Page and Edgeless where the
  feature can appear, including external HTML/text and independent native inputs.
- `src/managers/clipboard/types.ts` defines optional per-type `copy`, `paste`,
  `format`, `parseHTML` and `parseText` hooks; element converters may also declare
  `getReferencedBlockIds`. Register `clipboard` with the block or element type
  when needed. Converters operate on detached data and must not write the document.
  Clipboard owns identities, hierarchy and element geometry. Paste converters get
  preallocated block/element ID maps before insertion and validation: remap custom
  references explicitly, including references outside the copied set. For examples,
  inspect `src/elements/clipboard-converters.ts`. Declaring referenced blocks also
  makes them part of canvas cut; do not declare ordinary external links as owned.
- Test copy, cut, paste and duplicate as applicable: partial text versus whole
  structure, nested and mixed selections, same/cross-document IDs, external formats,
  destination placement, and undo/redo. Verify cut does not delete on preparation
  failure and that a pasted structure retains intended data and ordering.

## Hierarchy, behavior and lifecycle

- `document-model` owns persisted block hierarchy and element records; core block
  and element managers own operations and history. React type registrations combine
  definitions, rendering and optional interaction contributions. Snapshots are
  detached; read current values at command time and use managers for writes.
- Inspect `src/block-behaviors/types.ts` and registry dispatch for keyboard split,
  merge, indent/outdent, structural delete, visibility and move permission. A
  behavior can handle, reject or defer; move checks are separate from drop geometry.
  Parent child-enter/exit preparation applies on direct creation/import/move, not
  same-parent reorder or undo/redo. Verify deletion and movement of populated,
  empty and nested containers without losing descendants or changing IDs by accident.
- Edgeless element registration, renderer host, transform preview and creation tool
  are described in `rivto-elements`; its clipboard converter must also account for
  custom references and owned block dependencies. Registration disposers belong to
  the extension; panel/surface state and DOM listeners must be released by their
  owners. Undo, snapshots, reload and multiple panels expose different boundaries.

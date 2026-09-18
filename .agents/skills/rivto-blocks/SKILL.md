---
name: rivto-blocks
description: Implement or review native Rivto block types and renderers, including text, contentless controls, sizing and spacing, selection anchors, drag readiness, registration, properties, and behavior inside containers. Use for ordinary or generic blocks in packages/react-rivto-editor and host extensions; use rivto-containers when the new block itself owns a child layout.
---

# Rivto Blocks

Build every block on Rivto's shared model, `BlockTree` shell, editing hooks, and
optional drag extension. A renderer owns only the block's content. It must not
recreate the outer block, row, selection chrome, drag handle, child tree, or
drop target.

## Start from the current contract

Patterns can evolve. Before editing, trace the requested type and every caller
with `rg`. Read the owners relevant to the change:

- `packages/react-rivto-editor/src/blocks/block-tree.tsx` — stable shell,
  renderer lookup, slots, collapse visibility, and recursive children.
- `packages/react-rivto-editor/src/blocks/block-view.tsx` — `data-block-id`,
  `data-block-type`, selection state, and measured outer boundary.
- `packages/react-rivto-editor/src/hooks/blocks/use-block-editing.ts` — text
  synchronization, structural selection anchors, property access, and nested
  interactive-control opt-out.
- `packages/react-rivto-editor/src/managers/blocks/block-types.ts` and
  `packages/rivto-editor-core/src/managers/block-registry-manager/types.ts` —
  registration, defaults, schemas, parent restrictions, and containment metadata.
- `packages/react-rivto-editor/src/extensions/block-drag/` — shared handles,
  hit testing, drop geometry, and placement. Do not build another drag path.
- `packages/react-rivto-editor/styles.css` — shared block geometry.

Use the closest complete example:

| Block shape | Example |
| --- | --- |
| Normal editable text | `src/blocks/markdown.tsx` and default-writing registration |
| Contentless visual leaf | `src/extensions/built-ins/separator/separator-block.tsx` |
| Contentless interactive leaf | `demo/src/blocks/custom-blocks.tsx` Counter |
| Text plus native control | `demo/src/blocks/custom-blocks.tsx` Slider |
| Block that owns child layout | Load the `rivto-containers` skill |

## Preserve the shared DOM shell

`BlockTree` renders this structure for every type:

```text
.page-block[data-block-id][data-block-type]
├── .page-block-row
│   ├── shared slots and controls
│   └── .rivto-block-content-flow
│       └── renderer output
└── .page-block-children
    └── recursively rendered child .page-block nodes
```

Return only renderer output. Never render `BlockView`, `.page-block`,
`.page-block-row`, `.page-block-children`, a drag handle, or `block.children`.
Never put child IDs in React state. The shared shell is what gives every block
the same selection, collapse, drag, slot, nesting, and surface behavior.

## Use the canonical geometry

The shared stylesheet currently defines the editor-wide measurements:

- `.page-block`: `margin: 4px 0; padding: 2px 8px`.
- `.page-block-row`: flex row, `align-items: flex-start`, `width: 100%`.
- `.rivto-block-content-flow`: `min-width: 0; flex: 1 1 auto`.
- `--rivto-default-block-height`: `1.5em`; ordinary text also uses
  `line-height: 1.5`.
- `.page-block-children`: `margin-left: 24px` for ordinary outline nesting.
- The page drag handle owns a `28px × 24px` gutter beside the first row.

Treat those as shell facts, not values to repeat in a renderer. For an ordinary
block:

- Add no outer margin. Sibling rhythm belongs to `.page-block`.
- Add no outer padding merely to align with other blocks. The shell already owns
  `2px 8px`; renderer padding is internal decoration only.
- Use `min-height: var(--rivto-default-block-height)` for an ordinary empty
  editable or structural region. Use a larger minimum only when the block's
  actual UI needs a larger hit target.
- Make a structural selection region `width: 100%` so blank space in the row can
  select the block.
- Add `min-width: 0; max-width: 100%` to renderer layout roots that contain
  flex/grid children or long content. Add `box-sizing: border-box` whenever the
  same element has a width plus border or padding.
- Prefer `gap` for internal layout. Avoid vertical margins on the renderer root,
  because row rectangles drive selection and drop placement.
- Do not use viewport widths, page-relative offsets, or a fixed width in an
  ordinary renderer. It must shrink inside columns, cells, tiles, and edgeless
  cards.
- Keep overflow on the component that owns it. Do not clip the shared row or
  outer `.page-block`; handles, indicators, and selection outlines extend there.

Use this baseline for a full-row non-text selection region; omit properties
already supplied by a more specific shared class:

```css
.my-block-region {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: var(--rivto-default-block-height);
  box-sizing: border-box;
}
```

Do not add `margin` or outer `padding` to that baseline. This is the generic
geometry for ordinary blocks; specialize shell geometry only when the block is
a demonstrated layout container.

There is intentionally no universal decorative padding for custom controls.
Use the native control size or the minimum internal padding its design requires;
changing the shell's margin or padding would make custom blocks behave
differently from built-ins.

## Choose one editing owner

### Editable text

Prefer `MarkdownContent` when ordinary Rivto text behavior is sufficient. For a
custom plain-text renderer, call `useBlockEditing(blockId)` and spread
`editing.attributes` on exactly one contenteditable `<div>`. Add the
`page-block-content` class to inherit the canonical minimum height, line height,
outline, and whitespace rules. Do not render `block.content` as React children;
the hook owns that DOM text node.

Do not replace the returned `ref`, `onInput`, `onCompositionStart`, or
`onCompositionEnd`. Use `editing.preventTextEditingAttributes` on a nested rich
control only when that control must own its pointer/text gesture.

### Contentless or control-only blocks

Call `useBlockEditing<Props>(blockId, { textEdit: false })` and spread
`editing.attributes` on the one region representing the whole block:

```tsx
const CONTROL_REGION_CLASS = "my-control-region";

function ControlBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<ControlProps>(blockId, { textEdit: false });
  if (!editing.block) return null;
  return (
    <div {...editing.attributes} className={CONTROL_REGION_CLASS}>
      <button
        type="button"
        onClick={(event) => {
          if (event.defaultPrevented) return;
          editing.setProp("value", nextValue(editing.getProp("value")));
        }}
      >
        Action
      </button>
    </div>
  );
}
```

Keep persisted `content` as `""`. The structural anchor lets pointer gestures,
range selection, clipboard, deletion, and drag identify a block that has no text.
Do not add `contentEditable` or fake hidden text. Interactive descendants must
ignore a click whose `event.defaultPrevented` is true because a completed
selection drag claims the browser's follow-up click.

Use semantic native elements first. Buttons need `type="button"`, accessible
names, disabled state when applicable, and a visible `:focus-visible` style.
Give custom keyboard-operable non-button regions `role`, `tabIndex`, and
Enter/Space handling.

### Text plus controls

Give text and controls separate owners. Let `MarkdownContent` or one element
spread the text-editing attributes, while sibling native controls keep their
normal handlers. Do not wrap a nested text editor in a structural selection
anchor and do not spread a second editing attribute set.

## Define and register the block

- Export one stable type constant and reuse it in definitions, formatters,
  commands, tests, and selectors.
- Register a human-readable `title` for UI and accessibility.
- Put creation defaults in `defaultProps`; use a factory only when each creation
  needs fresh values.
- Add a Zod `propSchema` for meaningful native props. Update props through
  `editing.setProp`, `editing.setProps`, or `reactEditor.blocks`; never mutate
  the detached reactive snapshot.
- Read current values again inside event handlers with `getProp` rather than
  using a stale render capture.
- Use `allowedParents` only for a real persisted placement invariant. Include
  `null` only when root placement is valid.
- Register definition, renderer, optional view, and simple slash conversion
  together with `reactEditor.blocks.register`. Use `blockExtension(...)` for a
  single ordinary block; use a dedicated `ReactEditorExtension` when the feature
  also registers formatters, slots, wrappers, commands, or mounted styles.
- Collect explicit disposers and run them in reverse order. Runtime managers own
  cleanup for registrations that do not return or require a retained disposer.
- Export public block types and factories from the package entry points only when
  consumers need them.

Use named constants for every HTML class referenced from JSX, selectors, or
`classList`. New extension-specific CSS should be mounted by that extension;
change global `styles.css` only when the rule truly belongs to every block.
Follow the repository JSDoc requirements for every source file, function, and
method.

## Keep behavior in the owning layer

- Use `reactEditor.blocks` or `reactEditor.editor.blocks` for mutations. React
  views must not call document-model internals or import Yjs.
- Wrap multi-step user actions in `reactEditor.batchUpdates` so undo observes
  one action.
- Use `reactEditor.createDefaultBlock()` instead of hardcoding `paragraph`.
- Persist only durable state. Pointer resize or slider motion may use local DOM
  or React preview state, then commit one validated property update at the end.
- Use registered block slots for perimeter controls and block wrappers for
  subtree decoration. Do not add absolute controls to the renderer merely to
  reach outside its content region.
- Add a clipboard formatter when a contentless or custom block needs meaningful
  plain-text, Markdown, or HTML export. Structured Rivto copy already preserves
  the native block record.
- A simple slash “Turn into” registration changes the existing block type and
  keeps its ID. Seeded subtree conversion belongs to the container workflow.

## Make ordinary blocks container-ready

An ordinary leaf requires no container-specific drag code. It becomes safe in
containers by preserving the shared shell and by remaining width-flexible:

- render no descendants;
- keep the renderer root shrinkable with `min-width: 0` where needed;
- avoid page-width assumptions and global ancestor-dependent positioning;
- keep the structural selection region aligned with the visible body;
- let the parent container style its direct child `.page-block` shell;
- let shared drag code measure the row and outer block; do not register another
  draggable or droppable region.

If the new block itself owns children, load `rivto-containers` and follow its
additional rules. In particular: children remain native `EditorBlock.children`,
`BlockTree` alone renders them, `ContainerBlockView` declares drop behavior,
`dropAxis` matches direct-child layout, `allowedParents` protects stored shape,
and containment metadata (`childOutline`, `outlineFloor`) protects outline
interactions. Reset the shared `24px` child margin only on layout roots or
structural shells whose children intentionally align to the container edge.

Do not seed blank paragraph children for height. An empty container or lane gets
an empty-state `min-height`, scoped so populated containers wrap their real
content. Preserve authored descendants before deleting a structural shell.

## Verify the contract

Add the narrowest regression check that would fail if the new behavior broke:

- definition defaults, prop validation, parent restrictions, or factories: a
  colocated core/React Jest test;
- text synchronization or structural selection anchoring: a focused React test;
- compound operations: assert result and one-step undo;
- pointer selection, real drag/drop, layout geometry, or page/edgeless parity:
  focused Playwright coverage with `pageDragExtension()` installed explicitly.

For contentless blocks, verify the selection anchor exists on the full renderer
region and a native control still activates on an unclaimed click. For blocks
used in containers, verify narrow width, long content, selection, and dragging
inside at least the closest layout example. Run focused tests first, then React
type checking, lint for touched files, affected build/tests, and
`git diff --check`.

## Reject these shortcuts

- Recreating the shared block shell or recursive tree in a renderer.
- Adding renderer-root margins or duplicating `.page-block` padding.
- Using local selection state, custom drag handles, or a second DnD system.
- Using hidden editable text to make a contentless block selectable.
- Spreading editing attributes on multiple elements.
- Mutating snapshots or storing presentation size outside validated block props.
- Hardcoding full-page width, `paragraph`, or container-specific ancestor types
  into an ordinary leaf.
- Making global CSS changes for one block type.
- Adding abstractions for a single renderer when `blockExtension` and the
  existing hooks already cover it.

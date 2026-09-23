# Block authoring and interaction contract

This document defines the target contract for user-authored Rivto blocks. It is
a design document, not the current API reference. The goal is to make custom
components predictable in page and edgeless surfaces without adding their tag
names, classes, or block types to shared selection and drag code.

## The boundary

A block feature has four owners:

| Concern | Owner |
| --- | --- |
| Persisted type, content, props, children, and parent restrictions | Core block definition |
| Content markup and local controls | User renderer |
| Selection, native range repair, clipboard, and structural commands | Shared editor runtime |
| Tree shell, descendants, slots, drag handle, and drop feedback | `BlockTree` and extensions |

A renderer returns only its content. It must not recreate `BlockView`, render
its children, install another block-reordering system, or store document state
in React state.

The shared shell remains:

```text
.page-block[data-block-id][data-block-type]
├── .page-block-row
│   ├── extension slots, including the optional page drag handle
│   └── .rivto-block-content-flow
│       └── user renderer
└── .page-block-children
    └── BlockTree renders persisted children
```

This shell is why the same renderer works inside the page, an edgeless card, a
lane, a cell, or a tile.

## Why the current interaction code is complicated

Some complexity is inherent:

- every text block is a separate `contenteditable`, while a browser selection
  may cross several of them;
- portable selection must distinguish a caret, partial text, and complete
  structural block coverage;
- contentless blocks have no native caret position;
- Chromium and Firefox may collapse or reverse ranges between editing hosts;
- pointer selection, control activation, and drag-and-drop all begin with the
  same `pointerdown` event;
- the page and edgeless surfaces share block content but add different outer
  interactions;
- containers add drop axes and hierarchy rules without owning a second tree.

That complexity belongs in the shared engine. The avoidable complexity comes
from making the engine infer a component's intent from DOM details such as
`button`, `input`, a CSS class, or a particular built-in block type.

For example, a button can mean any of these:

- a normal action that must keep its complete pointer gesture;
- a sortable item whose drag belongs to a nested dnd-kit context;
- a compact Counter control where a click increments but a drag selects the
  containing block;
- the editor-owned page drag handle that reorders blocks.

A global `target.matches("button")` rule cannot distinguish them. Expanding an
exclusion selector has the same problem in reverse. It also behaves differently
when a button contains an icon or another element because the event target may
not be the button itself.

## Target model: components declare pointer ownership

The renderer should declare the role of each interaction region. The shared
runtime should execute that role. It should not infer the role from the HTML tag.

Use four roles:

| Role | Meaning |
| --- | --- |
| `text` | Native caret and text-range gestures owned by one persisted block content field |
| `structural` | Empty or non-interactive renderer space may start whole-block selection |
| `control` | The component owns the full gesture; block selection does not start here |
| `selection-activator` | Click remains native, but movement beyond the shared threshold becomes structural selection |

The nearest declared role to the event target wins. This gives nested
components normal DOM scoping: a `control` inside a `structural` region owns its
gesture, while a deliberate `selection-activator` inside that control can opt
back into block selection.

Conceptually, `useBlockEditing` should expose attribute bags like these:

```ts
const editing = useBlockEditing<Props>(blockId, { textEdit: false });

editing.attributes;                    // structural owner for this block
editing.controlAttributes;             // nested component owns the gesture
editing.selectionActivatorAttributes;  // click or structural drag, by threshold
```

Text mode continues to return the contenteditable ref, input/composition
handlers, and text markers through `editing.attributes`.

The names above are proposed. The important contract is the explicit role and
nearest-owner resolution, not a particular data-attribute spelling.

### Required precedence

At `pointerdown`, the shared selection engine should:

1. find the nearest block selection/editing root;
2. find the nearest declared interaction role inside that root;
3. do nothing for `control`;
4. initialize native text selection for `text`;
5. initialize structural selection for `structural`;
6. arm, but not immediately claim, `selection-activator`;
7. let an armed activator click normally when movement stays below threshold;
8. claim the gesture, publish structural selection, and suppress the synthetic
   click after movement crosses the threshold.

The engine should not contain selectors for `button`, `input`, TODO storage,
Counter, or any user class. Built-in and user components declare the same roles.

## This is not block reordering

Structural selection dragging and page block reordering are different actions:

- `selection-activator` grows or creates portable structural selection;
- `pageDragExtension()` supplies its own accessible drag-handle slot and moves
  selected block roots through dnd-kit.

A renderer must not attach page-reordering listeners to its content. Hosts can
enable or omit `pageDragExtension()` without changing renderer code.

## Authoring recipes

### Editable text

Use `MarkdownContent` when its behavior is sufficient. Otherwise spread text
editing attributes on exactly one contenteditable element.

```tsx
function Note({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  if (!editing.block) return null;
  return <div {...editing.attributes} className={NOTE_CONTENT_CLASS} />;
}
```

Do not render `editing.block.content` as children of that element. The hook owns
the text node and synchronizes local, remote, and history updates.

### Contentless control with selectable empty space

The outer region is structural. The button keeps click behavior but explicitly
permits a drag to become structural selection.

```tsx
function Counter({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<CounterProps>(blockId, { textEdit: false });
  if (!editing.block) return null;

  return (
    <div {...editing.attributes} className={COUNTER_REGION_CLASS}>
      <button
        {...editing.selectionActivatorAttributes}
        type="button"
        className={COUNTER_BUTTON_CLASS}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          editing.setProp("count", (editing.getProp("count") ?? 0) + 1);
        }}
      >
        Count: {editing.getProp("count") ?? 0}
      </button>
    </div>
  );
}
```

The `defaultPrevented` check is required because the shared engine claims the
follow-up click only after a completed structural drag.

### Text with a native control

Text and the control have separate owners. The slider never starts block
selection.

```tsx
function Slider({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<SliderProps>(blockId);
  if (!editing.block) return null;

  return (
    <div className={SLIDER_CLASS}>
      <MarkdownContent blockId={blockId} />
      <input
        {...editing.controlAttributes}
        type="range"
        value={editing.getProp("value") ?? 50}
        onChange={(event) => editing.setProp("value", Number(event.currentTarget.value))}
      />
    </div>
  );
}
```

Do not add a second selection root around `MarkdownContent`.

### Nested sortable or rich control

Mark the boundary once. Everything inside belongs to that component unless a
descendant explicitly declares another role.

```tsx
<div {...editing.controlAttributes} className={TOOLBAR_CLASS}>
  <TodoStatusOrder order={order} onChange={setOrder} />
</div>
```

The shared selection engine does not need to know that the descendants are
buttons, sortable rows, menus, checkboxes, or a third-party widget.

### Container block

A container still renders only its own content region. `BlockTree` renders its
persisted children.

```tsx
const editing = useBlockEditing(blockId, { textEdit: false });
return <div {...editing.attributes} className={BOARD_BODY_CLASS} />;
```

Container behavior is declared separately with `ContainerBlockView`:

- `dropAxis` describes direct-child layout;
- `acceptsDropContainer` describes body drops;
- containment metadata describes fixed or free outline behavior;

Do not map `block.children`, create a parallel child store, or register a second
drag system in the renderer.

## Registration contract

A normal block should register its complete public shape together:

```tsx
blockExtension({
  definition: {
    type: COUNTER_BLOCK_TYPE,
    title: "Counter",
    defaultProps: { count: 0 },
    propSchema: counterPropsSchema,
  },
  render: Counter,
  slashCommand: { title: "Counter" },
});
```

Use one stable type constant. Put creation defaults and validation in the core
definition. Read current property values again inside callbacks. Mutate through
`editing.setProp`, `editing.setProps`, or `reactEditor.blocks`; never mutate the
detached render snapshot.

Use a dedicated extension only when the feature also owns formatters, wrappers,
slots, commands, mounted styles, or several related native block types.

## Geometry contract

The shared shell owns ordinary block margin, padding, row layout, children, and
the optional page drag gutter. A renderer should:

- add no outer sibling margin or shell padding;
- remain shrinkable with `min-width: 0` where needed;
- use `width: 100%` for a full-row structural region;
- avoid page-width assumptions;
- keep component overflow on the component that owns it;
- use named constants for every class referenced from JSX or selectors;
- leave descendants to `BlockTree`.

These rules make the same component usable inside narrow columns, table cells,
bento tiles, and edgeless cards.

## What stays shared

Component-owned behavior does not mean every component reimplements editor
mechanics. Components declare policy; the runtime owns consistent execution.

Keep these shared:

- native-to-portable selection conversion;
- cross-contenteditable range repair;
- movement thresholds and synthetic-click suppression;
- modifier semantics;
- clipboard and structural deletion;
- page block reordering and drop geometry;
- hierarchy commands and container views;
- page/edgeless selection parity.

Otherwise every custom renderer would implement subtly different selection,
accessibility, and history behavior.

## Migration plan

1. Add explicit interaction-role attribute bags to `useBlockEditing`.
2. Add focused hook tests for the returned markers.
3. Update built-in controls and demo blocks to declare their roles.
4. Add browser tests for click versus drag on Counter, nested sortable controls,
   editable text, and ordinary native controls.
5. Change the shared selection entry point to resolve the nearest declared role.
6. Remove DOM-tag and component-specific eligibility selectors.
7. Rename `preventTextEditingAttributes` to the broader `controlAttributes`, or
   retain it temporarily as a deprecated alias if a compatibility window is
   desired.
8. Update `use-block-editing.md` after the contract is implemented.

Do not migrate one component at a time by adding more exceptions to shared
selection code. Introduce the role contract, migrate all built-ins, then delete
the heuristics in the same change.

## Required verification

The contract is complete when these behaviors pass in real browser tests:

| Component | Click | Drag |
| --- | --- | --- |
| Editable text | caret/edit | native or cross-block text selection |
| Structural blank space | select block | structural range selection |
| Counter activator | increment | select block without incrementing |
| Slider/input control | native action | native control gesture only |
| TODO status sorter | native activation | sorter reorder only |
| Page drag handle | no content action | reorder selected block roots |
| Empty container control | insert/focus child | component-declared behavior only |

Also verify keyboard activation, `defaultPrevented` handling, page and edgeless
surfaces, narrow container layout, and one-step undo for compound mutations.

## Rejected designs

- Shared selection branches for specific block types or CSS classes.
- Treating every `button` as either a selection handle or a control.
- Asking user components to implement portable selection math.
- Letting renderers recurse through `block.children`.
- A second drag-and-drop system for a custom block tree.
- Hidden editable text for contentless selection.
- Multiple elements spreading the same editing-owner attributes.
- Persisting transient pointer or drag state in block props.

The durable rule is: **components declare interaction ownership; the editor
implements editor semantics once.**

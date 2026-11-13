# Authoring blocks, containers and canvas elements

Import block, container and element authoring APIs from
`@chulane/rivto-react/authoring`. This entry is available in the package build;
the demo also exposes the same entry to dynamically loaded JavaScript modules.
The host installs the editor extensions needed for selection, keyboard, drag,
clipboard and canvas interaction; a block registration alone does not install
those features.

## Contentless block with an action

```tsx
import { BlockSelectionButton, blockExtension, useBlockContent, usePanel } from "@chulane/rivto-react/authoring";

function Counter({ blockId }: { blockId: string }) {
  const { block, operations, selectionProps } = useBlockContent<{ count: number }>(blockId);
  const panel = usePanel();
  if (!block) {
    return null;
  }
  return (
    <div {...selectionProps}>
      <BlockSelectionButton onClick={() => {
        const current = panel.blocks.getBlockNode(blockId);
        if (current) {
          operations.setProp("count", Number(current.props.count) + 1);
        }
      }}>
        Count: {block.props.count}
      </BlockSelectionButton>
    </div>
  );
}
```

`useBlockContent` subscribes to the block's own snapshot and supplies operations
bound to its ID. Spread `selectionProps` on the complete selectable region. A
snapshot is detached; callbacks that calculate a change from current data should
read it again through the panel. `BlockSelectionButton` preserves normal click and
keyboard activation while allowing the shared selection engine to claim drags and
configured modifier gestures. For controls that own their whole gesture, spread
`editorControlProps` instead. Do not add a hidden editable to a contentless block.

Register the renderer with `blockExtension({ definition, render, slashCommand })`.
The definition has a stable persisted type and may supply property defaults and a
schema; optional clipboard, behavior and layout contributions have the same
lifetime as the registration. For extensions with multiple contributions, setup
can register each through the editor's existing managers.

## Editable text

`useBlockEditing(blockId)` returns the block, operations and attributes for one
collaborative plain-text editor. Render those attributes through `BlockText`:

```tsx
const editing = useBlockEditing(blockId);
return <BlockText attributes={editing.attributes} label="Note" />;
```

`BlockText` supplies an accessible textbox role and name. Its `multiline` prop
controls the accessibility announcement and does not restrict input. The hook
owns DOM text and input/composition synchronization: do not provide React
children or replace its handlers without preserving their behavior. The existing
`MarkdownContent` is preferable when formatted Markdown is required. Custom
nested rich editors retain their own input and selection lifecycle.

## Containers

A container is a block with a layout; it does not own a second child tree. Its
renderer returns only its content, while the registered layout composes shared
Page primitives:

```tsx
function AccordionLayout() {
  return <>
    <BlockRow><BlockContent /></BlockRow>
    <BlockBody />
    <BlockChildren emptyDropTarget dropBackground />
  </>;
}
```

Use `blockExtension({ definition, render, layout: AccordionLayout })`. Page owns
block identity, selection chrome and the traversal of each canonical child.
Choose child axis, empty/background targets and placement policies using
`BlockChildren` and the drop primitives; semantic movement restrictions remain
in the block behavior. `listProps.collapsed` is the existing persisted collapse
state. The host's installed collapse behavior reconciles selection and focus when
children become hidden. See the demo accordion for a complete example.

Opaque custom backgrounds must use `var(--rivto-block-selection-fill, <normal
background>)` when they would otherwise cover the selected shell. Verify rendered
selection and restoration, not just a selected data attribute.

## Canvas elements

`elementExtension({ definition, render, creation, properties, behavior, clipboard })`
installs an element and its optional toolbar and editing contributions. A renderer
receives `ElementRenderProps`, including the current element, panel, operations,
selection and preview state. It renders content only; the canvas host owns geometry,
selection and transforms. On a creation preview, `preview` is true and the element
is a detached draft: do not mutate the document or subscribe by its temporary ID.
Use relative sizing so content follows live resize previews.

For controls inside an element, spread `elementControlProps()` on the actual
interactive element. Supply an optional pointer callback when the control also
needs to perform work on pointer down. The helper stops the canvas gesture and
double-click propagation while preserving the control's native click and input.
The renderer remains responsible for guarding document writes during previews.
A property component receives the existing shared preview, commit and cancel
contract; it does not create another history or canvas manager.

See `demo/src/dynamic-extensions/` for independently loaded block, container,
text and element examples, including their registration and styling.

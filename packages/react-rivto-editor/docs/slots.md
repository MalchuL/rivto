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

# Rivto Editor

Rivto models collaborative documents as blocks while supporting both text-level and whole-block interaction.

## Language

**Text-editable block**:
A block whose content supports a text caret and character-range selection.
_Avoid_: Text editing block, editable-text block

**Structural selection anchor**:
The region of a block that explicitly permits a pointer gesture to begin whole-block selection.
_Avoid_: Non-text area, click target

**Whole-block selection**:
A local selection of one or more complete document blocks rather than character ranges within their content.
_Avoid_: Selected as block

**Empty writing block**:
A text-editable block that the host considers to contain no meaningful writing content.
_Avoid_: Blank block, zero-length block

**First-child promotion**:
Replacement of an empty parent by its first child, with the remaining children retained beneath that promoted child in their existing order.
_Avoid_: Flatten children, delete parent subtree

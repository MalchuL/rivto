# Plugin-owned list properties

## Goal

Make `listProps` the generic persisted property bag for page and outline
behavior. This includes collapse state, list markers, checkbox state, and
future extension-defined data.

```ts
type BlockListProps = Record<string, unknown>;

interface Block {
  listProps: BlockListProps;
}

interface BlockInput {
  listProps?: BlockListProps;
}

interface BlockPatch {
  /** Shallowly merged into the stored record. */
  listProps?: BlockListProps;
}
```

`collapsed` is removed from the top level of `Block`, `BlockInput`,
`BlockPatch`, their editor-facing counterparts, storage, clipboard data, and
fixtures. It becomes the flat `listProps.collapsed` key. The `listProps` name
is retained.

## Core responsibilities

Core treats `listProps` as opaque data. It must not interpret `collapsed`,
list types, checkbox state, visibility, numbering, or portable presentation.

Core:

- stores `listProps` as a CRDT map;
- shallowly merges `BlockPatch.listProps`;
- deep-clones list properties at detached-data boundaries;
- rejects values that cannot be represented safely by the CRDT;
- preserves unknown keys losslessly in snapshots, structured clipboard,
  duplication, and cross-document transfer;
- exposes structural document order rather than a concrete notion of visible
  blocks;
- keeps structured subtree copy, cut, and paste operations;
- keeps partial-text structured paste because it is structural/textual rather
  than list-property behavior;
- accepts an already resolved structural paste destination from React.

Portable stored values are JSON-like values supported by the CRDT: `null`,
booleans, strings, finite numbers, arrays, and plain records. Unsupported or
cyclic values are rejected at the store boundary. Extension registrations do
not separately prevalidate their defaults; extension authors own that data,
and invalid data is caught when it reaches storage.

Concrete core list exports, defaults, validation, numbering, clipboard
formatting, and `BlockDefinition.toRawText` are removed or moved to React.
Canonical document block types are re-exported for editor APIs instead of
maintaining duplicate `EditorBlock*` interfaces.

## Core mutation semantics

`listProps` patches use a shallow merge. Nested values are replacement leaves.

The focused block manager adds deletion operations rather than using `null` or
`undefined` as sentinels:

```ts
deleteListProps(id: string, keys: readonly string[]): boolean;
deleteListPropsBatch(updates: readonly {
  id: string;
  keys: readonly string[];
}[]): void;
```

Deleting an absent key is a no-op. Single-block operations return `false` for
a missing block and `true` when applied. Core batch operations remain strict
and atomic: a missing target or invalid mutation aborts the batch without
writes.

## React property ownership

React extensions define the concrete meaning of the flat property record.
Property registration stays in `reactEditor.blocks` and is deliberately
narrow: registered defaults plus optional semantic validation of the complete
candidate record.

```ts
reactEditor.blocks.registerListProps({
  id: "outline.collapse",
  defaults: { collapsed: false },
  validate: candidate => typeof candidate.collapsed === "boolean",
});
```

Registrations compose in extension order:

- later defaults override earlier defaults for the same key;
- every active validator must accept a candidate;
- validators accept or reject and do not transform values;
- extensions may read and update keys defined by other extensions;
- malformed extension registrations still throw during setup.

`Block.listProps` always exposes the raw persisted record. There is no central
read-time resolved projection. Extensions must use safe local fallbacks when
reading missing or malformed values.

The React block manager exposes insertion, update, batch update, and list-key
deletion operations. It:

- recursively applies active defaults to newly inserted blocks and children;
- validates the complete resulting record for React-owned mutations;
- filters missing or invalid entries from React batch mutations;
- submits the remaining entries to core in one atomic transaction;
- returns one applied/skipped result for every input entry, preserving input
  order and duplicate-ID semantics.

Best-effort behavior belongs to the React facade. Core batches remain strict.

## Built-in extensions and page behavior

The standard preset installs separate built-in behaviors:

- the list extension owns `type` and `checked`, markers, numbering, shortcuts,
  commands, and clipboard formatting;
- the collapse extension owns `collapsed`, collapse controls, child
  visibility, selection repair, keyboard behavior, and collapse-aware paste
  placement.

Without the corresponding extension, raw keys remain stored but have no
behavior. The base page surface renders a plain recursive tree. Extensions add
ordered marker/chrome contributions and child-visibility predicates; all
active visibility predicates must allow the children for them to render.
Existing block wrappers remain available for broader decoration.

Concrete list types, constants, defaults, and numbering helpers move from the
core package to the React built-in list extension and are re-exported there.

## Clipboard

Core clipboard operations produce and consume only the lossless structured
bundle. React owns browser clipboard integration and portable plain-text,
Markdown, and HTML representations.

The React clipboard manager exists independently of the optional DOM clipboard
extension. Extensions can register:

- ordered block formatters that may append to or replace the current plain,
  Markdown, and HTML representations;
- ordered external HTML and plain-text parsers, with the first matching parser
  returning `BlockInput[]` with optional recursive children;
- collapse-aware structural placement behavior before calling core paste.

Structured data bypasses external parsers. It preserves and deep-clones every
unknown `listProps` key. React adds missing registered defaults recursively
without overwriting copied values.

Clipboard error handling stays small. `clipboardExtension` accepts one optional
callback, invoked only when a structured block fails preparation:

```ts
onBlockError?: (
  block: BlockInput,
  error: unknown,
) => BlockInput | null | undefined;
```

A returned block replaces the invalid block. `null`, `undefined`, or an absent
handler skips that block and its subtree. A replacement is checked once; an
invalid replacement is skipped without invoking the callback again. Invalid
children can be removed or replaced while their valid parent and siblings are
retained, and the prepared forest is then pasted atomically by core.

An Error block extension provides a renderer and a ready-made callback that
stores the complete original subtree as portable data and displays its content,
props, original type, list properties, plugin data, and other fields. The
standard preset installs the Error block and wires its callback. Unknown block
types are not errors and continue to use the unknown-block renderer.

## Versions and compatibility

- Document snapshots change from version 5 to version 6.
- Structured clipboard changes from version 3 to version 4.
- There is no migration or backward-compatibility layer.
- Existing loader behavior around version validation is unchanged; this work
  only changes the version literals and data shapes.

## Verification scope

Regression coverage must include:

- CRDT storage, snapshot round trips, deep cloning, and undo;
- shallow patching and explicit deletion;
- strict core batches and best-effort React batches;
- recursive React defaults and composed validators;
- list rendering, numbering, checkbox state, and collapse visibility;
- selection repair, navigation, Enter/Delete behavior, and drag previews;
- structured copy/paste, partial-text merge, external formats and parsers;
- cross-document transfer, unknown keys, invalid-block replacement, and
  Error-block rendering;
- page and edgeless behavior where relevant.

## Decision Q&A

### Data model and ownership

**Q1. What is `listProps` after this change?**

It is the generic persisted property bag for page and outline behavior. It can
contain collapse state, list presentation, checkbox state, and properties
introduced by future extensions.

**Q2. Should `listProps` be renamed now that it has a broader purpose?**

No. The existing name remains part of the public model even though its scope is
broader than list markers alone.

**Q3. Where does `collapsed` live?**

Only at `block.listProps.collapsed`. The old top-level field is removed rather
than retained as an alias.

**Q4. Does core understand any concrete `listProps` keys?**

No. Core stores and transports the record without interpreting collapse, list
types, checkbox values, visibility, or rendering behavior.

**Q5. Who defines the meaning of concrete keys?**

React extensions do. They provide defaults and semantic validation, then
implement their behavior through the focused React managers and surfaces that
own it.

**Q6. What happens when the extension for a stored key is absent?**

The raw value remains intact and round-trips losslessly, but it has no active
behavior. Installing or removing an extension must not erase unknown data.

**Q7. Is the property bag flat or namespaced by extension?**

It is flat. Extensions may reuse established keys or introduce new keys.
Nested namespaces are optional data conventions, not a storage requirement.

**Q8. How is the property bag typed publicly?**

Core exposes `Record<string, unknown>`. React extensions provide their own
typed access patterns where useful instead of making the entire editor generic
or relying on global TypeScript augmentation.

**Q9. Which block type declarations are canonical?**

The document-model declarations are canonical. Editor-facing names re-export
or alias them instead of maintaining parallel interfaces that can drift.

### Defaults and validation

**Q10. When are extension defaults applied?**

They are applied when blocks are created through the React block manager. The
preparation is recursive, so every newly created descendant receives the same
default treatment.

**Q11. Do extensions mutate existing blocks when they are installed?**

No. Installation does not cause collaborative document writes. Defaults affect
future React-created blocks only.

**Q12. Are defaults projected onto blocks during reads?**

No. `Block.listProps` always contains the raw persisted record. Extensions use
safe local fallbacks when a value is absent or malformed.

**Q13. Can multiple extensions define the same key?**

Yes. Defaults merge in registration order, with later registrations overriding
earlier defaults for the same key. All active validators are applied.

**Q14. May validators transform property values?**

No. A validator accepts or rejects the complete candidate record. It does not
normalize or rewrite it, which keeps composition predictable.

**Q15. Where does semantic validation run?**

React validates the complete candidate record for React-owned inserts and
updates. Direct core operations enforce storage safety only and do not know
extension semantics.

**Q16. Are extension defaults validated when registered?**

No. Extension authors are responsible for defining valid defaults. The normal
React mutation and core storage boundaries still reject invalid data when it
is used.

**Q17. What values may core persist inside `listProps`?**

Only recursively portable CRDT values: `null`, booleans, strings, finite
numbers, arrays, and plain records. Functions, symbols, `bigint`, non-finite
numbers, class instances, typed arrays, cycles, and `undefined` are rejected.

### Mutations

**Q18. Does a `listProps` patch merge or replace the record?**

It shallowly merges supplied keys. Nested objects and arrays are replacement
values; they are not recursively merged.

**Q19. How is a key deleted?**

The focused block manager exposes explicit single and batch deletion methods.
Neither `null` nor `undefined` acts as a deletion sentinel because extensions
may need to treat those values distinctly.

**Q20. What happens when a requested deletion key is already absent?**

Nothing. Deleting an absent key is a successful no-op.

**Q21. Are core batch operations best-effort?**

No. Core batches stay strict and atomic. A missing block or invalid mutation
prevents every write in that core batch.

**Q22. Where does best-effort behavior live?**

The React facade filters invalid or missing entries, submits the valid subset
to core as one atomic batch, and reports one result for every original input
entry. Input order and repeated block IDs are preserved.

**Q23. What do single-block operations return for a missing block?**

They return `false` rather than throwing. Successfully applied operations
return `true`.

### React extensions and page behavior

**Q24. Where are list-property definitions registered?**

They are registered through `reactEditor.blocks`. The registration contains an
ID, defaults, and optional validation; it does not become a catch-all object
for rendering, commands, selection, and clipboard behavior.

**Q25. How do other extension behaviors integrate?**

Each extension registers with the focused manager that owns the behavior. For
example, clipboard formatters belong to the React clipboard manager and page
chrome belongs to the page surface contribution points.

**Q26. Which built-in extensions own the initial keys?**

The list extension owns `type` and `checked`. The collapse extension owns
`collapsed`. The standard preset installs both.

**Q27. What happens in the page surface when those extensions are absent?**

The base surface renders a plain recursive block tree. Raw `type`, `checked`,
or `collapsed` values do not activate markers, checkbox controls, numbering,
or hidden descendants by themselves.

**Q28. How does the collapse extension affect the page?**

It contributes collapse controls, child visibility, selection repair,
keyboard behavior, and collapse-aware paste placement. Visibility is a React
surface concern, not a core document concept.

**Q29. Where does numbered-list calculation live?**

Concrete list constants, types, defaults, and numbering helpers move from core
to the React list extension and are exported from the React package.

**Q30. Does core retain `getVisibleBlockIds()`?**

No concrete visibility API remains in core. Core exposes structural document
order; React surfaces decide which blocks are visible.

### Clipboard and transfer

**Q31. What clipboard behavior remains in core?**

Core creates, cuts, validates, remaps, and inserts lossless structured bundles.
It also retains partial-text structured paste because that behavior depends on
document structure and text ranges rather than presentation properties.

**Q32. What clipboard behavior moves to React?**

React owns browser event integration, plain text, Markdown, HTML, external
parsing, extension formatting, React defaults, and the final structural paste
destination.

**Q33. How does React tell core where to paste whole blocks?**

React resolves presentation-aware behavior first and passes structural tree
coordinates such as the parent and preceding sibling. Core receives no
`collapsed` flag or other presentation policy.

**Q34. Is clipboard contribution state tied to DOM event handling?**

No. A React clipboard manager exists for registrations even when the optional
DOM clipboard extension is not installed. The DOM extension only connects that
manager to browser events.

**Q35. Which portable formats do formatters produce?**

They work with separate plain-text, Markdown, and HTML representations. This
allows blocks such as tables to represent themselves appropriately in every
format.

**Q36. How do multiple formatters compose?**

They run in deterministic extension order. Each applicable formatter may
preserve, append to, or replace the current representations before passing the
result onward.

**Q37. How are external clipboard formats parsed?**

React uses ordered HTML and plain-text parsers. The first parser that accepts
the input returns one or more recursive `BlockInput` roots, which then receive
React creation defaults.

**Q38. Does structured clipboard discard unknown keys?**

No. Snapshots, structured clipboard, duplication, and cross-document transfer
deep-clone and preserve the complete property record. Missing active defaults
may be added without overwriting copied keys.

**Q39. How is collapse-aware paste placement extended?**

Keep the mechanism small and ordered. The collapse behavior resolves the
structural destination before core paste; no generalized policy engine or
priority graph is needed.

### Invalid pasted blocks

**Q40. Is there a general pasted-block callback pipeline?**

No. `clipboardExtension` has one optional error callback, and it runs only when
a structured block fails preparation.

**Q41. What is the error callback contract?**

```ts
onBlockError?: (
  block: BlockInput,
  error: unknown,
) => BlockInput | null | undefined;
```

A returned block replaces the invalid block. Returning `null` or `undefined`,
or omitting the callback, skips that block and all of its descendants.

**Q42. What if the callback returns another invalid block?**

The replacement is checked once. If it is still invalid, it is skipped without
calling the error callback again.

**Q43. Does one invalid child discard its valid family?**

No. Invalid nodes are removed or replaced while valid parents and siblings are
retained. React prepares the resulting forest before handing it to core for an
atomic paste.

**Q44. What is the Error block?**

It is a normal block type supplied by a React extension. Its payload retains
the complete original portable subtree, and its renderer shows the failure
along with the original content, type, properties, list properties, plugin
data, and other recoverable fields.

**Q45. How is the Error block enabled?**

The Error block extension exports a ready-made clipboard error callback. The
standard preset installs its definition and supplies that callback to
`clipboardExtension`. Custom presets may omit it, in which case invalid
subtrees are skipped.

**Q46. Is an unknown block type considered invalid?**

No. Unknown types remain lossless and use the existing unknown-block renderer.
Only genuinely invalid data enters the clipboard error path.

### Versions and rollout

**Q47. Is backward compatibility required?**

No. This is a personal project without persisted user data that needs a
migration path. The implementation writes only the new shape.

**Q48. Do the format versions still change?**

Yes. Document snapshots move to version 6 and structured clipboard bundles
move to version 4 because their shapes changed. No migration or additional
version-validation machinery is added.

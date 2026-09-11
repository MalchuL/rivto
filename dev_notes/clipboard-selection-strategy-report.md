# Clipboard and Selection Architecture

## Current direction

Selection and clipboard are separate core domains. Selection describes local
runtime state; clipboard describes portable copied data and dispatches paste
mutation to registered strategies. Browser event objects remain in React.

The selection vocabulary is intentionally small:

- `Selection` is one plain value, not a class or a list of selection items.
- `BlockRange` is one block's `[start, end)` UTF-16 coverage.
- `end: -1` is the sole sentinel and means the block's current end.
- `ResolvedSelection` pairs document blocks with usable offsets.
- `SelectionManager` owns validation, ordering, cloning, resolution, deletion,
  and subscriptions.

One `Selection` can carry block ranges, canvas element IDs, and plugin-owned
data. This supports mixed edgeless state without a union, subclass hierarchy,
parallel stores, or multiple editing ranges.

## Domain layout

```text
selection-manager/
  selection.ts             public plain values
  resolved-selection.ts    document-backed operation values
  selection-ranges.ts      constructors, classifiers, offset conversion
  selection-manager.ts     state and document operations

clipboard-manager/
  clipboard-data.ts        portable bundle and paste input
  clipboard-manager.ts     copy orchestration and paste dispatch
  constants.ts             core MIME and core registration IDs
  strategies/              paste extension point and built-in algorithms
  utils/                   validation, cloning, and identity remapping
```

Removed names such as `EditorSelection`, `SelectionInput`, `BlockSelection`,
and “selection item” have no compatibility aliases.

## Selection invariants

- `start` is inclusive and `end` is exclusive.
- Offsets use UTF-16 units, matching DOM Range APIs and JavaScript strings.
- `{ start: 0, end: -1 }` means structural coverage, including an empty block.
- Any other invalid range resolves to an empty slice and does not throw during
  copy, delete, or paste.
- Blocks stay in document order; anchor and focus retain gesture direction.
- Shift+Alt across blocks keeps partial first and last offsets and covers the
  complete text of intermediate blocks.
- Selection is local and is neither persisted nor synchronized by the CRDT.

## Clipboard strategy boundary

`ClipboardManager` registers strategies with `register(id, strategy)`. Strategy
classes do not contain IDs. Core exports only IDs for its own built-ins; an
extension owns its registration constant, so adding an edgeless strategy does
not change core.

The current strategies cover split text, newline-preserving text, partial
structured text merge, structured block insertion, and React-owned element
paste for edgeless mode.

## Remaining clipboard problems

1. The registry runs every matching strategy. Text and block strategies are
   primary choices, while element paste behaves like a later contributor.
2. Element paste can discover inserted blocks through mutated editor selection,
   creating an ordering dependency instead of consuming an explicit result.
3. The React bridge still combines clipboard flavor reading, HTML import,
   preparation, placement, dispatch, and DOM restoration.
4. Legacy edgeless clipboard behavior should be removed only after element,
   group, connector, and referenced-block remapping have focused coverage.

## Next clipboard stage

Keep the registration API and make execution explicit: run one primary
text/block strategy, then pass its `PasteResult` to contributors such as
element paste. Do not put IDs back on strategy classes or add a core map of
extension IDs. Avoid another abstract pipeline until the current ordering
dependency is removed.

## Validation

The refactor is covered by core selection/clipboard tests, React selection and
edgeless strategy tests, and workspace type checks. Run the existing Playwright
selection and clipboard suites when the next stage changes browser event routing.

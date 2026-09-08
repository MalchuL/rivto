# List Properties Refactor Review

## Status

Implemented and validated.

This change turns `listProps` into an opaque, extensible property bag and moves
all interpretation of list and outline behavior from the core editor into React
extensions. There is intentionally no second semantic plugin system in core.

## Final design

- `BlockListProps` is `Record<string, unknown>`.
- `collapsed` is stored as `listProps.collapsed`; it is no longer a top-level
  block field.
- Core preserves unknown list properties without interpreting them.
- React extensions register concrete defaults and validators in extension
  registration order.
- Defaults are shallow-merged. Validators only accept or reject and every
  applicable validator runs.
- Unknown properties remain stored and copied even when their owning extension
  is not installed.
- Supported stored values are JSON-like primitives, arrays, and plain records.
  Unsupported or cyclic values are rejected at the core store boundary.
- Detached values are recursively cloned to prevent aliasing between live
  documents, snapshots, duplication, and clipboard payloads.

## Core changes

### Block model and storage

- Removed top-level `collapsed` from `Block`, `BlockInput`, and `BlockPatch`.
- Replaced the concrete `{ type, checked }` list shape with the opaque record.
- Removed concrete list defaults and validation from core.
- Removed core-owned list numbering and list-mode interpretation.
- Removed the scalar CRDT `collapsed` field; all list properties now live in the
  block's `listProps` CRDT map.
- Kept update behavior as a shallow merge.

### Mutation API

The focused core block manager now exposes:

- `deleteListProps(id, keys): boolean`
- `deleteListPropsBatch(updates): boolean`

Core batch deletion is strict and atomic. It returns `false` when it cannot
apply the requested mutation and `true` when it is applied. Deletion does not
use `undefined` or `null` sentinels because both are valid plugin-level values.

### Snapshots and transfer

- Snapshot format version changed from 5 to 6.
- The complete `listProps` record is preserved and recursively cloned in
  snapshots, duplication, structured clipboard payloads, and cross-document
  transfer.
- No compatibility migration was added for older snapshot or clipboard shapes.

## React changes

### List-property registration

The React block manager now owns list-property behavior. Extensions can
register:

- default list properties;
- one or more whole-record validators.

Defaults are applied recursively during React-owned block creation. React
validates the complete resulting record before its own insert and update
operations.

React-owned mutations now pass through the React block-manager facade,
including insert, update, batch update, and list-property deletion. Mutation
batches are best effort: an invalid or missing candidate is skipped while the
remaining candidates are processed, and results identify each candidate.

### Built-in behavior

- The list extension owns `type` and `checked` defaults, validation, numbering,
  shortcuts, rendering, and clipboard formatting.
- The collapse extension owns `collapsed` defaults, validation, visibility,
  selection repair, keyboard behavior, drag behavior, and rendering.
- Page selection, navigation, deletion, Enter handling, tree rendering, and
  drag logic now read `listProps.collapsed`.
- List and collapse UI is active only when the corresponding React extension is
  installed.

## Clipboard changes

Core retains structured subtree copy and paste but is semantics-neutral:

- structured clipboard version changed from 3 to 4;
- paste receives a resolved structural destination containing `parentId` and
  `afterId`;
- core no longer decides placement from collapse behavior;
- core no longer interprets `type`, `checked`, or `collapsed`;
- generic text serialization remains only as a neutral fallback.

The React clipboard extension now owns browser-facing interpretation:

- ordered whole-block formatters are composed;
- parsers use the first matching candidate;
- extensions can provide Markdown, HTML, and plain-text representations;
- parsed structured trees receive React defaults and validation recursively;
- invalid subtrees are skipped unless the configured error callback returns a
  replacement block.

`clipboardExtension(...)` accepts one error callback. It is called only for an
invalid block and receives that block's raw data. Returning `null` or
`undefined`, or omitting the callback, skips the invalid block and its nested
children.

An Error block extension is included. The standard preset uses it as the
clipboard error replacement and renders the invalid block's type, content,
properties, and other raw data for diagnosis.

## Public API impact

- Concrete list constants, types, and helpers moved from the core package to the
  React package and are re-exported there.
- React exposes its clipboard manager and list-property registration APIs.
- React adds `insertBlock` and routes extension and hook creation paths through
  it.
- Core visibility and concrete list helpers were removed because visibility and
  list meaning are now React extension concerns.
- The old block-definition `toRawText` callback was removed; clipboard
  formatters now own format-specific output.

## Validation completed

- Core Jest: 24 suites, 235 tests passed.
- React Jest: 21 suites, 107 tests passed.
- Demo tests: 6 tests passed.
- Type checking passed.
- Lint passed.
- Workspace build passed.
- `git diff --check` passed.
- Targeted Playwright coverage passed for collapse, list, and clipboard/drag
  behavior.

## Reviewer checklist

- Confirm persisted blocks contain `collapsed` only inside `listProps`.
- Confirm core contains no concrete list or collapse interpretation.
- Confirm all React list-property writes use the React block-manager facade.
- Confirm unknown list properties survive snapshots, duplication, clipboard,
  and cross-document transfer.
- Confirm invalid values cannot partially apply in strict core batches.
- Confirm best-effort React batches continue after an invalid or missing block.
- Confirm clipboard formatters compose in registration order and parsers use the
  first match.
- Confirm the clipboard error callback runs only for invalid blocks.

## Deliberate non-goals

- Backward compatibility with snapshot version 5 or clipboard version 3.
- Core understanding of list markers, checkboxes, collapse, indentation, or
  future plugin-defined keys.
- A second list-property plugin registry in core.
- Transformation or normalization inside validators.

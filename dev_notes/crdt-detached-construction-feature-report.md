# Proposed feature: explicit detached CRDT construction

## Status

This document describes a proposed change. None of the API removals, additions,
or migrations below are implemented yet.

## Decision summary

Remove `CRDTInstantiator` and `YjsInstantiator`. Put the three adapter-neutral
construction methods directly on `CRDTDoc`, and name them explicitly after the
lifecycle state they produce:

```ts
createDetachedArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item>;
createDetachedMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema>;
createDetachedText(): CRDTText;
```

Also export `YjsArray`, `YjsMap`, and `YjsText` for consumers that deliberately
choose the Yjs adapter and want direct construction with `new`.

The word `Detached` is required. These methods do not create document roots and
do not return readable standalone collections. They create shared values that
must be inserted into an already attached CRDT map or array.

## Problem

`YjsInstantiator` is a stateless wrapper around three existing constructors.
The `crdt-doc` implementation does not use the instantiator for its own runtime
behavior; it only creates and exposes the object. Production calls come from
`document-model` when it needs nested shared values.

The current API hides an important lifecycle fact behind generic names such as
`createArray()`: the returned value is detached. Writes can prepare a detached
value, but reads generally throw until the value has been attached to a Yjs
document through an attached parent.

## Proposed public contract

Add the following methods to `CRDTDoc`:

```ts
/**
 * Creates a detached CRDT array for insertion into an attached CRDT
 * container.
 *
 * This method does not create a named document root. First obtain an attached
 * parent with `getMap()` or `getArray()`, then attach the returned array with
 * `map.set()` or `array.insert()`.
 * Most read operations throw until attachment.
 *
 * @returns A detached array compatible with this document adapter.
 */
createDetachedArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item>;

/**
 * Creates a detached CRDT map for insertion into an attached CRDT container.
 *
 * This method does not create a named document root. First obtain an attached
 * parent with `getMap()` or `getArray()`, then attach the returned map with
 * `map.set()` or `array.insert()`.
 * Most read operations throw until attachment.
 *
 * @returns A detached map compatible with this document adapter.
 */
createDetachedMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema>;

/**
 * Creates detached collaborative text for insertion into an attached CRDT
 * container.
 *
 * This method does not create a named document root. First obtain an attached
 * parent with `getMap()` or `getArray()`, then attach the returned text with
 * `map.set()` or `array.insert()`.
 * Read operations throw until attachment.
 *
 * @returns Detached collaborative text compatible with this document adapter.
 */
createDetachedText(): CRDTText;
```

The examples inside these docstrings are part of the contract. Documentation
must not present a detached value as an independently usable collection.

## Required usage pattern

Obtain the attached parent first, create the detached child through the same
document adapter, and attach it with a CRDT operation:

```ts
const root = document.getMap<Record<string, CRDTType>>("root");

const items = document.createDetachedArray<string>();
root.set("items", items);

items.push("first");
console.log(items.length);
```

Inline construction is also valid when no pre-population is required:

```ts
const root = document.getMap<Record<string, CRDTType>>("root");
root.set("items", document.createDetachedArray<string>());
root.set("metadata", document.createDetachedMap());
root.set("content", document.createDetachedText());
```

For an array parent:

```ts
const root = document.getArray<CRDTType>("root");
root.push(document.createDetachedMap());
```

Named roots continue to use `getArray(path)`, `getMap(path)`, and
`getText(path)`. The detached methods must not accept a root path.

## Yjs-specific direct construction

Export the existing wrapper classes from `@chulane/crdt-doc`:

```ts
import { YjsArray, YjsDoc, YjsMap, YjsText } from "@chulane/crdt-doc";

const document = new YjsDoc("example");
const root = document.getMap<Record<string, CRDTType>>("root");

root.set("items", new YjsArray<string>());
root.set("metadata", new YjsMap());
root.set("content", new YjsText());
```

Direct constructors are an explicitly Yjs-specific API. Adapter-neutral code,
including `document-model`, must use `document.createDetached*()` so that a
custom `CRDTDoc` can return values compatible with its own implementation.

The initial feature does not add value-taking constructor overloads. Callers
can populate a detached wrapper through its mutation methods before attachment,
or populate it after attachment. Most reads remain unavailable while detached.

## Implementation shape

`YjsDoc` implements the new methods directly:

```ts
createDetachedArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item> {
  return new YjsArray<Item>();
}

createDetachedMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema> {
  return new YjsMap<Schema>();
}

createDetachedText(): CRDTText {
  return new YjsText();
}
```

No constructor registry, injectable constructor bundle, or replacement factory
object is required. Those designs reproduce `CRDTInstantiator` without adding
capability.

## Production impact

### `packages/crdt-doc`

- Add `createDetachedArray`, `createDetachedMap`, and `createDetachedText` to
  `CRDTDoc`.
- Implement them in `YjsDoc`.
- Export `YjsArray`, `YjsMap`, and `YjsText` from the supported package entry
  point.
- Remove `CRDTDoc.instantiator`.
- Remove `CRDTInstantiator` and `YjsInstantiator`.
- Remove their type exports and dedicated tests.
- Keep basic-value conversion and plain-record checks as internal Yjs adapter
  utilities. `YjsDoc.fromJSON()` already uses the underlying conversion helper
  directly.

### `packages/document-model`

Migrate ten production calls:

- `DocumentBlockManager`: six calls.
- `DocumentElementManager`: three calls.
- `DocumentPluginDataManager`: one call.

Example migration:

```ts
// Before
const children = this.document.crdt.instantiator.createArray<string>();

// After
const children = this.document.crdt.createDetachedArray<string>();
```

The managers must not import or instantiate `YjsArray`, `YjsMap`, or `YjsText`.

### Other packages

`rivto-editor-core`, `react-rivto-editor`, the demo, and E2E tests have no
direct production calls to the instantiator. They are affected only through
type checking, package re-exports, and the behavior exercised by higher-level
tests.

`rivto-editor-core` re-exports the CRDT package, so removing
`CRDTInstantiator` is also a public API removal for consumers importing it from
the editor-core package.

## Compatibility

This is a breaking API change:

- Existing calls to `document.instantiator.createArray()` stop compiling.
- External `CRDTDoc` implementations must implement the three new detached
  creation methods.
- External imports of `CRDTInstantiator` stop compiling.

The persisted CRDT representation, snapshots, providers, transactions,
observers, and undo scopes do not change. No document-data migration is
required.

If compatibility across one release is required, add the new methods first and
deprecate `instantiator`; remove it in the next major release. Otherwise, make
the replacement in one major change.

## Lifecycle invariants

The implementation and documentation must preserve these rules:

1. `createDetached*()` returns a value compatible with the document adapter on
   which the method was called.
2. Detached values are intended only for insertion into an attached CRDT map or
   array.
3. Detached values do not create or replace named roots.
4. A shared value is attached to one parent location and must not be reused
   across parents or documents.
5. Mutations may pre-populate a detached value, but reads that currently throw
   before attachment continue to throw.
6. Generic schemas and item types provide compile-time constraints only; this
   feature adds no runtime schema validation.

## Validation plan

1. Add one public-entry-point test importing all three Yjs wrapper classes and
   attaching them to a `YjsDoc` root.
2. Replace instantiator construction in existing nested-structure tests with
   `createDetached*()` and retain map, array, text, and deep-nesting coverage.
3. Verify that detached reads still throw and that writes survive attachment.
4. Run the focused `crdt-doc` and `document-model` suites.
5. Run workspace type checking because `CRDTDoc` and editor-core re-exports are
   public contracts.
6. Run the build to validate generated package declarations and exports.

## Acceptance criteria

- Consumers can import and instantiate `YjsArray`, `YjsMap`, and `YjsText` from
  `@chulane/crdt-doc`.
- `CRDTDoc` exposes all three `createDetached*()` methods.
- No production source references `instantiator`, `CRDTInstantiator`, or
  `YjsInstantiator`.
- `document-model` remains adapter-neutral and contains no Yjs wrapper imports.
- API documentation states that returned objects are detached and demonstrates
  `getMap()` or `getArray()` followed by `set()`, `push()`, or `insert()`.
- Existing collaboration, snapshot, undo, and nested-container tests pass.

## Explicit non-goals

- Initial-value constructor overloads.
- A new factory or constructor registry.
- Runtime schema validation.
- Changing named-root creation.
- Changing persisted document formats.
- Making detached collections generally readable before attachment.

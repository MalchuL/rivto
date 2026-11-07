# Shared runtime space

The shared runtime space lets extensions exchange runtime values without importing
each other's implementations or requiring one another to be installed. It belongs
to an editor's extension manager. Each editor has its own space; its contents are
not stored in the document.

## Keys and lifetime

Extensions reserve named keys to keep shared objects available. Each reservation
increments the key's reference count, and disposing it decrements the count. When
the last reservation is released, the space removes and disposes the object.
Methods called on a retained reference to a disposed object throw an error.

Reservation holds the key and its object type. The object can be created lazily
when first requested. A key cannot be reserved for conflicting types while it is
reserved; after the last release it can be used for another type.

Lookup methods such as `getSet` and `getMap` return the shared object for a
reserved key, or `undefined` if the key is not reserved. Lookup does not create a
reservation or increment its count. An extension can look up a key reserved by
another extension, and must reserve it itself if it needs to keep the object alive.
Editor teardown disposes any remaining objects, clears their retained values and
named subscriptions, and rejects new reservations or subscriptions.

Extensions release their own reservations and contributions through their
existing cleanup lifecycle. The space does not need to know extension identities.
The implementation exposes the space as `reactEditor.extensions.shared`.
Reservations created during extension setup participate in the existing
installation rollback and teardown; their returned disposers are idempotent.

```ts
const space = reactEditor.extensions.shared;
const release = space.reserve("example.block-types", "set");
const types = space.getSet<string>("example.block-types")!;
types.add("example");
return () => {
  types.delete("example");
  release();
};
```

The participants' shared contract must agree on both the name and the TypeScript
value types: the space checks the object kind at runtime, not generic value types.

## Shared objects

Shared objects have stable identity while alive and notify subscribers when their
observable contents change. They support the following kinds of runtime data:

- **Set:** Counts claims for each value. Adding an existing value adds a claim;
  removing a claim removes the value only when no claims remain.
- **Map:** Counts claims for each key. A write immediately replaces the current
  value; releasing a claim leaves the current value in place while another claim
  keeps the key alive. The last claim removes the key.
- **Array:** Supports ordered insertion and removal. Per-value claim counts are
  not required.
- **Scalar value:** Holds one value; updates immediately replace it.
- **Function:** Holds one replaceable function. Consumers can determine whether a
  function is available before calling it.

An extension explicitly releases its own entry claims during cleanup. The
collection's counters keep an entry present when another claim remains. Repeated
claims and releases must be balanced so that cleanup does not remove another
participant's claim.

`shared.subscribe(key, listener)` observes one name even before it is reserved.
It reports the first reservation, observable changes to its object, and the final
release. `shared.revision` supplies a monotonic external-store snapshot. This
lets a mounted consumer discover contributions installed later without subscribing
to unrelated names.

## Shared contracts

Extensions agree on the names and meanings of shared keys and their contents in
neutral shared contracts. For example, a nesting-lines contract can be used by a
block extension without either extension importing the other's implementation.
Block-type properties and changing per-block runtime state have different
lifetimes; existing block metadata can describe type-wide properties, while the
space can hold shared runtime state.

Markdown previews use the `rivto.markdown.extensions` array for ordered parser
and renderer contributions. The file and image extensions register their own
macros and presentation; the preview works without either extension and updates
when contributions are installed or removed. `registerMarkdownExtension`
captures the contribution and its reservation in the extension lifecycle.

The Page bridge reads `rivto.page.block-decorations` for the host's translation
between Page decorations and persisted block properties. The editor reserves this
value independently of optional extensions and supplies the existing built-in
translation by default. A replacement adapter changes mounted projections and
translates subsequent writes; the panel still validates the complete properties
before applying them in one history batch. Replacements should be new objects so
the shared value reports the change. React container summaries and block handles
also read persisted collapse presentation through this adapter, including when
the optional collapse extension is not installed.
Container operations use `updatePageBlockDecorations` to request expansion, so
they do not write a particular collapse property themselves.

The list and collapse extensions contribute conversion values to
`rivto.blocks.conversion-defaults`. Separator conversion applies these values
without resetting unrelated properties such as background color. Newly inserted
blocks receive ordinary defaults through the existing block-property policy.

The collapse extension supplies `rivto.clipboard.paste-into-children` while it is
installed. Clipboard consults this optional function when choosing a destination
for whole blocks; without it, clipboard uses its ordinary sibling placement.

The generic file extension supplies `rivto.attachments.file-input-routing` while
its input listeners are installed. Image input consults that optional function to
defer file transfers to the generic router without depending on its event IDs. The
function uses the event manager's captured dispatch registrations, so an input
listener added during an event takes effect on the next event and a removed
listener is ignored immediately.

`rivto.clipboard.list-properties` translates detached HTML list items to host
list properties. The editor supplies the existing list and checkbox translation
without requiring a list extension; a host can replace the function through the
shared space while the clipboard registry continues to own HTML traversal.

The editor owns the shared edgeless-selection adapter cache for its lifetime.
Each panel receives its own adapter, and consumers can acquire one before the
optional edgeless-selection extension is installed. Removing that extension
clears its selection state without destroying the editor-owned adapter cache.

Block context menu actions carry their own optional `icon` and `variant` in the
existing menu registration. The menu renderer uses those values without mapping
extension IDs to presentation or maintaining a second shared registry.

## Additional idea

- Consider retaining previous map values so that releasing an overriding claim can
  restore an earlier value. This is an additional idea, not an agreed behavior;
  ordering and ownership of previous values would need a decision.

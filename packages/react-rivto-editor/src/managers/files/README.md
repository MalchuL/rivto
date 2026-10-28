# File pipeline

`ReactEditor.files` is the browser-safe integration point for storing any file,
dispatching pasted file types, and resolving persisted logical URIs. It contains
no filesystem or cloud SDK. Hosts register those capabilities from a normal
`ReactEditorExtension`.

## Binary providers

`fileExtension` and `imageExtension` require a `BinaryProvider<string, Blob>`.
A provider writes attachment bytes and returns a durable URI, then reads bytes
for URIs it owns. Return `undefined` for unrecognized URIs; browser-readable
HTTP(S), data and blob URLs retain their normal fallback. Provider failures
propagate to the attachment error UI.

```ts
const provider: BinaryProvider<string, Blob> = {
  write: (content, context) => storage.write(content, context),
  read: (uri, context) => storage.readIfOwned(uri, context),
};
fileExtension({ provider });
imageExtension({ provider });
```

Providers receive document ID, surface mode and cancellation; writes also receive
file metadata, source, destination and optional progress. Hosts can adapt the
generic `BinaryProvider<Reference, Binary>` contract to URI strings and Blobs.
`createLocalFileBridge` provides an adapter around host filesystem callbacks.

## Open handlers

Generic file views open on double-click or keyboard activation. Right-click
offers Open file plus Copy file when the active clipboard supports its MIME
type. Register typed handlers for in-app viewers and optionally one matcher-less
host fallback:

```ts
editor.files.registerOpenHandler({
  id: "pdf-viewer",
  matches: ({ mimeType }) => mimeType === "application/pdf",
  open: (reference) => router.open(`/pdf/${encodeURIComponent(reference.uri)}`),
});
editor.files.registerOpenHandler({
  id: "native-app",
  open: (reference, context) => desktop.openFile(reference.uri, context.signal),
});
```

Typed handlers always win over the matcher-less fallback, even when registered
later. Without any handler, Rivto resolves the URI and opens it in a browser tab.

## Paste handlers

`fileExtension()` owns paste, drop, picker, placement, and the generic `file`
fallback. Rich extensions register a matcher before users interact:

```ts
editor.files.registerPasteHandler({
  id: "audio",
  provider: audioProvider,
  elementType: "audio",
  matches: ({ reference }) => reference.mimeType.startsWith("audio/"),
  prepare: async ({ reference }) => ({
    inline: serializeAudioMacro(reference),
    block: { type: "audio", props: { ...reference } },
    element: { type: "audio", props: { ...reference }, width: 320, height: 64 },
  }),
  InlineView: AudioInline,
});
```

Matched handlers are tried in registration order. The one matcher-less handler
registered by `fileExtension()` is always consulted last. A rich extension also
registers its block renderer through `editor.blockTypes` and its canvas renderer
through `editor.elementTypes`. `InlineView` handles matching generic file macros.

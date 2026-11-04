# File pipeline

`ReactEditor.clipboard` classifies attachment inputs, while `ReactEditor.attachments`
resolves references and registers file-opening handlers. File and image extensions
use their own binary providers for storage and resolution; the clipboard does not store bytes.

## Binary providers

`fileExtension` and `imageExtension` require a `BinaryProvider`.
A provider writes attachment bytes and returns a durable URI, then reads bytes
for URIs it owns. Return `undefined` for unrecognized URIs; browser-readable
HTTP(S), data and blob URLs retain their normal fallback. Provider failures
propagate to the attachment error UI.

```ts
const provider: BinaryProvider = {
  write: (content, context) => storage.write(content, context),
  read: (uri, context) => storage.readIfOwned(uri, context),
};
fileExtension({ provider });
imageExtension({ provider });
```

Providers receive document ID, surface mode and cancellation; writes also receive
file metadata, source, destination and optional progress. Providers use URI strings and Blobs.
`LocalFileBridge` provides an adapter around host filesystem callbacks.

## Open handlers

Generic file views open on double-click or keyboard activation. Right-click
offers Open file plus Copy file when the active clipboard supports its MIME
type. Register typed handlers for in-app viewers and optionally select a registered
host handler explicitly as the default:

```ts
editor.attachments.registerFileOpenHandler({
  id: "pdf-viewer",
  matches: ({ mimeType }) => mimeType === "application/pdf",
  open: (reference) => router.open(`/pdf/${encodeURIComponent(reference.uri)}`),
});
editor.attachments.registerFileOpenHandler({
  id: "native-app",
  open: (reference, context) => desktop.openFile(reference.uri, context.signal),
});
editor.attachments.setDefaultFileOpenHandler("native-app");
```

Matching handlers always win over the selected default, even when registered
later. Without any handler, Rivto resolves the URI and opens it in a browser tab.

## File handlers

`fileExtension()` owns paste, drop, picker, placement, and the generic `file`
fallback. Rich extensions register a matcher before users interact:

```ts
editor.clipboard.registerFileHandler({
  id: "audio",
  provider: audioProvider,
  matches: ({ reference }) => reference.mimeType.startsWith("audio/"),
  prepare: async ({ reference }, { destination }) => {
    if (destination === "inline") {
      return { kind: "inline", content: serializeAudioMacro(reference) };
    }
    if (destination === "block") {
      return { kind: "block", type: "audio", props: { ...reference } };
    }
    return { kind: "element", type: "audio", props: { ...reference }, width: 320, height: 64 };
  },
  InlineView: AudioInline,
});
```

For a new file, `matches` receives file metadata without a URI; `prepare` receives the stored reference with its URI. Existing references have a URI at both stages.

Matched handlers are tried in registration order. The default handler selected by `fileExtension()` is always consulted last.
Use `editor.clipboard.setDefaultFileHandler(id)` to choose a registered default;
a handler without `matches` is never selected automatically. Mounted inline file views
update when handlers are registered, removed, or selected as the default. A rich extension also
registers its block renderer through `editor.blockTypes` and its canvas renderer
through `editor.elementTypes`. `InlineView` handles matching generic file macros.

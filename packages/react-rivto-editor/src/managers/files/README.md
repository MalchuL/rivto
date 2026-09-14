# File pipeline

`ReactEditor.files` is the browser-safe integration point for storing any file,
dispatching pasted file types, and resolving persisted logical URIs. It contains
no filesystem or cloud SDK. Hosts register those capabilities from a normal
`ReactEditorExtension`.

## Default behavior

```ts
const reactEditor = createReactEditor({
  editor: coreEditor,
  files: {
    dataUrlMaxBytes: 10 * 1024 * 1024,
    documentBaseUri: "https://example.test/documents/current/",
  },
});
```

- Uploads use a data URL when no handler claims the file.
- The default and fallback limit is 10 MiB per file.
- HTTP(S), `data:*`, and `blob:` URIs resolve directly.
- Relative URIs resolve against `documentBaseUri` when configured.
- Custom schemes and `file:` URIs require a registered resolver.
- Abort signals are checked before upload, postprocessing, and resolution.

## Upload extension

```ts
const storageExtension = {
  id: "app.storage",
  setup(editor) {
    editor.files.registerUploadHandler({
      id: "object-storage",
      maxBytes: 25 * 1024 * 1024,
      upload: async (file, context) => {
        if (context.source !== "clipboard") return undefined;
        context.reportProgress?.(0.25);
        const uri = await storage.put(file, { signal: context.signal });
        context.reportProgress?.(1);
        return uri;
      },
    });
  },
};
```

There is one uploader per editor. Returning a URI claims the file; returning
`undefined` delegates to the bounded data-URL fallback. The context contains:

- `documentId` and current `mode`;
- source: `clipboard`, `drop`, or `picker`;
- destination: `inline`, `block`, or `element`;
- cancellation signal and optional progress reporter.

## URI postprocessors

Postprocessors run in registration order after either host upload or fallback:

```ts
editor.files.registerPostprocessor({
  id: "cdn",
  process: (uri, file, context) => signOrRewrite(uri, file, context.documentId),
});
```

Use them for stable URI rewriting, CDN mapping, encryption envelopes, or other
storage-wide policy. A postprocessor must return a non-empty safe URI.

## URI resolvers

Resolvers run in registration order and the first returned string or `Blob`
wins:

```ts
editor.files.registerUriResolver({
  id: "asset-scheme",
  resolve: (uri, context) => uri.startsWith("asset:")
    ? storage.read(uri, { signal: context.signal })
    : undefined,
});
```

Return `undefined` for URIs the resolver does not own. Blob results become
component-owned object URLs and are revoked after replacement/unmount. Resolver
strings are validated against empty, `javascript:`, and `vbscript:` values.

All registrations are lifecycle-owned: install them during extension `setup`
and they are removed when the editor/extension is destroyed.

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
  elementType: "audio",
  matches: ({ reference }) => reference.mimeType.startsWith("audio/"),
  prepare: async ({ reference }) => ({
    inline: serializeAudioMacro(reference),
    block: { type: "audio", props: { ...reference } },
    element: { type: "audio", props: { ...reference }, width: 320, height: 64 },
  }),
  InlineView: AudioInline,
  ElementView: AudioElement,
});
```

Matched handlers are tried in registration order. The one matcher-less handler
registered by `fileExtension()` is always consulted last. A rich extension also
registers its block renderer through the existing block manager; `InlineView`
and `ElementView` cover generic file macros and canvas presentation.

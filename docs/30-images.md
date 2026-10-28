# Images

Install `fileExtension()` for generic file ingestion and `imageExtension()` for
rich image preparation, rendering, the `/Image` picker, and image macros.
Install `edgelessPreset()` to enable the canvas surface and its interaction controls.
Filesystem copy/paste works when the browser exposes the copied entry as a
clipboard file or file item; browser-suppressed `file://` paths remain unreadable.
The repository demo additionally resolves absolute image paths through bounded,
localhost-only Vite middleware so desktop file-manager Ctrl+C/Ctrl+V can be tested
in both page and edgeless modes. This bridge is not included in the package.

```ts
const editor = createReactEditor({
  editor: coreEditor,
  extensions: [fileExtension({ provider: fileProvider }), imageExtension({ provider: imageProvider }), ...edgelessPreset(), standardPreset()],
});
```

Inline images persist as canonical Markdown-like text:

```md
{{image path="assets/photo.png" alt="A mountain" width=640 height=480}}
```

`alt`, `width`, and `height` are optional. Drag the bottom-right handle to resize,
hold Shift for free resizing, or double-click/press Enter on the handle to reset.
Standard Markdown images such as `![Alt](photo.png)` use the same controls and
become an image macro only when an adjustment needs persisted dimensions.

Both extensions require a `BinaryProvider<string, Blob>`. Providers write bytes and
return URI strings, then read references they own. An unrecognized reference may
return `undefined`; HTTP(S), data and blob URLs can then use browser resolution.
Provider failures are reported rather than falling back to another storage backend.

```ts
const imageProvider: BinaryProvider<string, Blob> = {
  write: (blob, context) => cloud.upload(blob, context),
  read: (uri, context) => cloud.readIfOwned(uri, context),
};
```

`createLocalFileBridge` creates a provider using host filesystem callbacks.
The demo uses its own bounded local provider; filesystem access is host-owned.

Unsupported file types fall back to an openable `file` chip, block, or canvas
element. Double-clicking uses a matching typed open handler, then a matcher-less
host handler, then the browser fallback. A single file pasted into an empty
default block replaces that block.
Rich media extensions register ordered paste handlers; the generic handler stays
last. Single selected file/image objects can additionally contribute binary MIME
data through clipboard postprocessors and a registered host clipboard writer.

```ts
const nativeClipboardExtension = {
  id: "app.native-clipboard",
  setup(editor) {
    editor.clipboard.registerWriter({
      id: "desktop",
      supports: (mimeType) => desktopClipboard.supports(mimeType),
      write: ({ name, mimeType, data }) =>
        desktopClipboard.writeFile(name, mimeType, data),
    });
  },
};
```

The image and default file extensions already register their binary copy
postprocessors. A rich future type registers another only when it needs a
different byte representation. Exact MIME is preferred; unsupported writers
receive `application/octet-stream` when they accept that fallback.

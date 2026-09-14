# Images

Install `fileExtension()` for generic file ingestion and `imageExtension()` for
rich image preparation, rendering, the `/Image` picker, and image macros.
Install `edgelessVisualsExtension()` as well when canvas images are needed.
Filesystem copy/paste works when the browser exposes the copied entry as a
clipboard file or file item; browser-suppressed `file://` paths remain unreadable.
The repository demo additionally resolves absolute image paths through bounded,
localhost-only Vite middleware so desktop file-manager Ctrl+C/Ctrl+V can be tested
in both page and edgeless modes. This bridge is not included in the package.

```ts
const editor = createReactEditor({
  editor: coreEditor,
  extensions: [fileExtension(), imageExtension(), edgelessVisualsExtension(), standardPreset()],
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

Without a host uploader, image files are stored as data URLs up to 10 MiB. Hosts
can register one uploader, ordered URI postprocessors, and URI resolvers during
extension setup:

```ts
const filesExtension = {
  id: "app.files",
  setup(editor) {
    editor.files.registerUploadHandler({
      id: "assets",
      maxBytes: 25 * 1024 * 1024,
      upload: async (file, context) => uploadAsset(file, context.signal),
    });
    editor.files.registerPostprocessor({
      id: "cdn",
      process: (uri) => uri.replace(UPLOAD_ORIGIN, CDN_ORIGIN),
    });
    editor.files.registerUriResolver({
      id: "desktop-assets",
      resolve: (uri, context) => readAsset(uri, context.signal),
    });
  },
};
```

An upload handler may return `undefined` for inputs it does not claim; Rivto then
uses the bounded data-URL fallback. The repository demo uses this to store only
clipboard file bytes in `<os-temp>/rivto-files`, while drop and picker files
continue through the data-URL fallback. Existing names are never overwritten;
missing names and collisions receive UUID filenames.

Desktop apps can instead use `createLocalFileBridge(...)`; its `writeFile` and
`readFile` callbacks keep privileged filesystem access in the host process.

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

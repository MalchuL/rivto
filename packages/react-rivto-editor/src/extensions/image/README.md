# Image extension

`imageExtension()` adds inline images, standalone image blocks, and browser
paste/drop behavior. It is opt-in and is not included by `standardPreset()`.

## Setup

```ts
import {
  createReactEditor,
  edgelessVisualsExtension,
  fileExtension,
  imageExtension,
  standardPreset,
} from "@chulane/rivto-react";

const editor = createReactEditor({
  editor: coreEditor,
  extensions: [
    fileExtension(),
    imageExtension({ onError: (error) => reportError(error) }),
    edgelessVisualsExtension(), // Required only for canvas images.
    standardPreset(),
  ],
});
```

Import `@chulane/rivto-react/styles.css` for the image frame, controls, upload
cards, and resize handles.

## Shared component customization

Inline macros, image blocks, and image elements all render through `ImageView`.
Configure each context without replacing its persistence or upload behavior:

```tsx
import type { ImageHoverMenuProps } from "@chulane/rivto-react";

function ProductImageMenu({ alt, onAltChange, onReset }: ImageHoverMenuProps) {
  return <>
    <input aria-label="Alt text" value={alt} onChange={(event) => onAltChange(event.currentTarget.value)} />
    <button type="button" onClick={onReset}>Original size</button>
  </>;
}

imageExtension({
  views: {
    inline: { resizeMode: "letterbox", dragResize: true, HoverMenu: ProductImageMenu },
    block: { resizeMode: "stretch", dragResize: true, HoverMenu: ProductImageMenu },
    element: { resizeMode: "letterbox", dragResize: false, HoverMenu: ProductImageMenu },
  },
});
```

- `letterbox` preserves aspect ratio during normal dragging and renders with
  `object-fit: contain`; Shift temporarily allows free resizing.
- `stretch` allows free width/height dragging and renders with `object-fit: fill`.
- `dragResize` controls the shared component's bottom-right handle. It defaults
  to `true` for inline/block images and `false` for elements because the canvas
  already owns element resize handles.
- `HoverMenu` replaces the hover/focus menu. Pass `null` to disable the menu.

`ImageView` is also public and accepts a direct `customization` override. Direct
props take precedence over the per-kind `imageExtension()` configuration.
Right-clicking an image opens Rivto's accessible Copy image menu when a host
writer or browser `ClipboardItem` accepts its MIME type. Otherwise Rivto leaves
the native browser context menu untouched so its built-in Copy Image remains
available.

## Supported input

| Input | Result |
| --- | --- |
| Paste/drop inside editable block content | Inline image macro |
| Paste/drop on page whitespace | Standalone `image` block |
| Paste/drop on an edgeless viewport | First-class `image` element |
| `/Image` slash command | Native multi-file picker and image block(s) |
| One image-only HTML `<img>` | Referenced remote image |
| HTTP(S) image URL | Referenced remote image |
| Host-resolvable absolute/file path | Referenced local image |

PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, and SVG filenames are recognized. Every
file is decoded as an image before insertion, so an extension or MIME label alone
is not trusted. Multiple file uploads run concurrently and successful results
are inserted in source order.

Desktop file managers may expose a copied file as bytes, a `File`, a clipboard
item, or a redacted `text/uri-list`. The extension handles all four forms. For a
redacted URI list it reads the path with the asynchronous Clipboard API; local
paths still require a registered URI resolver because the browser cannot read
the filesystem directly.

Mixed HTML is left to the normal clipboard pipeline. Non-image files are not
claimed by this extension.

## Persistence

Inline images use canonical text:

```md
{{image path="assets/photo.png" alt="A mountain" width=640 height=480}}
```

`alt`, `width`, and `height` are optional. Quoted values use JSON escaping and
dimensions are positive integer CSS pixels. Invalid near-matches remain visible
as ordinary Markdown.

Image blocks persist the same values in block props. Edgeless images persist a
logical URI, alt text, intrinsic dimensions, frame, z-index, and rotation in a
first-class document element. Only completed uploads and resize gestures mutate
the collaborative document; pending/error state stays local.

## Resizing and accessibility

- Hover or focus an inline/block image to reveal its bottom-right handle.
- Drag to preserve the aspect ratio; hold Shift for free resizing.
- Double-click the handle or focus it and press Enter to reset the size.
- Canvas images fill their complete element frame and expose a southeast handle.
- Alt text is editable from the hover/focus controls.
- Loading and upload failures use status/alert semantics with Retry and Dismiss.

Deleting an image reference does not delete the underlying asset. Asset garbage
collection belongs to the host storage system.

## Storage behavior

Without a host uploader, files become data URLs with a default 10 MiB per-file
limit. Configure `files.dataUrlMaxBytes` when creating the React editor to change
that limit. A registered uploader may return `undefined` to decline a file and
retain the data-URL fallback.

For a desktop or native host, `createLocalFileBridge()` registers an uploader
and matching URI resolver without importing Node APIs into the React package:

```ts
const localFiles = createLocalFileBridge({
  directory: "file:///home/user/notes/assets/",
  uriPrefix: "assets/",
  maxBytes: 25 * 1024 * 1024,
  writeFile: ({ directory, fileName, file, signal }) =>
    desktopBridge.writeFile({ directory, fileName, bytes: file, signal }),
  readFile: ({ directory, uri, signal }) =>
    desktopBridge.readFile({ directory, uri, signal }),
});

createReactEditor({
  editor: coreEditor,
  extensions: [localFiles, imageExtension(), standardPreset()],
});
```

The bridge sanitizes the original basename, appends a UUID, preserves a short
extension, and returns an encoded logical URI. The privileged callbacks decide
how files are physically written and read.

See [`../../managers/files/README.md`](../../managers/files/README.md) for custom
upload, URI postprocessing, and resolver extensions.

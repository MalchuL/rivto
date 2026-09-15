# Edgeless visuals extension

`edgelessVisualsExtension()` adds persisted visual objects, their canvas layer,
selection tools, property controls, clipboard support, and editor commands to
the standard edgeless surface.

## Setup

```ts
import {
  createReactEditor,
  edgelessVisualsExtension,
  imageExtension,
  standardPreset,
} from "@chulane/rivto-react";

const visuals = edgelessVisualsExtension({
  toolbar: true,
  orphanConnectors: "detach",
  fonts: [{ label: "Editorial", fontFamily: "Georgia, serif" }],
  stickers: [{ id: "note", label: "Note", fill: "#fff3bf" }],
});

const editor = createReactEditor({
  editor: coreEditor,
  extensions: [imageExtension(), visuals, standardPreset()],
});
```

`imageExtension()` supplies image paste/drop and `/Image`; visuals created with
`createImage()` render directly through this extension. It is not required when
an application uses only the other visual kinds.

## Supported visuals

| Kind | Main persisted data |
| --- | --- |
| `rectangle`, `ellipse` | Frame, rotation, fill/stroke, label typography |
| `text` | Frame, rotation, text and typography |
| `sticker` | Frame, rotation, text, colors and typography |
| `drawing` | Frame, relative pressure points, brush and stroke |
| `connector` | Attached/free endpoints, route, decorations, label and stroke |
| `image` | Logical URI, alt text, intrinsic dimensions and frame |

Groups are persisted logical elements containing selected block/visual
references. Block cards remain normal document blocks referenced by canvas
elements; visuals do not duplicate block content.

## Interaction

- Select, move, resize, rotate, duplicate, delete, group, and ungroup visuals.
- Align selections, distribute three or more objects, and change layer order.
- Draw with pencil/pen/marker and erase intersected drawings.
- Create straight, orthogonal, or curved connectors with optional attachment.
- Edit labels and visual properties without triggering canvas shortcuts.
- Copy/cut/paste visual selections with fresh IDs and preserved relationships.

The optional toolbar creates shapes, text, stickers, drawings, and connectors.
Images intentionally have no toolbar preset; `imageExtension()` supplies paste,
drop, and `/Image` flows.

Image elements default to `object-fit: contain`. Their canvas southeast resize
handle appears on hover/focus/selection, preserves aspect ratio in `letterbox`
mode, and allows free resizing with Shift or in `stretch` mode. Reset restores
the intrinsic size capped to 640×480. The shared component's own drag handle is
disabled for elements by default and can be enabled through `views.element`.

## Imperative API

Keep the returned extension instance to create or control visuals from host UI:

```ts
const imageId = visuals.createImage({
  uri: "assets/photo.png",
  alt: "A mountain",
  intrinsicWidth: 1920,
  intrinsicHeight: 1080,
  frame: { x: 100, y: 100, width: 640, height: 360 },
});

visuals.select([imageId]);
visuals.move(20, 10);
visuals.resize(800, 450);
```

The class also exposes `create`, kind-specific create methods, `update`,
`getSelection`, `duplicateSelection`, `deleteSelection`, `group`, `ungroup`,
`clearSelection`, `align`, `distribute`, `reorder`, and `setTool`.

Equivalent core commands are registered under `edgeless.visual.*`,
`edgeless.selection.*`, and `edgeless.tool.set`; see `EdgelessVisualCommandMap`
for exact payload/result types. Mutations use first-class document elements and
therefore participate in snapshots, collaboration, clipboard, and undo.

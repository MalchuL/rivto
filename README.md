# Rivto

Rivto is a React block editor with Yjs-backed content and shared page and
edgeless views. The package also exports the canonical `DocumentModelImpl`,
lower-level CRDT interfaces, and a temporary schema-v1 compatibility model.

## Install

```sh
pnpm add @chulane/rivto react react-dom yjs
```

## Editor

```tsx
import { createRivtoEditor, RivtoEditor } from "@chulane/rivto";

const editor = createRivtoEditor({
  initialContent: [
    { type: "heading", content: "Hello Rivto" },
    { type: "paragraph", content: "Type / for commands." },
  ],
});

export function Page() {
  return <RivtoEditor editor={editor} />;
}
```

The installed package version is available as `RIVTO_VERSION`.

The editor includes paragraphs, three heading levels, bulleted, numbered and
check lists, quotes, code, dividers, images, files, Markdown formatting, slash
commands, undo/redo, nesting, a page view, and an edgeless view. The editor
depends only on the `CRDTDoc` abstraction; native Yjs objects never enter the
editor API. To attach a provider, pass the Yjs adapter through `document`:

```ts
import { createRivtoEditor, YjsDoc } from "@chulane/rivto";

const document = new YjsDoc("room-id");
const editor = createRivtoEditor({ document });
```

## Custom blocks and plugins

Plugins are trusted local modules and may be registered at creation time or at
runtime.

```tsx
import { z } from "zod";

const dispose = editor.registerPlugin({
  id: "acme.alerts",
  blocks: [{
    type: "alert",
    title: "Alert",
    content: "inline",
    propSchema: z.object({ tone: z.enum(["info", "warning"]).default("info") }),
    slash: { title: "Alert", aliases: ["notice"], group: "Custom" },
    render: ({ block, content }) => (
      <aside data-tone={block.props.tone}>{content}</aside>
    ),
  }],
  commands: {
    insertAlert: (editor) => editor.insertBlock({ type: "alert" }),
  },
});

dispose();
```

Unknown block types remain in snapshots and render as recoverable placeholders.

## Persistence and migration

`editor.getSnapshot()` returns lossless schema-v3 JSON. Restore it with
`editor.loadSnapshot(snapshot)`. Use `migrateDocumentBundleV1` to convert the
legacy numeric-order bundle without mutating the source bundle.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check-types
pnpm lint
pnpm test -- --runInBand
pnpm demo:build
pnpm test:e2e
```

`test:e2e` runs Chromium and Firefox. Release environments with Playwright's
WebKit system libraries installed should run `pnpm test:e2e:all`.

The implementation roadmap and remaining hardening work are tracked in
[`docs/editor-v1-plan.md`](docs/editor-v1-plan.md).

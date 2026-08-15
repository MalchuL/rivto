# Documentation architecture

## Purpose

The documentation application lives in `docs/` beside its canonical Markdown files. It provides a browser-based Tiptap editing experience without introducing a database or a second persisted document format.

## Content flow

```text
Markdown file → Tiptap Markdown parser → editable document
editable document → Tiptap Markdown serializer → Markdown file or download
```

## Runtime modes

- During `pnpm docs:dev`, a Vite development plugin discovers Markdown files and provides guarded local saves. Each save checks the file modification time to avoid overwriting external changes.
- During `pnpm docs:build`, Markdown is bundled into a static browser application. Static deployments cannot overwrite repository files, so edited pages are downloaded as Markdown.

The static result can be opened through `pnpm docs:preview` and deployed by serving `docs/dist/`.

## LLM access

The same Vite plugin publishes `/llms.txt` as a concise machine-readable index. Every canonical source page is also served without the editor shell at `/markdown/<page-path>` in both development and production builds. Package and application pages are promoted into their own sections of the generated index.

## Navigation and creation

The application currently has one documentation root named **Rivto**. Every Markdown page and folder uses a numeric prefix such as `10-packages.md` or `20-apps/10-demo.md`; siblings are ordered by the parsed number rather than alphabetically.

A page and directory with the same basename form one parent page with nested navigation. For example, `10-packages.md` owns the pages inside `10-packages/`. The editor toolbar creates either a sibling page at the current level or a child inside the selected page's matching directory. New pages receive the next available prefix in increments of ten.

Additional roots should be introduced only when another independently owned product requires one.

## Pasted images

Pasting a supported browser image into the editor stores it beneath the selected page's same-named directory. For example, an image pasted into `10-packages/10-rivto.md` is written to `10-packages/10-rivto/assets/`. The Markdown retains a portable path relative to its page, while development and production serve a mirrored copy under `/markdown/` for browser rendering.

PNG, JPEG, GIF, WebP, and AVIF are accepted up to 10 MB. SVG is intentionally rejected because active SVG content is unsafe to serve from the documentation origin.

Clipboard extraction checks both browser `DataTransfer.items` and `DataTransfer.files`, because copied filesystem entries vary by operating system. Images can also be dropped onto the editor or selected through **Add image**. A clipboard that exposes only `file://` text cannot be dereferenced by the browser and must use the file picker or drag-and-drop fallback.

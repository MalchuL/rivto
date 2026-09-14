# Rivto desktop

An offline Electron text editor built from the demo's public Rivto APIs. All implementation lives in this app; the editor packages and demo are unchanged.

## Run

Install this app and its linked Rivto packages without changing the repository's
root workspace:

```sh
pnpm --dir app/rivto-editor install
pnpm --dir app/rivto-editor dev
```

This builds and opens the app. Subsequent launches can use
`pnpm --dir app/rivto-editor start`. No Next.js app, database, network service,
or development server is needed. The app's own `pnpm-workspace.yaml` includes the
existing packages as read-only build dependencies; no root workspace edit is needed.

```sh
pnpm --dir app/rivto-editor check-types
pnpm --dir app/rivto-editor lint
pnpm --dir app/rivto-editor test
pnpm --dir app/rivto-editor test:smoke
pnpm --dir app/rivto-editor package
```

Node 22.6+ is required for the dependency-free TypeScript tests. The smoke test requires a graphical desktop and the built app. It uses temporary documents and an isolated Chromium profile. Packaging creates `release/Rivto-<platform>-<arch>` with the installed Electron runtime and bundled app; run its `electron` / `electron.exe` / `Electron.app`. It deliberately refuses to overwrite an existing release directory.

## Writing and files

- Page and canvas modes; Markdown paragraphs, nested lists, tasks, collapsing, slash commands, undo/redo, Kanban, tables, columns and Bento.
- New, Open, Save, Save As and Markdown export use native dialogs. JSON preserves the complete snapshot, including collapsed descendants, canvas geometry and plugin data. Raw demo v6 snapshots are accepted too.
- Unsaved changes are checked before New, Open and Close. Canceling a dialog never marks a file saved. Existing files are fingerprinted to detect outside changes; use Save As when a conflict is reported.
- Writes use a synchronized temporary file and atomic rename. Files larger than 32 MB, trees deeper than 100 levels and documents over 50,000 blocks are rejected on import.
- A local recovery draft is updated when content or title changes and restored after an unexpected exit. Recovery storage errors are shown explicitly. A recovered draft uses Save As so it cannot silently overwrite a file changed since the last session. Normal close clears the draft after save/discard confirmation. Keep JSON copies as durable backups; recovery uses Chromium local storage and is subject to its quota.
- Settings persist editor width (560–1440 px) and editor shortcut overrides. `Primary` means Command on macOS and Ctrl elsewhere. Conflicting editor bindings appear in the settings table. The application file shortcuts are reserved.

| Action | Shortcut |
| --- | --- |
| New | Primary+N |
| Open | Primary+O |
| Save | Primary+S |
| Save As | Primary+Shift+S |
| Export Markdown | Primary+Shift+E |
| Settings | Primary+, |

## Markdown rules

Root writing blocks keep their Markdown source without added bullet markers. Explicit task and numbered-list properties are preserved. Descendants become indented list items, even under collapsed blocks. Multiline content and fenced code stay within their list item.

Kanban columns become table headers and cards become rows, with empty cells for uneven columns. Tables use the first row as headers. Pipes and HTML in table cells are escaped; nested card/cell content uses HTML lists inside cells because pipe tables cannot contain native multiline Markdown lists. Columns and Bento become readable hierarchies. Markdown readers without inline HTML support may show reduced table-cell formatting. Textual canvas content is appended; visual positioning, drawings and connector geometry are retained only in JSON.

## Release scope

The renderer is isolated and sandboxed, Node integration is disabled, IPC senders and file grants are checked, navigation is blocked, and only HTTP(S) links may open externally. See [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

The unpacked artifact is suitable for local use and testing. Public distribution still needs an up-to-date Electron release, signed/notarized installers, platform QA, and a release/update process. This app uses the workspace's existing Electron dependency; no claim of signed or independently security-audited distribution is made.

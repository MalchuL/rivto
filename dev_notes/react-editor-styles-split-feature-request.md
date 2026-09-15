# React editor stylesheet split feature request

> **Status: proposed feature change — not implemented.**
>
> This report proposes reorganizing `@chulane/rivto-react` CSS into focused
> source files while preserving one public stylesheet import. It does not
> propose a StyleX migration or any visual changes.

## Summary

Split `packages/react-rivto-editor/styles.css` into feature-owned CSS files and
retain `@chulane/rivto-react/styles.css` as the package's single public import.
The public entry becomes a small ordered list of CSS `@import` statements, so
applications do not need to know which internal files implement the standard
editor theme.

Current consumer code remains valid:

```ts
import "@chulane/rivto-react/styles.css";
```

This is a source-organization change. It must preserve selectors, declaration
order, specificity, cascade behavior, custom properties, and rendered output.

## Motivation

The current package stylesheet is over 2,000 lines and combines unrelated
responsibilities:

- shared custom properties;
- page surface and recursive block structure;
- block slots, list controls, selection, and drag feedback;
- Markdown rendering and syntax highlighting;
- slash-menu presentation;
- edgeless canvas, cards, selection, and resize controls;
- edgeless visual creation and property controls;
- Kanban presentation;
- Bento presentation.

This makes feature work harder to review and increases the chance that a
change is placed far from the React component or extension that owns it.

Columns and Table currently solve the same organizational problem differently:
they store CSS in template strings inside their extension modules and mount
`<style>` elements at runtime. Those styles should also become ordinary CSS
files. Runtime style injection is unnecessary for static rules, can duplicate
global style elements when multiple editors are mounted, and is less convenient
for CSS tooling and browser inspection.

## Proposed file layout

```text
packages/react-rivto-editor/
  styles.css
  styles/
    tokens.css
    page.css
    markdown.css
    slash.css
    separator.css
    edgeless.css
    edgeless-visuals.css
    columns.css
    table.css
    kanban.css
    bento.css
```

Ownership should follow the React package structure:

| File | Responsibility |
| --- | --- |
| `tokens.css` | Public `--rivto-*` defaults shared across features. |
| `page.css` | Page surface, recursive block rows and children, slots, lists, selection, and page drag UI. |
| `markdown.css` | Markdown editor/preview, code blocks, highlight tokens, and unknown-block fallback. |
| `slash.css` | Slash-menu overlay, groups, items, states, and empty result. |
| `separator.css` | Built-in separator block. |
| `edgeless.css` | Viewport, plane, block cards, zoom UI, block selection, movement, and resizing. |
| `edgeless-visuals.css` | Drawings, connectors, stickers, shapes, labels, toolbars, property controls, and snap guides. |
| `columns.css` | Columns container, lanes, empty state, and settings panel. |
| `table.css` | Table rows/cells, add controls, column width, and resize affordances. |
| `kanban.css` | Board, lanes, cards, summary, dialog, and add controls. |
| `bento.css` | Bento container, tiles, summary, and resize handles. |

The exact boundary between `edgeless.css` and `edgeless-visuals.css` should be
chosen by following the owning components. Shared rules stay in
`edgeless.css`; rules needed only by `edgelessVisualsExtension` move to
`edgeless-visuals.css`.

## Public stylesheet entry

`styles.css` remains at the package root but contains only ordered imports:

```css
@import "./styles/tokens.css";
@import "./styles/page.css";
@import "./styles/markdown.css";
@import "./styles/slash.css";
@import "./styles/separator.css";
@import "./styles/edgeless.css";
@import "./styles/edgeless-visuals.css";
@import "./styles/columns.css";
@import "./styles/table.css";
@import "./styles/kanban.css";
@import "./styles/bento.css";
```

The order must match the current monolithic stylesheet initially. Moving rules
between cascade positions or rewriting selectors is outside this feature.
Bundlers may combine these files in production, but correctness must not depend
on bundler-specific concatenation.

## Package publishing

The existing public export remains unchanged:

```json
{
  "exports": {
    "./styles.css": "./styles.css"
  }
}
```

The package's `files` list must include the new `styles` directory:

```json
{
  "files": [
    "dist/esm",
    "styles.css",
    "styles",
    "docs"
  ]
}
```

No other Rivto package requires a stylesheet dependency or import. Styling
remains owned exclusively by `@chulane/rivto-react`.

Internal CSS subpaths should not be added to `exports` in the first change.
They are implementation details, and publishing them as public entry points
would create a compatibility obligation before a real consumer needs granular
loading.

## Extension changes

Move the static `COLUMNS_STYLES` and `TABLE_STYLES` template strings into
`styles/columns.css` and `styles/table.css`. Remove their `ColumnsStyles` and
`TableStyles` React components and the corresponding
`runtime.extensions.mount(...)` calls.

Kanban and Bento rules already live in the package stylesheet and only need to
move into their respective files.

The extensions remain optional at the JavaScript behavior level. Their small
static CSS payload is included by the single package stylesheet even when an
application does not install those extensions. Feature-level CSS loading can
be introduced later if bundle measurement shows that this payload matters.

## Consumer impact

There should be no source change in existing consumers. These imports continue
to work:

```ts
import "@chulane/rivto-react/styles.css";
```

The existing Vite and Next.js workspace aliases continue to target the root
`styles.css` entry. Because its relative imports resolve inside the package,
they do not require one alias per internal stylesheet.

Applications remain free to import their own stylesheet after Rivto and
override the documented surface classes and `--rivto-*` custom properties.
The split must preserve that import order.

## Non-goals

This feature does not:

- introduce StyleX, CSS Modules, Sass, PostCSS, or another dependency;
- rename existing classes or data attributes;
- generate class names;
- change component markup;
- redesign colors, spacing, typography, or responsive behavior;
- make every optional extension a separate public CSS import;
- move styling into the non-React Rivto packages;
- refactor selectors merely because they can be written differently.

StyleX remains a separate architectural decision. Rivto relies on structural
selectors, `:has(...)`, pseudo-elements, generated Markdown descendants,
highlight-token classes, SVG selectors, and stable DOM hooks used by editor
logic and E2E tests. Converting those rules would be substantially broader than
splitting a source file and would require changes to package compilation and
consumer build pipelines.

## Implementation sequence

1. Create the `styles/` directory and the focused CSS files.
2. Move rules without changing their text or relative order.
3. Replace the root stylesheet contents with the ordered imports.
4. Move Columns and Table template-string rules into their CSS files.
5. Remove the two runtime-mounted style components.
6. Add `styles` to the package's published files.
7. Build the packed package and confirm every imported CSS file is present.
8. Run visual interaction coverage in page and edgeless modes.

The initial commit should be mechanical. Token cleanup, selector changes, and
theme work should happen in later commits so regressions remain attributable.

## Acceptance criteria

- `packages/react-rivto-editor/styles.css` is a small aggregate entry rather
  than a monolithic implementation file.
- A consumer imports exactly one Rivto stylesheet for the complete default UI.
- Existing `@chulane/rivto-react/styles.css` imports require no migration.
- The published package contains every file referenced by the root stylesheet.
- Columns and Table do not mount static `<style>` elements at runtime.
- Multiple editors on one page do not introduce duplicate extension style
  elements.
- Page and edgeless rendering match the behavior before the split.
- Host CSS loaded after Rivto can still override public classes and custom
  properties.
- Reduced-motion and narrow-viewport media rules remain effective.
- Production builds succeed for the demo, web application, and desktop
  application.

## Validation

Run focused React tests first, followed by package and integration validation:

```sh
pnpm --filter @chulane/rivto-react test
pnpm check-types
pnpm lint
pnpm demo:build
pnpm test:e2e
```

The E2E pass should cover at least:

- page block selection, nesting, dragging, and collapse controls;
- Markdown preview and code highlighting;
- slash-menu placement and active state;
- edgeless cards, visual objects, selection, resizing, and toolbars;
- Columns, Table, Kanban, and Bento in page and edgeless modes;
- multiple editors mounted simultaneously.

Package validation should also inspect the publish artifact, not only the
workspace source tree, because missing CSS files can be hidden by workspace
aliases during development.

## Risks and mitigations

### Cascade order changes

Splitting files can accidentally reorder rules. Preserve the current order in
the aggregate entry and avoid selector edits during the move.

### Missing published files

The current package allowlist names only the root stylesheet. Add the complete
`styles` directory and inspect a package tarball or equivalent packed output.

### CSS imports resolved differently by applications

Use relative imports from the package root stylesheet. Do not require consumers
or workspace aliases to resolve every internal file as a package export.

### Runtime-style removal changes timing

Columns and Table will be present in the static stylesheet before their
extensions mount. Their selectors are feature-specific, so they have no effect
without matching block markup. Verify multiple-editor and extension teardown
tests to confirm that no behavior depended on style-element lifetime.

## Future option: granular feature imports

If production measurements later justify excluding unused feature CSS, add
explicit stable exports such as:

```json
{
  "exports": {
    "./styles.css": "./styles.css",
    "./styles/base.css": "./styles/base.css",
    "./styles/edgeless-visuals.css": "./styles/edgeless-visuals.css",
    "./styles/kanban.css": "./styles/kanban.css"
  }
}
```

That would intentionally trade the current one-import experience for granular
loading. It should be driven by measured CSS cost and a documented mapping from
each extension to its stylesheet, not added speculatively.

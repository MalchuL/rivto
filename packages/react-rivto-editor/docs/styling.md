# Styling, Tailwind, and shadcn/ui

`@chulane/rivto-react` uses shadcn/ui primitives and colocated feature CSS.
Tailwind CSS v4 supplies theme tokens and compiles utilities, including `@apply`
in feature stylesheets. Static appearance belongs outside behavior and JSX. This document explains the stylesheet entry, the design
tokens hosts can override, when to write utilities versus CSS, and how to add
or refresh shadcn primitives.

## Consuming the stylesheet

Published consumers import the compiled bundle once:

```ts
import "@chulane/rivto-react/styles.css";
```

`pnpm build` (or `pnpm --filter @chulane/rivto-react build:styles`) compiles
`src/styles/index.css` to `dist/styles.css` through `@tailwindcss/cli`. The
bundle is self-contained: hosts do not need Tailwind installed, and the package
does not ship Tailwind preflight, so host typography and rendered Markdown keep
their user-agent defaults.

Workspace apps that already run Tailwind compile the source entry directly, so
class edits hot-reload without a package build:

| Consumer           | Integration            | Alias for `@chulane/rivto-react/styles.css`        |
| ------------------ | ---------------------- | -------------------------------------------------- |
| `demo/`            | `@tailwindcss/vite`    | `packages/react-rivto-editor/src/styles/index.css` |
| `app/web`          | `@tailwindcss/postcss` | same source entry via `next.config.ts`             |
| `app/rivto-editor` | `@tailwindcss/vite`    | same source entry via `vite.config.ts`             |

## Stylesheet layout

```text
src/styles/index.css   entry: layers, Tailwind imports, @source, feature imports
src/styles/tokens.css  --rivto-* tokens and the @theme inline palette mapping
src/styles/base.css    scoped preflight subset for chrome
src/**/<feature>.css   colocated structural rules, one per feature
```

`index.css` declares the cascade order `theme, base, components, utilities`,
imports `tailwindcss/theme.css` and `tailwindcss/utilities.css` into their
layers, scans the package source with `@source "../"`, and imports each
structural feature stylesheet into `layer(components)`. Edgeless `controls.css`
shares `layer(utilities)` with shadcn defaults; selectors with `[data-slot]`
let feature controls override the primitives without editing vendored files.
Because everything the package
emits is layered, unlayered host CSS loaded after the bundle still wins over
every rule and can retheme any token.

## Whole-block selection backgrounds

Page owns the selected block marker and the outline around its complete subtree.
The host supplies `--rivto-block-selection-background` (`#e5dfff` by default).
While selected, Page exposes that value as the inherited
`--rivto-block-selection-fill`. Layout surfaces with opaque backgrounds consume
this value before their ordinary background, for example:

```css
.rivto-bento-tiles {
  background: var(--rivto-block-selection-fill, var(--rivto-block-own-background, var(--rivto-bento-background, var(--rivto-secondary))));
}
```

Read this fill in container and card backgrounds; do not set it on individual
children or blend a layer over their text. Removing selection restores each
background through its fallback. Controls can retain their semantic foregrounds
and status colors. Nested selected blocks do not draw additional outlines.

## Design tokens

`tokens.css` declares every public custom property on `:root`. Hosts retheme
by redefining a handful of variables on any ancestor:

```css
.my-app {
  --rivto-accent: #0c66e4;
  --rivto-background: #0f1115;
  --rivto-foreground: #e6e6ea;
  --rivto-secondary: #242733;
  --rivto-muted: #303440;
  --rivto-muted-foreground: #afb3c2;
}
```

Bento, Kanban and TODO storage use `--rivto-secondary` for their default surface.
New and converted blocks leave the background color unset. The block menu’s
**Theme default** removes an explicit color, including colors saved by older
versions. **No color** saves explicit transparency. Switching a host theme
requires only changing its CSS variables.

Token groups:

| Group                                                                                                                                                                                                                                                                        | Purpose                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--rivto-accent`, `--rivto-background`, `--rivto-foreground`, `--rivto-card*`, `--rivto-popover*`, `--rivto-primary*`, `--rivto-secondary*`, `--rivto-muted*`, `--rivto-subtle*`, `--rivto-destructive`, `--rivto-border`, `--rivto-input`, `--rivto-ring`, `--rivto-radius` | Semantic palette. `@theme inline` maps these onto Tailwind's `bg-background`, `text-muted-foreground`, `ring-ring`, `rounded-lg`, ... so shadcn primitives and package utilities share one theme, including chrome rendered in portals. |
| `--rivto-default-block-height`, `--rivto-block-surface-padding`                                                                                                                                                                                                              | Block height and padding for pages and embedded surfaces.                                                                                                                                                                               |
| `--rivto-edgeless-card-padding`                                                                                                                                                                                                                                              | Padding inside canvas block cards, independent of Page padding. Defaults to `56px` on all sides.                                                                                                                                        |
| `--rivto-drop-*`                                                                                                                                                                                                                                                             | Drag and drop indicator feedback.                                                                                                                                                                                                       |
| `--rivto-code-*`, `--rivto-link-color`                                                                                                                                                                                                                                       | Markdown code blocks and links.                                                                                                                                                                                                         |
| `--rivto-kanban-*`, `--rivto-bento-background`                                                                                                                                                                                                                               | Layout containers.                                                                                                                                                                                                                      |
| `--rivto-todo-*`                                                                                                                                                                                                                                                             | TODO item and storage.                                                                                                                                                                                                                  |
| `--rivto-edgeless-*`                                                                                                                                                                                                                                                         | Canvas background, grid dots, snap guides, floating chrome shadows and panel dividers.                                                                                                                                                  |

Canvas cards no longer inherit `--rivto-block-surface-padding`; hosts that used
it to customize cards should set `--rivto-edgeless-card-padding` instead.

`--rivto-separator-children-opacity` controls the opacity of content inside a
separator's child frame. It defaults to `0.5` and accepts CSS opacity values;
set it on the editor or a separator ancestor to customize the presentation.

Add a token when a feature introduces a color or dimension a host should be
able to change; reference it from utilities with the Tailwind variable
shorthand (`text-(--rivto-todo-accent)`, `shadow-(--rivto-edgeless-chrome-shadow)`,
`bg-(image:--rivto-edgeless-panel-header)`).

## Container padding

Container child areas share `--rivto-container-padding`, defaulting to `16px` on
all four edges. Set one nonnegative CSS length on an ancestor or a particular
container; multi-value padding shorthands are not supported:

```css
.my-app {
  --rivto-container-padding: 24px;
}
```

Columns applies it around lanes and their writing lists, Kanban around lanes,
Bento around tiles, TODO storage around tasks, and Table inside cells
without separating row/cell borders. Columns writing lists and TODO storage add
their existing `24px` inline-start control reservation. Headers, card interiors
and gaps between siblings retain their own styling. Kanban card lists retain
zero padding inside the lane's existing chrome. This is presentation space,
independent of `--rivto-drop-target-size` and `dropGutterSize` interaction geometry.

## Scoped reset

shadcn primitives assume preflight's `box-sizing: border-box` and neutral form
controls. `base.css` applies only that subset, and only to elements the package
marks as chrome:

- every shadcn primitive, identified by its `data-slot` attribute, and its
  descendants;
- containers carrying `UI_SCOPE_CLASS` (`rivto-ui`, exported from
  `src/components/ui-scope.ts`): toolbars, popovers, panels, and menus built
  from plain elements.

Block content and rendered Markdown never carry the scope, so headings,
lists, and paragraphs inside documents keep user-agent margins.

## Utilities or CSS?

Keep static appearance in the owning feature's colocated `.css` file. TSX
uses short named class constants with stable `rivto-*`, `page-*`, or
`edgeless-*` hooks. Preserve existing hooks used by hosts and tests.

Use ordinary CSS declarations or `@apply` for existing theme utilities. Keep
state in selectors (`data-*`, `aria-*`, focus and hover), and dynamic geometry
such as pointer coordinates, zoom, and live preview dimensions in inline styles.
A React component and its controller must not both write the same geometry.

Feature CSS also owns recursive block-tree geometry, sibling `:has()` rules,
modal backdrops, CSS counters, SVG presentation, keyframes, gradients, and
imperatively created drag or connector previews. Each stylesheet starts with
a comment describing its scope and is imported from `src/styles/index.css`.

Structural rules belong to `layer(components)`. Control appearance that
customizes shadcn defaults belongs to `layer(utilities)`, using the control's
class and `[data-slot]` where primitive defaults must be overridden. Host CSS
can override these classes without `!important`; do not edit generated
primitives for editor-specific appearance or interaction markers.

Existing utility-based components can migrate when their owning feature is
refactored. New control code should follow the feature CSS convention rather
than introducing another long utility string into TSX.

## Icons

Icons come from `lucide-react`. Render them with `aria-hidden="true"` inside a
labelled control, and when a plain `<button>` (not a shadcn `Button`) wraps an
icon add `pointer-events-none` to the icon so the button remains the hit-test
target for drag sensors and tests.

## Adding shadcn/ui primitives

Primitives live in `src/components/ui/` and are generated by the shadcn CLI
through the package wrapper:

```sh
pnpm --filter @chulane/rivto-react ui:add button dialog
```

`scripts/shadcn-add.mjs` runs `shadcn add` with `components.json` (style
`new-york`, base color `neutral`, lucide icons) and then rewrites every `@/...`
import in the generated files to a relative path. The `@/*` alias exists only
so the CLI can resolve targets; the package is compiled from source by the
demo and `app/web`, which own different `@/` aliases, so alias imports must
not survive generation. An ESLint rule rejects `@/` imports inside the package.

Treat `src/components/ui/` as vendored: re-run `ui:add` to refresh a primitive
rather than editing it by hand, and put package-specific wrappers (such as
`ui-scope.ts` or feature components) outside that directory.

### Block dimensions

The `BlockStyle` presentation contract is exported by `@chulane/rivto-page`; Page
uses it when rendering a block's `listProps.style`. Persisted style data may also contain
unknown or malformed fields, so consumers inspect values before using them.

Block `listProps.style.size` accepts `width` and `height` as CSS lengths; unitless
values mean pixels. `heightPolicy` defaults to `grow` (minimum height); `scroll`
and `clip` fix the height and respectively scroll or hide overflow. Bento uses
`pluginData.bentoWidth` on each direct child for tile placement, clamped to
160–960 pixels. Entering Bento saves the block's previous style width in plugin
data and applies the Bento width to its style. Resizing updates both values;
leaving Bento restores the original style width. The Bento preference is ignored
outside Bento and is preserved when a block moves between boards. Placement can
also be limited by the available container width.

Bento also offers a bottom handle for height and a bottom-right corner handle
for both dimensions. The height preference and overflow policy are retained in
plugin data, while the previous style height and policy are restored on exit.
Shrinking below the content switches an unset or `grow` height policy to `scroll`;
an explicitly chosen `scroll` or `clip` policy is preserved. Handles support arrow
keys, Shift for larger steps, and Escape to cancel an active pointer resize.
Custom block layouts can use `BlockResizeHandles` with selected `edges`, including
corners, to expose only the directions they support.

Kanban columns use the block style width and the same resize controls. Their default
layout shares available space with a 240-pixel preferred width; an explicitly
sized column uses its preferred width clamped to 160–960 pixels. The board
remains horizontally scrollable when its columns do not fit.

`widthPolicy` may be `grow`, `scroll`, or `clip`. When omitted, the width keeps
its existing fixed-width behavior. `grow` uses the width as a minimum and grows
with content up to the available width; Bento also caps it at 960 pixels. `scroll`
and `clip` retain the specified width and respectively scroll or hide horizontal
overflow. Ordinary text wrapping remains controlled by its renderer. Browsers may
compute visible overflow on one axis as `auto` when the other axis is scrollable
or clipped.

### Floating panels and sortable content

`Popover`, `Dialog`, `DropdownMenu`, and `Tooltip` render through a Radix
popper: a portalled, `position: fixed`, transformed wrapper. Keep `@dnd-kit`
sortables out of those panels. The keyboard sensor derives document offsets
from the `offsetParent` chain when a drag starts, which is wrong inside a
fixed wrapper, so picking up a row scrolls the page away and the sortable
loses its drop targets. Use an in-flow disclosure instead (`Collapsible` with
an absolutely positioned panel, as `TodoStorageMenu` does) whenever a menu
hosts draggable rows.

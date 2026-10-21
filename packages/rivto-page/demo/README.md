# Rivto Page standalone demo

From the workspace root:

```sh
pnpm --filter @chulane/rivto-page demo
```

Open the [small document](http://127.0.0.1:5184) or the
[large document](http://127.0.0.1:5184/?repeat=200): 1000 displayed blocks and 200 child
nodes, without virtualization. Vite uses package sources; a separate watch/build
is not required.

The demo session creates a `BlockEditorController` with a data-only `DemoAdapter`
and renders `<BlockEditor editor={editor}>`. The adapter is an in-memory example host: it does not use the canonical model, ReactEditor, or
EditorPanel. The concrete renderer owns a shadcn Textarea with native editing and
reads its own text; Page receives structural snapshots. Reloading resets the data.

You can check:

- All five listType values, clearing the list type, checked, collapsed, and block background.
- Text changes, snapshot state, and stable node object identity.
- Block selection and display-list reordering without replacing node objects.
- Dynamic renderer installation/removal for every fifth displayed block.
- The "Demo slot" toggle: installing/removing an end slot that reflects selection.
- Editor unmount/remount while retaining host data, editor registrations, and node identities. After unmounting, click
  "Refresh statistics": subscriptions should be 0.

Checkboxes, numeric markers, and collapse controls are registered through
editor.slots in a synchronous extension. Collapsing hides descendants and releases their subscriptions;
data and cached nodes remain. CSS counters compute numbers separately for the display list and
each child group, including start/continue modes and DOM reordering. This demo
covers the structural layer without production rich text, navigation, drag and drop,
clipboard, or undo. Clearing listType preserves checked, matching the low-level node command.

Statistics refresh only on demand; the toolbar does not subscribe to document changes.
commandMs measures the last synchronous write, including notifications; it excludes
the subsequent React commit/layout. Reset counters, perform an operation, and then
refresh statistics. Installing a renderer or reordering displayed blocks naturally affects more
than one block. The displayed subscription count covers DemoAdapter's own sources;
unit tests also check the separate registry subscription lifecycle.

Check the production build in Chromium and Firefox:

```sh
pnpm --filter @chulane/rivto-page demo:build
pnpm --filter @chulane/rivto-page demo:test
pnpm --filter @chulane/rivto-page demo:performance
```

Behavior tests use `--workers=12`; measurements use `--workers=1 --trace off`.
Performance runs disable DOM tracing because its snapshots distort interaction timings
on large fixtures; behavior runs retain the configured diagnostic tracing. Playwright starts
a preview on port 5184 automatically: stop any development server on that port first.
For an existing production preview, set `PLAYWRIGHT_BASE_URL`.
The performance scenario changes a real select with ArrowDown/Home and checks its
snapshot, stable node identity, zero display-list reads, and bounded node reads at both sizes.
It records commandMs separately from the time between change and two animation
frames; this is a rendering proxy, not the complete latency of opening a native
dropdown. Separate pointer scenarios exercise checkbox and collapse controls,
including mounted descendant counts and targeted reads.

`node.color` / `node.setColor(...)` specify a resolved CSS background value. The demo
owns the named gray/red/orange/yellow/green/blue/purple choices in constants.ts.
Its controls translate a selected name into a CSS expression before calling the node
command; the adapter validates that example value. Default sends null and removes
the local override; text retains its color. A future production adapter must resolve
persisted listProps.backgroundColor tokens into CSS values and own any reverse
mapping when applying a color command. Page receives no palette names or registry.
The example CSS expressions can reference demo-owned --demo-color-* variables;
these are not package theme parameters. The demo does not supply required geometry
variables or CSS from react-rivto-editor. The concrete renderer does not style the
block background.

Structural CSS is imported separately as `@chulane/rivto-page/styles.css`. The demo
imports its source; published consumers import dist. `BLOCK_EDITOR_CLASSES` exports
six names: block, row, content, children, slot, and marker.

Layout and the common background are configurable through BlockEditorThemeProvider;
the "Compact layout" toggle demonstrates these parameters without structural demo
CSS. All padding/gap/indent/control/marker/start-gutter defaults belong to the package.
Concrete block color choices belong to the demo host and remain available in
compact mode. See the [complete parameter list](../README.md#geometry-parameters).

Vite/Tailwind compiles the demo chrome CSS, which is loaded as a separate style element
so the browser regression test can disable it entirely. This mode checks row padding,
root gaps, child indentation, control sizes, content alignment, and the explicitly
supplied demo palette. Another test checks theme overrides and resetting defaults
without replacing node objects. Demo CSS is limited to chrome and example forms;
structural Page component selectors are prohibited there.

UI controls use the installed shadcn Button, Checkbox, NativeSelect, Textarea, and
Badge. NativeSelect preserves native keyboard behavior and selectOption. All utility
classes use the `page:` prefix; the scoped reset applies only to Page UI primitives.
The Tailwind Vite plugin compiles the source stylesheet; published consumers need
only the finished styles.css and do not need their own Tailwind pipeline.

`DemoRoot` owns the session in an effect, creating it after commit and destroying
it on final cleanup. StrictMode replay creates a fresh session; the visibility toggle
only unmounts/remounts its borrowed view. Renderer toggles call editor.renderers;
the slot toggle installs/uninstalls a captured extension. The adapter contains no
presentation registries. A default extension observes editor focus/blur and marks
the mounted root for the browser check; moving between its controls does not emit
a whole-editor blur. Production ReactEditor wiring and keyboard dispatch remain
outside this demo.

## Container composition examples

Open `?example=kanban` (one board, three columns, six ordinary text cards) or
`?example=bento` (one board, four ordinary text tiles, two nested text children).
`&repeat=200` creates 2000 Kanban or 1400 Bento nodes, without virtualization.
The existing default outline fixture remains unchanged for baseline comparisons.

Container JSX lives in container-layouts.tsx. Kanban composes its title before the
columns and puts the add button in the actual shared child host. Bento composes
its children before the title and sizes each tile through BlockDropWrapper's public style.
Width choices are host data; the Page adapter has no container-specific fields or
mutation commands. Buttons and controls reuse the installed shadcn primitives.
All required primitive/counter/gap geometry ships in the package stylesheet.

Enable "Inspect drop zones" to see the current geometry-selected inside/between
candidate. The overlay ignores pointer events. Each frame does one browser hit test
and measures only the selected region for debug drawing; the editor tree receives
no pointer-driven React state updates. This inspector does not execute a move.
Browser coverage includes clipping, canonical neighbors after insertion, item/gap
numbering, view cleanup, width changes, and disabled demo CSS. Production-preview
performance coverage measures real text input and five real pointer samples on
both small and repeat=200 fixtures in Chromium/Firefox with workers=1.

Bento uses BlockDropWrapper around each TileItem's existing block and width control.
The wrapper reserves four in-flow insertion strips around its center content; the
outer wrapper remains a single grid cell or flex item. Width choices include both
side strips. The child host has gap: 0 so the two adjacent strips supply the spacing
rather than adding a second gap. The same primitive works in CSS Grid; browser
checks switch the public child-host style to a two-column grid and then a single
column, exercise tile width changes, package theme overrides, RTL, clipping,
collapse/remount, and disabled demo CSS. Required strip geometry and content sizing
remain in the package stylesheet, not this demo.

All boundaries remain hit-testable independently of "Inspect drop zones". That
checkbox controls only pointer-transparent feedback; it does not intercept content
input or change target registrations. Both ordinary and inspected control-edge
clicks are covered. No editor activation prop or grid overlay variant remains.
Performance sampling resets toolbar counters first, restores the target's scroll
position, and checks an unobstructed point in its viewport-visible rectangle before
starting pointer timing. Tall Kanban gaps must not be sampled at offscreen centers.

"Demo wrapper" dynamically installs an extension through
editor.wrappers.register({ component, priority: 100 }). The decorator owns an ordinary
BlockItem element with its own data-demo-wrapper ID and pointer-capture handler.
Clicking its content sets data-demo-wrapper-pointer only on the nearest wrapper;
nested blocks retain their own elements. There is no shared BlockView ref/provider.
Counter ownership remains on the outermost item for each node, including when a
registered decorator sits inside an existing Bento placement wrapper.

Browser checks cover registration/removal, pointer handling, counters, data retention,
and enabling the feature while the editor view is unmounted. Native text input is
measured at normal size and repeat=200 with the wrapper installed, separately from
the default baseline. BlockDropWrapper continues to own concrete tile boundaries
through the item layout; BlockWrapper is independent from that implementation.

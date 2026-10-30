# BlockWrapper with in-flow insertion boundaries

Status: implemented and verified in the autonomous Page package; production integration remains pending.

This report records the initial concrete insertion frame. That primitive is now
named BlockDropWrapper; generic registered BlockWrapper decorators are described
in rivto-page-wrapper-registrations-ru.md. The earlier no-registry decision below
is historical and superseded by that explicit extension requirement.

## Goal and ownership

Replace tile-edge overlays with a public `BlockWrapper` placement primitive that
reserves real space around its already-rendered child. Boundaries remain native
hit-test targets at all times and never cover renderer controls or text.
Remove `BlockEditorProps.dropTargetsActive` and its root attribute/CSS activation.
The inspector controls feedback only; it does not alter editor geometry or input.

The wrapper composes the existing `BlockItem`, retaining its one sibling counter,
canonical placement context, keyed child identity, and normal ref forwarding.
It must not create another BlockNode, data-block-id, node facade, global subscription,
or drag session. The controller owns the registry; each boundary owns only the
disposer returned by register. Borrowed node/manager APIs remain narrow.

## Geometry review

One wrapper is one cell/flex item. Its internal three-by-three CSS Grid contains
content in the center and four non-overlapping boundary regions. Top/inline-start
mean before; bottom/inline-end mean after. Corners belong to top/bottom boundaries.
Logical inline placement must work in RTL without pointer-time measurement.

`--rivto-drop-gap-size` controls each strip thickness (default 8px). The declared
wrapper width includes both side strips; the renderer receives the remaining
width. Adjacent wrappers contribute two strips, producing a default 16px content
gap. A layout using wrappers sets its public child-host gap to zero; it must not
also insert flow gaps. Existing outline/flow layouts retain BlockDropGap and their
current spacing. Explicit additional host gap remains allowed but is additive.

Boundaries stop at the wrapper box; they do not extend into arbitrary CSS gaps.
Empty containers retain explicit inside targets. Boundaries and content must remain
interactive simultaneously, with no activation flag, z-index, absolute positioning,
or scans of all targets. Browser hit testing still handles clipping and occlusion.

## API review and alternatives

Add BlockWrapper with native placement attributes/ref and already-rendered children,
composing BlockItem rather than duplicating its counter/subscription implementation.
Do not add a decorator registry: there is a present JSX placement hook, BlockChildren.item.
Keep BlockDropGap for vertical/horizontal flow. Remove its obsolete grid variant
and implementation rather than retaining a second way to create overlay targets.
Canonical neighbors are taken from BlockChildren, never inferred from CSS rows.
No index/cache or DnD gesture/mutation API is required for this geometry change.

## Stages and acceptance criteria

1. Capture current production small/large measurements and the control-edge failure
   with inspection enabled before changing runtime code.
2. Implement the wrapper and its colocated package CSS. Migrate Bento and remove
   the grid-overlay variant, activation prop, CSS variable, and demo coupling.
3. Update unit/browser coverage for geometry, canonical reorder, identity/counters,
   refs, cleanup/StrictMode, explicit inside targets, RTL, wrapping, resizing, clipping,
   collapse/unmount, disabled demo CSS, and public thickness overrides. Verify targets
   and content are hit-testable at the same time, independently of the inspector.
4. Build exports/styles and demo, run types/lint/unit tests, behavior tests in both
   browsers with 12 workers (serial rerun for failures), then production small/large
   performance tests with one worker. Inspect ownership separately from test results.
5. Update package/demo usage and replace active overlay rules in package guidance.
   Keep earlier performance measurements as historical evidence, clearly superseded.

This remains structural DnD groundwork. Source permissions, actual drag gestures,
move commits, undo, virtualization, and production ReactEditor integration remain
separate migration stages.

## Implementation and verification

Implemented BlockWrapper and its private boundary component with colocated CSS.
The primitive composes BlockItem, forwards native props/ref, and renders its supplied
children once inside the center track. It is exported in built ESM/types and shipped
CSS. Removed the grid BlockDropGap variant and the editor activation prop, root
attribute, CSS variable, and demo coupling. Updated package guidance and usage.

The pre-change control-edge check failed in both browsers with workers=12 and again
with workers=1: elementFromPoint returned the old overlay rather than the width
select's bottom three pixels while inspection was enabled. The same check passes
with the wrapper. Tests independently verify boundary hit testing without inspection,
non-overlap with center content, 8px default tracks, a public 18px override, zero
additional host gap, RTL, canonical neighbors, cell counts, resizing, clipping,
collapse/remount, stable node identity, counters, refs, and exact registration cleanup.

Final checks: 87 unit tests across 8 suites; 44 behavioral browser cases with 12
workers; 20 production performance cases with one worker and tracing disabled.
Type checking, lint (no warnings), package build, demo build, built export/CSS checks,
and formatting checks passed. The final behavior run had no failures requiring a
serial retry. Desktop and 390px Bento screenshots were inspected; no page errors or
horizontal document overflow occurred. Browser measurements used a dedicated Vite
production preview at port 5190, unchanged fixtures, and no virtualization.

Bento text edits at repeat=1 and repeat=200 retained 22 addressed reads and 4
notifications. Five pointer samples retained 5 reads, no display-list reads, and
zero notifications. Kanban retained 15/2 for text and 5/0 for pointer samples.
No new geometry index, observers, or pointer-time full-tree scans were introduced.

Pointer-to-two-animation-frame proxies, in milliseconds (median and range):

| Browser  | Bento repeat | Before           | After            |
| -------- | ------------ | ---------------- | ---------------- |
| Chromium | 1            | 16.6 (16.6–16.7) | 16.6 (16.5–16.7) |
| Chromium | 200          | 15.7 (0.7–35.0)  | 0.4 (0.3–40.0)   |
| Firefox  | 1            | 16 (15–17)       | 17 (16–18)       |
| Firefox  | 200          | 39 (38–48)       | 40 (38–44)       |

Chromium's wide/near-zero frame-proxy samples do not establish a rendering speedup;
no such claim is made. Firefox large-fixture frame cost remains present despite
constant data access. These checks validate behavior and bounded addressed work,
not a universal latency guarantee. Raw runs remain in /tmp/rivto-wrapper-*.log.

Ownership review: BlockChildren supplies canonical placement; BlockWrapper composes
one existing BlockItem; BlockItem retains its addressed node subscription/counter;
BlockDropTarget retains only its own registration disposer and latest committed
destination; the existing controller/extension owner retains registry cleanup.
No teardown or attachment capability was added to borrowed node or editor APIs.
Resolver behavior, hierarchy validation, nested editor boundaries, and native browser
clipping remain unchanged. Actual DnD gestures and production integration were not
implemented or exercised by this change.

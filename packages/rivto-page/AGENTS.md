# Rivto Page package rules

## Surface independence

Do not pass editor/surface mode into the adapter, slot props, or registrations.
The host chooses contributions for its surface and supplies any application
context through its own wrappers or providers. Slot predicates depend on the
bounded owner context; Page must not branch on page/edgeless surface names.

## Editor and adapter ownership

Adapters supply data access, mutation, and addressed subscriptions only. Keep slots,
renderers, extension setup, and editor event observers on BlockEditorController.
Hosts pass plain registrations and callbacks to its managers; they do not implement
presentation registries or pass their whole ReactEditor/panel/document to Page.
Concrete block components remain host-owned.

The host creates/configures the editor outside React render and owns final destroy.
BlockEditor borrows an editor prop and owns only its DOM attachment and React
subscriptions. View detach/remount must preserve registrations and cached nodes.
One instance supports one concurrent view; separate instances may share data sources.
Keep manager teardown/attachment methods out of public manager interfaces.
Keep one field per manager in the controller; do not duplicate references as API
and implementation fields. The controller may use concrete manager types where it
owns their creation, attachment, and destruction. Borrowing consumers use minimal
interfaces for their actual operations. In particular, managers receiving owner
need only BlockEditorResourceOwner (assertActive and registerCleanup), not the
concrete BlockEditorExtensions implementation. Components and extension setup
borrow BlockEditorApi without allocating wrappers or casting manager types.
All borrowed node paths (controller lookup, editor API, hooks, slots, and contexts)
use BlockEditorNodeApi without destroy. Only the controller's cache retains concrete
nodes for final teardown; do not allocate node facades or weaken identity guarantees.

Attachment must reconcile focus acquired during renderer commit before event
listeners were installed. Publish the root before notifying initial focus observers
and roll back the attachment if initial notification fails.

Extensions use synchronous setup and idempotent disposers. Capture manager resources
created during setup, roll them back on setup failure, and release them after custom
cleanup on removal. Attempt all resource cleanups and report failures together.
Resources created later in callbacks require explicit feature cleanup ownership.
Subscriptions for data, registry changes, and editor events remain independent;
do not add a global rendering subscription.

## Required API and ownership review

Before completing an API or dependency change, inspect creation, dependency passing,
use, and destruction throughout the affected Page code. After the final change:

1. Check all consumers and the methods they actually call. Constructor dependencies,
   context values, hook results, and extension setup parameters must expose only
   the capabilities needed at their boundary.
2. Identify the lifecycle owner and borrowing consumers for each changed object.
   Keep concrete types where lifecycle responsibilities require them; use narrow
   interfaces for borrowed managers and resource owners.
3. Check adjacent registries, event/drop-target managers, hooks, contexts, and
   extension callbacks for the same mistake. Fix the affected chain consistently
   without refactoring unrelated features.
4. Remove duplicate references, unnecessary wrappers, boundary-bypassing casts,
   forwarding methods, and capabilities without a current consumer. Do not replace
   them with abstractions intended only for future use.
5. Review ownership and API boundaries separately from tests. Passing tests prove
   the asserted behavior, not minimal interfaces or correct ownership. Report the
   inspected boundaries and any remaining limitations independently of test results.

## JSX layout and drop-zone contracts

Keep one Page-owned BlockNode shell and shared BlockChildren traversal. Host layouts
compose BlockRow, BlockContent, BlockBody, BlockChildren, BlockItem, and drop targets
in JSX order. Concrete types must not be switched on inside Page. Custom child
layouts do not inherit outline indentation. Keep structural child-order/collapse
context independent from chrome/selection/slot updates and preserve memo boundaries.

Item components receive already-rendered children; do not mount a second block or
recurse through their renderer. Gap components receive canonical parent/neighbors.
BlockItem owns the optional placement-level counter so wrapped children do not count
twice; gap boundaries must not change list numbering. Keep their styles package-owned.

Explicit drop targets register DOM regions with real destinations. Resolve candidates
through browser hit testing and registered ancestors of the hit within one editor;
do not scan every target or measure the whole document on pointer movement. Respect
nested editor boundaries, live parent/gap validation, element replacement, and cleanup.
Grid/wrapping insertion boundaries belong to BlockDropWrapper, composed through the
existing BlockChildren.item hook. One wrapper is one outer grid cell or flex item;
its internal grid reserves strips around its already-rendered center content.
Never insert separate flow gaps as grid cells or overlay targets over text/controls.
Read canonical neighbors from the shared iterator, including after reordering.
Before maps to top/inline-start and after to bottom/inline-end; preserve RTL,
normal clipping, canonical order, and a single sibling counter owned by BlockItem.
Keep geometry in the colocated package stylesheet, sized by --rivto-drop-gap-size.
The wrapper's declared width includes both side strips. Each neighbor contributes
its own strip, so wrapper-only spacing requires zero gap on the public child host;
additional layout gap is explicitly additive and is not covered by the boundaries.
Targets remain hit-testable with or without inspection/dragging; do not add an
editor-level activation prop or inherited pointer-events switch. The inspector
controls only feedback. No pointer-time scans or global geometry measurement.
Geometry candidates are not move permissions. Add source checks and commit commands
only with actual DnD migration; do not add placeholder gesture APIs.

## Generic block decorators

BlockWrapper composes editor.wrappers around the existing single BlockView. It must
not own DnD boundaries, item sizing, concrete renderer logic, or mode switches.
Registrations require a finite explicit priority (higher outermost; installation
order breaks ties), are independently disposable, immutable,
and captured by extension setup/rollback/removal. The controller keeps one concrete
registry field; borrowed editor APIs expose only registration/snapshot/subscription.
Decorators own their elements, handlers, local refs, and listener cleanup. Do not
add a shared BlockView ref provider or composition infrastructure without a concrete
consumer requiring that exact element. Decorators render children exactly once,
do not recurse, and do not create another data-block-id. BlockView retains its
ordinary explicit ref. Use BlockItem with the existing block snapshot for counter-aware
wrappers outside child placement; nested items for the same ID must count only
once. Read item identity in BlockView at its real render position, not before the
wrapper chain is composed. Extra layout DOM must respect placement contracts.
Dynamic chain changes may remount React descendants; never claim that local state,
focus, or component instances survive them. Host data and cached node identity remain.

## Display list ownership

Keep the host-selected display IDs and their subscription in adapter.blocks.
Do not require a common parent, owner, region snapshot, or availability status.
The display list does not define persisted hierarchy: childIds describe each
node's real children. List arrays retain identity until IDs or order change;
node subscriptions remain independent from display-list subscriptions.

## Language

Write package documentation, source comments, demo UI, accessibility labels, and
test fixtures in English. Update CSS selectors and browser assertions together
when translating labels so they continue to target the same controls.

## CSS ownership and geometry

All CSS required for public Page components to work correctly belongs to this
package, either as component utilities or in its exported stylesheet. The demo
must not supply required block/row/children/slot styles, padding, offsets, control
sizes, list-counter rules, selection styling, or base UI theme defaults. Concrete
block-color palettes are optional host configuration and belong in the demo or
application; they are not required structural CSS or package-provided defaults.

Keep layout defaults in the package. Expose configurable geometry and theme values
as documented, typed parameters or CSS custom properties with package defaults.
Use the same parameters for content and controls that share an alignment boundary;
do not compensate for spacing with renderer-specific or demo-specific offsets.

Demo CSS may style its page chrome and its own example forms. It must not override
structural Page selectors or provide missing package defaults. A real consumer
must be able to import the package stylesheet and use the public components
without copying any demo CSS.

When changing geometry, verify the components with demo-only CSS disabled and
verify an override through the public layout/theme parameters. Keep the existing
behavioral and performance verification required by the root AGENTS.md.

## CSS file organization

Keep CSS rules beside the component or feature that owns them. The presentation
stylesheet is an entry point for Tailwind, theme tokens, and ordered local imports;
do not accumulate component rules there or add empty CSS files to folders without styles.

- `src/presentation/styles.css` owns Tailwind imports, source scanning, custom
  variants, layer order, and imports of the local stylesheets.
- `src/presentation/theme.css` owns shared theme tokens.
- `src/presentation/components/block-editor/` owns editor-root layout styles.
- `src/presentation/components/block-layout/` owns the block shell, background, row, child, outline, item, and list gap-boundary styles.
- `src/presentation/components/block-wrapper/` owns the generic priority-ordered decorator registry and chain; it has no geometry CSS.
- `src/presentation/drag-and-drop/` owns explicit drop-gap geometry and the BlockDropWrapper insertion frame.
- `src/presentation/components/ui/` owns the scoped shadcn reset; primitive utility
  classes remain in their component files.
- `src/presentation/slots/` owns slot positioning, control styles, and list counters.

Put new feature styles in their owning folder and import them through the public
stylesheet entry. Preserve cascade layers and rule order when moving existing CSS.
Consumers continue importing one compiled `@chulane/rivto-page/styles.css`; they
must not need to import internal CSS files individually. Keep existing explanations
and comments with the rules they describe when moving them.

## Tailwind and shadcn primitives

Use Tailwind v4 with the `page:` prefix for presentation utilities. Public structural
classes may compose utilities through `@apply`; keep the six semantic hooks stable.
Keep counters and public variable expressions in the package stylesheet where needed.
Build the exported CSS with the Tailwind CLI; published consumers must not need to
scan source files or compile Tailwind themselves. The demo uses the Vite plugin.

Install shadcn primitives with the official CLI and the package's `components.json`.
Keep generated primitives in `src/presentation/components/ui`, document their props
and behavior, and retain named prop types. Mark their DOM roots with
`data-rivto-page-ui` so the package's scoped reset applies. Do not enable global
Preflight or introduce global shadcn color variables that overwrite a host theme.

Use `--rivto-block-background` as the common public block background override.
Page receives resolved CSS colors/expressions in node.color. Palette names and their
conversion belong entirely to the host; do not add a palette registry, per-color
index signature, token validation, or package-specific color-variable protocol.
Example color choices belong in the demo. Own-node colors must not leak into child
blocks; inherited theme overrides remain separate.

## Performance measurements

Use the production preview and the demo:performance script with one worker and
tracing disabled. Playwright DOM snapshots can dominate large-fixture timings; do
not compare traced and untraced latency as an application speedup. Keep diagnostic
tracing available for behavioral tests. Report addressed reads and notifications
separately from browser frame timing; constant reads do not guarantee constant paint cost.

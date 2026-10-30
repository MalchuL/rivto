# Generic block wrapper registrations

Status: implemented and verified in the autonomous Page package; production integration remains pending.

Current contract: the final "Revised contract" section supersedes the shared-ref
design and registration-order-only API recorded below.

## Correction of the previous boundary

The previous BlockWrapper implements one concrete DnD frame. It cannot serve as
an extension composition API. Split the generic decorator pipeline from that frame:
BlockWrapper composes registered components; BlockDropWrapper owns in-flow insertion
boundaries and remains a layout placement primitive composed with BlockItem.

## Contracts and ownership

Add editor.wrappers with register(component), getSnapshot(), and subscribe(listener).
Registration order defines nesting: first registered is outermost. Snapshots are
immutable and stable between changes. Duplicate components are independent entries;
each disposer removes only its own registration and is idempotent. Registration
publication failures roll back the added entry; all observers are attempted.
The existing extension resource owner captures registrations/subscriptions, including
failed setup rollback, extension removal, view remount, and controller destruction.
No duplicate manager fields, lifecycle API, host document, or editor mode is added.

Decorator props contain the current bounded node snapshot and already-rendered
children. They render children exactly once and do not select a renderer or recurse.
BlockNodeView retains one BlockView and the existing memoized layout. BlockWrapper
subscribes only to wrapper registrations; unchanged documents are not traversed on
text or selection changes. New decorators may remount React descendants because
the component ancestry changes; host data and controller-cached nodes stay stable.

Port the existing shared-element ref composition as a DOM-free provider. Each
block resets the ref context before its decorator chain, so parent callbacks never
attach to descendant BlockViews. Callbacks observe the actual BlockView element
and later null; they own their own observers/listeners. Explicit BlockView refs
remain usable alongside decorator callbacks. DOM-free decorators preserve sibling
counter and layout assumptions; additional DOM from custom decorators is an explicit
host layout decision, not a second Page block identity.

The DnD frame is renamed and moved, preserving its native attributes/ref, canonical
neighbors, one BlockItem counter, CSS tracks, and always-interactive boundaries.
It is not automatically installed by the generic wrapper pipeline. Layouts opt in
through BlockChildren.item; arbitrary display lists do not acquire a fake parent.

## Implementation stages

1. Capture production baseline on small/repeat=200 fixtures before runtime edits.
2. Rename/move the concrete DnD frame and update all consumers/exports/styles/tests.
3. Implement the editor-owned wrapper registry, generic chain, ref composition, and
   the single-shell rendering integration. Expose only the consumed registry API.
4. Exercise dynamic extension registration/removal in the standalone demo using a
   DOM-free decorator. Verify independent block refs, remounts, stable node objects,
   registration order, snapshot identity, duplicate callbacks, failure rollback,
   StrictMode cleanup, and bounded rendering with wrappers installed.
5. Run focused units, package/demo types/lint/builds, browser behavior in Chromium
   and Firefox (12 workers; serial retry on failure), and production performance
   with one worker. Review API creation/passing/use/destruction independently.
6. Update package guidance and usage to distinguish generic decorators from DnD
   geometry. Record actual results and any limits here.

No renderer migration, drag sensor/move commit, virtualization, or production
ReactEditor integration is included in this correction.

## Final implementation and ownership review

The controller creates one concrete BlockWrapperRegistry field. BlockEditorApi exposes
BlockWrapperRegistryApi only (register, getSnapshot, subscribe), and the registry
borrows BlockEditorResourceOwner rather than the full extension manager. Entries and
snapshots are frozen. Repeated component/subscriber registrations stay independent.
Publication errors notify all observers and roll back the attempted registration.
Owner cleanup captures setup resources; no parallel manager reference or public
attachment/destruction capability was introduced.

BlockNodeView creates one BlockView and passes it through BlockWrapper. That chain
subscribes only to wrapper registrations and resets its ref context per block.
Decorators receive only the current bounded snapshot and the existing children.
BlockElementRefProvider composes refs onto the existing shell; the ref utility retains
React 19 callback cleanup and clears paired ordinary refs. Tests cover nested block
isolation, explicit object refs, StrictMode replay, and callback cleanup. Decorator
callbacks remain responsible for their own DOM resources and delegated errors.

BlockDropWrapper, its private boundary component, and its stylesheet now belong to
drag-and-drop. Their geometry, native sizing/ref behavior, canonical sibling logic,
and one BlockItem counter were retained. The generic wrapper folder contains no DnD
geometry or concrete block implementation. All frame consumers/exports/styles and
package guidance were migrated. No compatibility alias conflates the two concepts.

The demo's optional "Demo wrapper" extension exercises dynamic registration/removal,
DOM-free shell observation, enabling while the view is detached, and view remounts.
Host text and controller-cached node identity survive chain changes. React descendants
may remount when ancestry changes; preserving component-local state or caret across
registration changes is not a guarantee. Extra layout DOM from custom decorators
remains an explicit host responsibility; the ref-provider path avoids that change.

## Verification

- 97 unit tests across 10 suites passed. Includes registry order/identity, duplicates,
  observer failure rollback, extension rollback/removal/destruction, nested refs,
  explicit refs and cleanup, and addressed rendering with decorators on 5/2000 nodes.
- 46 behavioral cases passed in Chromium and Firefox with 12 workers; no browser
  failures required serial retries. Existing frame geometry, counters, clipping,
  resizing, RTL, disabled demo CSS, and pointer-control checks remain green.
- 24 performance cases passed on production preview, one worker, tracing disabled.
  The previous 20-case baseline was captured before runtime edits. Defaults and
  repeat=200 fixtures remained unvirtualized, with the same extensions/routes.
- Types, lint, package/demo builds, formatting, built ESM exports, and shipped CSS
  checks passed. The borrowed API/owner review above was performed separately.

With a registered DOM-free decorator, native outline input retained 15 addressed
reads, 2 notifications, and zero display-list reads at repeat=1 and repeat=200.
Bento retained 22/4 for text input, and five pointer samples retained 5 reads / 0
notifications. No untouched block content was rendered in the 2000-node unit check.

Common Bento pointer-to-two-frame proxies (milliseconds; median and range):

| Browser  | repeat | Before registry  | After registry   |
| -------- | ------ | ---------------- | ---------------- |
| Chromium | 1      | 16.6 (16.4–16.6) | 16.6 (16.5–16.8) |
| Chromium | 200    | 19.9 (0.4–44.6)  | 19.3 (17.5–44.5) |
| Firefox  | 1      | 16 (16–17)       | 17 (16–18)       |
| Firefox  | 200    | 40 (38–49)       | 38 (38–50)       |

Native text input on the large outline remains slower than synchronous commands.
A separate alternating comparison used the same final build and real input, with
wrappers off/on/on/off, one warm-up and three samples per batch (six per state):

| Browser  | repeat | Decorator off    | Decorator on     |
| -------- | ------ | ---------------- | ---------------- |
| Chromium | 1      | 26.9 (24.5–28.9) | 25.8 (23.9–26.4) |
| Chromium | 200    | 64.2 (42.3–99.3) | 82.9 (43.8–90.5) |
| Firefox  | 1      | 20.5 (10–23)     | 19 (14–23)       |
| Firefox  | 200    | 114.5 (106–214)  | 112.5 (110–116)  |

All comparison samples retained 15 reads / 2 notifications / zero forest reads.
These rendering proxies are noisy and do not establish a speedup or a universal
latency guarantee; large-fixture paint cost remains with or without decorators.
The Chromium large median differs amid widely overlapping ranges, so no claim of
zero decorator rendering overhead is made. Synchronous commands in the dedicated
registered-wrapper cases were 0–0.1ms in Chromium and 0–1ms in Firefox at browser
clock resolution. Raw runs and the temporary comparison remain under
/tmp/rivto-wrapper-registry-*. Actual production ReactEditor integration, gestures,
move commits, virtualization, and React 18 runtime validation were not performed.

## Revised contract: explicit priorities and wrapper-owned DOM

The following correction supersedes the shared-element ref design above. Remove
BlockElementRefs, its provider/boundary/hook, and their exports. BlockView retains
only its explicit native ref; wrappers manage events/refs on their own elements. Decorators own their own elements, React handlers,
local refs, and cleanup; no common shell element is distributed through context.

Require register({ component, priority }) with a finite explicit priority. Higher
priority is outermost; ties retain installation order. Validation precedes ownership
or publication, while duplicate registrations and rollback remain independent.

Use the existing BlockItem primitive for counter-aware DOM wrappers, accepting the decorator's
existing block snapshot when not in BlockChildren.item. Suppress duplicate counter ownership
for nested items representing the same block. BlockView resolves its enclosing item
identity at its actual render position, including inside registered decorators.
No extra DOM protocol, document parent, or shared-ref infrastructure is introduced.
Update the demo to own its wrapper element and pointer handler. Cover priority/ties,
validation/rollback, event bubbling, nested ownership, counters, cleanup, stable nodes,
addressed small/large work, and existing DnD geometry. Capture production baseline
before runtime edits; run package checks and both-browser behavior/performance after.

Performance correction for the revised contract: the first owned-element version
added an unnecessary node subscription via BlockItem (3 callbacks instead of 2).
BlockItem now accepts the decorator's existing `block` snapshot and uses a shared
private presentation component without subscribing again. Placement-only usage
retains its existing addressed subscription. The shared counter DOM is not duplicated;
no global chrome subscription or new DOM-ref protocol is added.

### Verification of the revised contract

Final checks passed: 97 unit tests in 9 suites, 48 behavioral cases in Chromium and
Firefox with 12 workers, and 24 production performance cases with one worker and
tracing disabled. Types, lint, package/demo builds, formatting, built ESM exports,
and declaration checks passed. The package no longer exports shared-ref facilities.
Behavior coverage includes owned pointer capture, nested counter ownership, existing
Bento placement, wrapper removal/remount, and the original clipping/RTL/geometry paths.
Priority coverage includes descending order, stable ties, negative/zero values,
missing/NaN/infinite rejection before publication, frozen capture, duplicates, and
extension/observer rollback. No final behavioral failure required a serial rerun.

The first performance run exposed 4 failures (both fixture sizes/browsers): an
unnecessary BlockItem subscription produced 3 notifications rather than 2. Supplying
the already-owned snapshot removed that subscription; original budgets were retained.
The 5/2000-node unit regression now also asserts exactly two node-data subscriptions
for the edited block and at most 12 addressed reads, without display-list reads.
Final browser input retained 15 reads / 2 notifications at both sizes. Five hover
samples retained 5 reads / 0 notifications; default Bento text retained 22/4.

Registered-wrapper input proxies (milliseconds, median and range):

| Browser  | repeat | Before (shared-ref decorator) | After (owned DOM) |
| -------- | ------ | ----------------------------- | ----------------- |
| Chromium | 1      | 24.4 (16.9–25.6)              | 25.3 (24.9–32.6)  |
| Chromium | 200    | 85.7 (17.3–90.0)              | 91.9 (48.5–96.5)  |
| Firefox  | 1      | 19 (19–21)                    | 18 (14–18)        |
| Firefox  | 200    | 106 (106–113)                 | 133 (110–237)     |

A separate final-build off/on/on/off comparison (six samples per state) measured:

| Browser  | repeat | Wrapper off      | Owned wrapper on |
| -------- | ------ | ---------------- | ---------------- |
| Chromium | 1      | 25.8 (24.3–30.9) | 25.6 (23.6–26.9) |
| Chromium | 200    | 68.1 (45.0–87.9) | 90.5 (88.4–96.6) |
| Firefox  | 1      | 20 (9–24)        | 21 (19–22)       |
| Firefox  | 200    | 122.5 (105–231)  | 115 (8–238)      |

These proxies are noisy and are not synchronous command durations. Owning a DOM
wrapper adds one element per decorated block; extra browser rendering cost is real
and is not hidden behind unchanged data-read counts. Chromium's large-fixture samples
show that cost. No speedup or zero-overhead claim is made, and virtualization remains
unimplemented. Raw data is under /tmp/rivto-simple-wrappers-*. Production ReactEditor
integration and React 18 runtime behavior were not exercised.

Final ownership review: registrations retain the existing narrow registry/resource
owner contracts and exact-entry disposers. BlockWrapper composes components only;
BlockView owns its explicit caller ref; decorators own their elements/handlers/refs.
BlockItem borrows snapshots when supplied, subscribes only for placement-only usage,
and shares one private DOM implementation. Counter ownership is read inside the
actual wrapper chain. No shared element provider, DOM query bridge, duplicated
manager field, node facade, or broader editor dependency replaces the removed helper.

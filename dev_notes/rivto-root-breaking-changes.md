# Rivto root migration: breaking changes

This file records intentional API changes that may require downstream code or
tests to change. Existing tests in this workspace are not edited to hide them.
The [acceptance review](rivto-root-migration.md#acceptance-review) records verification and performance limitations.

Panel registration now accepts the operations needed to route input and restore
focus. The mounting owner retains teardown. The panel contract suite gained a
type assertion guarding this boundary. All existing behavioral assertions were
preserved.

## Event and keyboard registration in React extensions

During extension setup, pass the definition and handler to `api.events.register`
or `api.keyboard.register`. The shared managers previously exposed an optional
third argument through the extension's TypeScript interface. That argument
prefixes the registration ID and restricts delivery to the supplied panel.
The panel manager also retains the disposer so unmount releases it.

For document-wide behavior, use the setup API. For behavior tied to a particular
occurrence, register through `panel.events` or `panel.keyboard`. The panel
supplies its identity and owns cleanup. The React custom-event suite gained two
compile-time checks for this distinction. Its runtime assertions are unchanged.

## Root occurrence connectivity

- `InputRoot` providers now implement `createLineOverlay(style)` for inert line
  feedback. Its update reports whether the occurrence accepted the operation,
  allowing Page to clear target feedback after ownership loss. The Page gesture
  borrows this capability from its existing Root.
  Existing feedback fixtures now supply a `BrowserInputRoot`, and the normalized
  keyboard fixture supplies the new capability without changing their assertions.
  Pointer-down no longer has Page's private native browser context; its remount
  test now checks the corresponding Root identity instead of the native element.
  The remaining private pointer-move context retains only the hit target, not
  the mounting element.
- `BlockDropReceiver.update()` and its unused receiver-owned feedback are removed.
  Production callers only use its registration, active state and detach
  subscriptions; the source gesture owns visible feedback. The receiver cleanup
  test removes its obsolete update and feedback assertion while retaining its
  registration and listener assertions. Separate feedback tests still exercise
  marker and line cleanup.
- `InputRoot` providers now implement `createTextOverlay()` for inert text
  presentation. Page drag previews receive that capability from their Root
  instead of receiving the mounting element. Existing preview test fixtures pass
  their `BrowserInputRoot` directly, and the normalized keyboard fixture supplies
  the new method; their existing assertions are unchanged. The Page preview policy
  and its test moved out of the browser folder; its test remains in `__tests__`.
- `DocumentAttribute.set()` now reports whether it wrote the marker, so a preview
  can remove its overlay if ownership changes between overlay and marker setup.
- `InputRoot` providers now implement `captureDocumentAttribute(name)`, which
  returns document-marker operations without exposing a browser document. Page
  drag preview captures the marker for its source occurrence so cleanup remains
  bound to the original document. Drag preview/browser test constructors now
  supply a Root, and the normalized keyboard fixture supplies the new method;
  existing assertions are unchanged.
- `InputRoot` providers now implement `isConnected()` and
  `isInSameDocument(region)`. Page drag completion uses these capabilities to
  validate its actual source attachment rather than reconstructing a browser
  region from its element. The normalized keyboard test's Root mock supplies the
  new methods; its keyboard assertions are unchanged.

## React panel selection

- `readEditorDOMSelection` and `restoreEditorDOMSelection` are no longer exported
  from `@chulane/rivto-react`. Consumers with a panel should use
  `panel.selection.readDOM()` and `panel.selection.restoreDOM(selection, options)`;
  the panel resolves its own attached occurrence instead of accepting an HTML root.
  The existing browser selection bridge remains internal while its Page ownership
  and virtual endpoint behavior are migrated.
- Adding trailing blocks now uses the panel's guarded selection scheduler. If
  newer input, a selection change, or occurrence teardown supersedes the pending
  caret restoration, the old request is cancelled instead of focusing later.
  A newly mounted editor may also receive its caret before the click finishes
  bubbling; its intended selection and document mutations remain the same.
  Trailing controls no longer render into an end slot belonging to a nested editor
  when the current Page occurrence has no end slot of its own.

## Page input callbacks

- `BlockInputEvent` is now a public type rather than a constructible exported
  class. Browser input instances are created by Page's internal event dispatcher.
- Page event handlers and predicates receive normalized input through `input`,
  `blockId`, `insideRoot`, and explicit cancellation methods. The former `raw`,
  `root`, `blockElement`, `contentElement`, and `selectionAnchor` fields are no
  longer present in public callback values. Code or tests that inspect native
  object identity or access those fields must move to normalized data and
  capabilities or to a browser-owned implementation.
- The public event-name map now uses the explicit normalized browser input map
  rather than every name from `GlobalEventHandlersEventMap`. Inputs not yet in
  that map need a normalized contract before they can be registered; the broader
  built-in and custom event audit remains outstanding.
- Selection target ancestry is now checked in the attached root's browser realm.
  Cross-document targets can therefore be recognized where an ambient-realm
  `instanceof Element` check previously rejected them. Tests that assumed that
  rejection may need to reflect the actual occurrence ownership instead.
- Text-node targets now resolve through their parent element for Page scopes and
  normalized target ancestry, including in another document. Previously these
  targets did not match a block or content scope. Synthetic events or adapters
  relying on their exclusion will observe the corrected routing.

Page's existing event registration and behavior tests have not been changed for
this API change. Their results and browser coverage are recorded with the
migration's verification, not assumed from the type changes alone.

## Normalized input target capabilities

`InputTarget` now requires `closestAncestorMatches` to check a selector against
the nearest matching ancestor without exposing that ancestor. Custom input
adapters implementing this interface must provide the operation. It returns
`undefined` when there is no matching ancestor; checking any matching ancestor
instead would change selection behavior for nested controls.

`InputTarget` also requires `belongsToRoot`, which checks occurrence containment
and can exclude a nested occurrence using a boundary selector. Custom adapters
implementing this interface must provide it. Normalized `focusin` and `focusout`
inputs now provide the other focus target as `relatedTarget` ancestry capabilities
instead of requiring access to a native focus event.

The temporary `NativeEventListeners` callback now receives normalized input as
its third argument. Existing two-argument callbacks remain valid, but consumers
or tests asserting the exact callback argument list will see the additional
value. This native listener contract remains temporary until Page no longer
needs private browser context.

### Drag-release test failures observed during migration

The four Chromium/Firefox variants of
`e2e/page-drag-release.spec.ts` expecting the moved block's panel to open after a
drag failed at that panel-visibility assertion. The changed build failed in the
12-worker run and again with one worker. The same four cases also failed at the
same assertion with one worker against the saved earlier production host build
from before the normalized drag-input changes. In both builds the preceding
assertions for the committed root order and cleared drag preview passed.

The saved baseline predates the current Page pointer changes and also predates
the Edgeless tool-input change; it is not an unchanged-HEAD build. The current
`DragHandle` contract explicitly suppresses navigation after the pointer reaches
the drag threshold, including when it returns to the handle. The failing tests
instead require the dragged block's panel to open immediately after the drag;
existing `drag-handle.test.tsx` asserts that navigation must not open after the
threshold. The release tests now assert that the dragged block's panel stays
closed, while retaining their drop-order, cleanup and undo assertions.

## Edgeless tool pointer input

- `CanvasViewportApi`, returned by `useCanvasViewport`, no longer includes the
  browser-layer snapshot. The earlier `useCanvasViewportLayers` export has also
  been removed. Consumers observing attachment can use `useCanvasViewportAttached`;
  content in world coordinates can use `CanvasWorldPortal`. Consumers that need
  other direct layer operations must move them into their browser integration.
  The viewport owner still attaches and retains its browser layers.
- `CanvasViewportApi` now includes `getWorldOriginInClient`, returning numeric
  client coordinates or `undefined` when detached. Custom implementations of
  this borrowed interface must provide the method.
- `CanvasViewportApi` also includes `clientToWorld(point)`, which converts client
  coordinates using the live attached viewport and camera, or returns undefined
  while detached. Custom implementations must provide this capability.
- Visual-tool placement now reads snapping from the canvas snapping store. Hosts
  must configure canvas snapping; changing viewport data attributes alone no
  longer changes tool placement policy.
- `CanvasTransformControls` no longer accepts a `plane` prop. It must be rendered
  within an attached canvas viewport and resolves its world layer internally;
  consumers that previously supplied an arbitrary plane must mount a canvas view
  and render the controls under its viewport context.
- `CanvasControlsAdapter` no longer supplies `getTargets` or `targetId` DOM
  callbacks. Controls resolve mounted targets within the world layer using the
  existing `data-canvas-element` identity marker. Hosts must mark each geometry
  target with its canvas element ID. `CanvasControlHandle.prepareDrag` now takes
  participant IDs instead of elements; unmounted participants are omitted when
  preparing a drag. `decorateControls` is replaced by `getControlMarkers`, which
  returns data-attribute names and values for the canvas to apply and remove.
  Custom adapters using the old DOM callback must supply markers as data instead.
  `CanvasControlHandle.dragStart()` no longer accepts a native event. It must be
  invoked synchronously during the matching mouse or touch start; canvas retains
  that input privately for Moveable and ignores calls outside its delivery.

- `CanvasPointerNormalizer` receives detached `CanvasPointerInput` data rather
  than a native `PointerEvent`. Code using a DOM event's target, propagation
  state, or other native properties must move that behavior into its browser
  adapter and provide the normalized data needed by the tool.
- `CanvasToolGesture.pointerDown` accepts a normalized pointer-down value with
  capture and default-prevention capabilities instead of a native event and
  `Element`. The capture capability returns the exact release operation for that
  gesture. Move, up, and cancel receive detached pointer samples as well.
- The React gesture adapter still exposes React pointer handlers for wiring into
  a capture element. It keeps the native event and capture host inside that
  adapter; eliminating native-object types from all ordinary public React APIs
  remains part of the broader migration.

## Pointer propagation state

- `PointerInput` now requires `isPropagationStopped()`. Custom normalized pointer
  producers must report the live propagation state for the current synchronous
  delivery. Page uses it to preserve selection established by an earlier capture
  listener without accessing the native event.

## Page navigation and canvas attachment

- Removed the internal `EdgelessCanvasAdapter.mountBlocksForElement` lookup and
  its global canvas-to-adapter registry. A mounted edgeless surface now registers
  its own source with its panel's Page navigation controller; cleanup is scoped
  to that registration and stale cleanup cannot remove its replacement.
- Updated the existing `page-navigation-controller.test.ts` to observe the
  registered card-mounting capability instead of spying on the removed static DOM
  lookup. The test retains both forward and backward navigation across a separator.
  A separate test covers detach, reattach, and stale cleanup.
- `CanvasEditor` and its options accept an additional source type parameter, with
  `CanvasSource` as the default. Existing one-parameter consumers remain valid.

## Canvas viewport attachment state

- Removed `CanvasViewport.layers` and the `CanvasViewportLayers` browser export.
  Browser consumers can call `isAttached()` and `subscribeAttachment()` without
  receiving the mounted root or world-layer elements. Canvas portals and Moveable
  controls access the attachment only inside the package's browser integration.
- Updated `canvas-viewport.test.ts` and `canvas-events.test.ts` to assert the
  replacement attachment state. The lifecycle tests still cover exclusive roots,
  notification counts, failed setup, failed teardown, and stale detach; the
  portal test continues to verify that content moves to the correct remounted layer.

## Browser viewport lookup

- Removed public `CanvasViewport.forElement`. Canvas drag routing still finds the
  nearest mounted canvas inside the package's private browser attachment code,
  preserving nested-viewport isolation without accepting native elements in the
  public lookup API. Existing viewport and event tests now inspect that private
  ownership only where they explicitly test browser routing and cleanup.
- Removed the unused React `canvasPoint` helper and its old test of fallback data
  attributes. Its sole original coordinate scenario is retained in a new
  `__tests__` test against `CanvasViewport.clientToWorld`, using the live canvas
  camera and verifying that data attributes do not control the result. Detached
  viewport behavior is covered by the existing canvas viewport conversion test.

## Page browser selection ownership

- `BlockEditorApi.browserSelection` now exposes occurrence-bound portable reads
  and virtualized-endpoint checks. The controller creates and attaches the
  existing DOM selection implementation; extensions cannot attach or destroy it.
- `BlockNativeSelection` now requires this borrowed browser selection capability.
  Its existing unit test supplies the editor-owned manager instead of letting the
  observer construct its own DOM converter. The same before-input and suspended
  selection-change assertions remain in place.
- Panel selection now rejects reads and restoration when another Page navigation
  controller owns the same root. Previously the global lookup could route the
  request through that other occurrence. The new ownership test covers this case;
  no existing test was changed for it.
- `BlockDOMSelection.readEditorDOMSelection` and `restoreEditorDOMSelection` now
  use their attached occurrence instead of accepting an HTML root. The existing
  `block-dom-selection.test.ts` was moved into `__tests__` and updated to attach
  its fixture first; it retains the directed-range and missing-endpoint checks.
- A React panel now attaches its Page controller when its block-editor root is
  registered. `BlockEditorScope` borrows an existing attachment for the same root
  and only detaches attachments it created itself; standalone views still attach
  and detach their own Page controller. Edgeless waits until its context root
  matches its viewport ref during mode changes. New tests cover both ownership
  paths, surface switching, and failed panel attachment and cleanup.
- Removed `getRoot()` from the extension-facing `BlockEditorApi`. The host-owned
  controller and mounting view retain it for attachment and browser presentation.
  The StrictMode assertion in `block-editor.test.tsx` now checks the borrowed
  controller identity and reads the root from its concrete host owner; the test
  was moved into `__tests__` and retains its lifecycle and subscription checks.
- Moved `BlockDOMSelection.createSelection` to the portable
  `BlockSelectionRanges.createFromPositions` operation. The existing DOM selection
  test now constructs its directed range through that operation and retains its
  reverse-range, contentless-block, and restoration assertions. React caret
  navigation and Page pointer selection use the same range operation. The
  existing demo `drag.test.ts` was also moved into `__tests__` and updated to
  call it; its interval-read and contentless-block assertions remain unchanged.
- `BlockBrowserSelectionApi` and React's `PanelSelectionApi` now include block-ID
  caret focus. Implementations of those interfaces must provide the new method.
  Page reports detached, unmounted, missing-content, and focus-requested results;
  the panel mounts only an unmounted shell before retrying. Keyboard navigation
  no longer passes a native root when focusing its current panel's caret.
  The previously added caret-extension performance test now also times and
  verifies ArrowDown focus before its existing Shift-arrow assertion; no prior
  assertion was removed.
- Separator insertion now schedules caret focus through the panel's existing
  selection scheduler. Unlike the former unconditional animation frame, pending
  focus is cancelled by newer input or selection changes, surface replacement,
  and remounting the same root. A new test covers cancellation and successful
  focus; no existing test was changed for this behavior.
- Creating an Edgeless card now uses the same guarded panel focus operation.
  Pending focus is cancelled by newer input or selection and occurrence teardown,
  rather than focusing an old viewport unconditionally on the next frame.
- Edgeless card creation now consumes normalized `dblclick` input from the canvas
  viewport and converts client coordinates through that viewport. The existing
  card-focus test was updated to provide normalized input and a viewport instead
  of a React mouse event; its stale-occurrence and successful-focus assertions
  remain unchanged. The root event map now includes `dblclick`.
- The canvas viewport's borrowed events contract now includes `observe`, and the
  root event map includes `pointerenter`. A root observation may explicitly
  include nested occurrences; it uses a separate native listener, so browser
  listener order applies between it and occurrence-scoped handlers. Existing
  handlers continue to exclude nested occurrence input.
- Page input events now provide an attachment-bound root capability for clearing
  browser selection and requesting surface focus. Plain pointer selection and
  modifier-toggle selection use it. If a selection subscriber detaches the
  originating occurrence during delivery, those later browser operations become
  no-ops instead of acting on the old element or a replacement attachment.
  The existing public-input test previously rejected any field named `root`;
  it now verifies that this field is a capability with no exposed element while
  retaining its checks that native events and DOM context are absent. The
  keyboard normalization test fixture also supplies the new required capability;
  its existing keyboard assertions are unchanged.
- Structural click, Shift-range selection, and structural drag restoration now
  retain the originating input root through selection updates and delayed work.
  If that occurrence detaches, their browser focus and clearing operations are
  skipped instead of affecting a later attachment or its document selection.
- `InputTarget` now provides `closestAncestorIsEditable` for live, occurrence-bound
  editability checks. Implementations must supply it. The Edgeless card-focus
  test's normalized input fixture was updated to include the new method; its
  existing focus and lifecycle assertions are unchanged.
- `InputTarget` also provides `closestAncestorsAreSame`, comparing live ancestor
  identity without exposing elements. Implementations must supply it. The same
  Edgeless input fixture now supplies this method; no existing assertion changed.
- `InputRoot` now reports whether its exact attachment remains active. Text
  drag restoration and its delayed task skip old endpoints after detachment,
  including a remount of the same element, rather than overwriting a newer
  occurrence's browser selection. The existing normalized-keyboard test fixture
  supplies the new method; its keyboard assertions are unchanged.
- `BlockBrowserSelectionApi` and `PanelSelectionApi` now expose visual-line caret
  movement using block IDs and UTF-16 offsets. Page walks the attached occurrence
  and borrows a host callback to mount a neighbor at a rendered edge; implementations
  of these interfaces must provide the new operation. React's internal raw-root
  vertical-navigation helper was removed. A remount during mounting invalidates
  the result, and duplicate rendered block IDs retain their distinct DOM order.
  Page's occurrence boundary also excludes nested Page roots even if a host
  renders them inside the same React panel; the old React walk checked panel
  boundaries alone.
- Both selection interfaces now also expose adjacent horizontal caret positions.
  Page receives a host-defined local scope selector and mounting callback; the
  result contains only a block ID and UTF-16 offset. Implementations of these
  interfaces must provide the new operation. The existing caret registration no
  longer receives adjacent content elements from the React DOM helper.
- `BlockBrowserSelectionApi` and `PanelSelectionApi` now provide structural
  selection focus. Page clears the text range, focuses its attached occurrence,
  and scrolls the selected block; the panel mounts the block first. Implementers
  must supply the new operation. Unlike the old unrestricted root query, Page
  excludes blocks belonging to nested Page occurrences when scrolling.
- `PanelSelectionApi.selectTextRange` constructs and restores a directed range
  using the occurrence's displayed block order. Interface implementations must
  provide this operation; vertical keyboard range extension no longer looks up
  the Page navigation controller through an HTML root.
- List shortcut focus now uses the panel selection API, which excludes nested
  Page occurrences when resolving a block. An input conversion queued by a
  replaced or remounted panel root is discarded rather than mutating the new
  occurrence. The temporary `EditorEvent.isAttached` callback has been replaced
  by `inputRoot.isAttached()`, alongside attachment-bound focus and selection
  operations. Direct event construction now requires an `InputRoot`. The event
  cleanup fixture in `event-cleanup.test.ts` and direct-construction fixtures in
  `react-editor.test.ts`, `keyboard-target-state.test.ts`, and
  `keyboard-ancestor.test.ts` supply the new dependency; their cleanup and
  dispatch assertions remain intact.
- Keyboard events now provide live block-content and root-target checks.
  Editing and indent registrations use those checks instead of inspecting the
  native event. The internal indent helper accepts these checks rather than a
  native keyboard event; existing marker and ancestry behavior is preserved.
  The unused internal `isEditableKeyboardEvent` and `findBlockFromEvent` helpers
  were removed after their callers migrated.
- React input and beforeinput deliveries now include copied `TextInputData`
  using the root package's defaults. List shortcuts, history requests and slash
  discovery read that snapshot. Synthetic input events carrying matching fields
  can now trigger these behaviors without being native `InputEvent` instances;
  changes to their fields after a listener group starts do not change its snapshot.
- Keyboard events now expose copied live target properties and an ancestor
  query. Caret navigation and Edgeless movement/deletion use them without
  reading the native target. The existing current-realm element check for caret
  and movement, and cross-realm element check for deletion, are preserved.
- `KeyboardEditorEvent` is no longer an `EditorEvent` and no longer exposes
  `raw`, `blockElement`, `contentElement`, or text input fields to keyboard
  callbacks. Its native input remains private to the temporary adapter. The keyboard dispatch
  and direct-construction assertions in `react-editor.test.ts` were updated to
  check the copied key and the absence of native event fields; dispatch order,
  shared event identity, claiming, phase, and cleanup assertions remain intact.
  Collapse bindings now use the captured `insideBlock` flag. Visual property
  panels use an occurrence-specific ancestor query, which also supports text
  nodes as event targets, instead of receiving a native target.
- Each React panel registration now owns an `InputRoot` shared by its event and
  keyboard deliveries. History and Edgeless deletion use it for focus and browser
  selection clearing. A detached or replaced registration cannot focus or clear a
  later attachment, including when the same element is remounted. The assertions
  in `event-attachment.test.ts` now inspect the shared root capability.
- Caret navigation now ignores a keyboard delivery if its panel registration was
  detached or replaced by an earlier handler in the same dispatch. Previously it
  could read selection from a newly mounted occurrence, including a remount on the
  same element. Existing tests were not changed; `caret-attachment.test.ts` covers
  that replacement case.
- Canvas selection clearing now uses the keyboard event's attachment-bound focus
  capability and ignores a delivery whose registration has already been replaced.
  It cannot focus a later occurrence after selection listeners detach the original.
  `selection-clear-attachment.test.tsx` exercises replacement during dispatch,
  including remounting the same element.
- Structural paste now clears browser selection and focuses only the attachment
  that received the paste. If a paste listener remounts the panel during the
  operation, it no longer clears or focuses the replacement. The new
  `paste-root-attachment.test.ts` covers a remount on the same element.
- React clipboard deliveries now capture `clipboard` format access once when the
  event context is created. The shared root browser adapter owns this conversion;
  the duplicate React `clipboardEventData` implementation was removed. The
  existing `clipboard-event-data.test.ts` import now targets the shared adapter;
  its read, write, and missing-data assertions are unchanged. Replacing the native
  event's clipboard data after context capture no longer changes that delivery's
  capability. The adapter's browser export is temporary until React uses the
  root-owned normalized listener directly.
- `InputRoot` now exposes `hasFocus()` for checking the occurrence or its
  descendants without exposing the element. It returns false after detachment or
  while a replacement registration is staged. The Page keyboard normalized-input
  test fixture supplies this additional method; its existing assertions are unchanged.
- The React-only `DOMEventListeners` implementation moved to the root browser
  package as `BrowserEventListeners`. React supplies its focus and pointer lifecycle
  groups explicitly. Its three listener tests moved into Root's `__tests__` and
  now supply those groups; their rollback, cleanup, and shared-realm assertions
  are unchanged. This native-dispatch export is temporary until React consumes
  normalized root delivery.
- React keyboard fields are now copied when the routed event context is created.
  The keyboard transport and plain-text paste release handler use that snapshot,
  so a preceding handler changing native key fields no longer changes shortcut
  matching for the same listener group. Direct `KeyboardEditorEvent` construction
  now requires the copied input; fixtures in `react-editor.test.ts`,
  `keyboard-ancestor.test.ts`, and `keyboard-target-state.test.ts` supply it
  without changing their existing assertions.
- Keyboard target inspection now lives in the Root browser adapter. Direct
  `KeyboardEditorEvent` construction requires a `KeyboardTarget` capability;
  the existing direct-construction fixtures in `react-editor.test.ts`,
  `keyboard-ancestor.test.ts`, and `keyboard-target-state.test.ts` supply it
  without changing their target and ancestry assertions. The browser capture
  export is temporary until React receives root-owned normalized input directly.
- Structural deletion behaviors now receive `BlockSnapshotContext`, which retains
  the full block snapshot, panel, parent, and captured selection but has no DOM
  root. `deletePanelSelection` no longer takes a root argument. The existing
  `block-behavior-registry.test.ts` structural-dispatch fixture and assertion now
  check the root-free context; its full-snapshot, ordering, and claim assertions
  remain intact. `InputRoot.isFocused()` supplies the exact-surface focus check;
  the Page keyboard fixture now supplies this additional capability. A stale
  keyboard delivery is ignored after its occurrence is replaced, and caret
  restoration is not scheduled if a deletion policy replaces that occurrence.
- The structural deletion context now borrows `BlockSnapshotPanel`, a narrowed
  contract for the existing panel object. It exposes the block reads and document
  relocation operations used by current behaviors, without native root access,
  registration, or editor destruction. Editing behaviors retain their existing
  React panel contract. The public `relocateColumnContents` helper now accepts the
  document operations directly instead of a React panel; the built-in column
  caller passes the same document it used previously.
- Block behavior caret restoration now uses the panel's Page selection capability.
  It excludes nested block-editor occurrences and requires the original panel
  surface to remain current when scheduling. Previously a card-local or stale
  element could be passed directly to the internal focus helper. Existing helper
  callers use the panel surface; the new regression test covers a replaced surface
  and duplicate block IDs in a nested editor.
- Keyboard-driven block behavior contexts now carry their originating `InputRoot`
  alongside the temporary DOM surface. Split, merge, outdent, and empty-block
  reset ignore a stale keyboard delivery, and deferred caret work is skipped when
  its registration has been replaced, including a remount of the same element.
  Direct UI behavior invocations still use the surface guard until the shared
  occurrence owner supplies a capability for those invocations.

## Page input attachment ownership

- `BlockEditorEvents.attach` now borrows an input capability from its occurrence
  controller. Callers attaching that concrete internal event manager directly must
  provide an `InputRoot`; normal `BlockEditorController.attach` callers are unchanged.
- `BlockEditorController.attach` accepts a host-owned browser root for the mounted
  element and does not detach that borrowed root. A mismatched or detached supplied
  root is rejected. React panel routing uses registration-scoped capabilities that
  also become inactive when the mounted occurrence is detached.
- `BrowserInputRoot` can derive an independently invalidated registration
  capability from a mounted root. Detaching the mounted root invalidates every
  such capability; detaching a registration does not detach its owner.
- `ReactPanelApi.inputRoot` exposes the current routing registration's attachment
  state, and is absent when routing is disabled or not registered. Container
  writing controls use it instead of passing an HTML root; stale attachment contexts
  are rejected before insertion or deferred focus.
- React beforeinput events expose `readContentText` when their captured content host is
  available. The reader returns live text from that host without exposing it;
  list shortcut conversion now uses this capability.
- React event dispatch skips a handler when its originating registration was
  removed or replaced, including when its availability predicate replaces it.
- Slash input refresh is cancelled if its registration is disabled or replaced
  before the queued refresh runs, including re-registration on the same element.
- A slash command from an invalidated registration no longer mutates the document
  or schedules focus in a replacement occurrence. Fallback focus and native
  selection clearing use the originating root capability.
- React event roots now provide `BrowserInputRootApi.isConnected()` for checking
  the active surface's document connectivity without exposing its element. The
  existing `InputRoot` contract remains valid for consumers that do not need it.
- `BrowserInputRootApi.isDocumentFocused()` reports the active occurrence's
  document focus. Focus-out events expose a live block-containment query, and
  input content capabilities can read text, check host connectivity, and decorate
  a prefix while preserving selection.
- TODO prompt work no longer runs after its originating registration is replaced.
  Moving to another occurrence of the same block now converts the old candidate,
  instead of treating both occurrences as one editing target. A later nonmatching
  input clears an obsolete decoration from its current occurrence.
- TODO prompt cleanup no longer rewrites an old or moved host after registration
  loss. It clears a re-registered host only after confirming the current capability
  refers to the same content; cleanup is skipped when ownership cannot be verified.
- `ContentInput` now includes `ContentHostIdentity.isSameHost` for comparing
  captured hosts without exposing browser elements. Custom implementations must
  provide that operation; unsupported providers compare unequal.
- `PointerInput` now includes normalized `relatedTarget` and `captureRegion`.
  Custom input providers must supply both; captured regions stop accepting
  operations when their attachment, occurrence boundary, or owner changes.
- Page's `BlockBrowserSelectionApi` now includes occurrence-bound text gesture
  creation and block hit testing. Custom implementations must supply these methods;
  captured text gestures cannot read or restore selection after detachment.
  Structural coverage is constructed by the Page selection ranges implementation;
  `BlockDOMSelection.createVisibleStructuralSelection` initially remained for
  existing callers; the direct class export was subsequently removed below.
- `PointerInput.scheduleTask` schedules cancellable work in the listener's browser
  realm and suppresses delivery after listener detachment. Custom pointer providers
  must implement it; consumers also check any independently borrowed occurrence.
- `PointerInput.createAutoScroll` creates an attachment-bound edge-scroll session
  from normalized coordinates. Custom pointer providers must implement it and stop
  scrolling when the listener or the supplied occurrence check is inactive.
  Its update operation also accepts an optional normalized target for idle-frame
  preflight; unsupported target providers fall back to ordinary hit testing.
  Page's former `BlockAutoScroll` and `BlockScrollPoint` exports are removed;
  gestures create their session through `PointerInput.createAutoScroll` instead.
  Root's browser entry no longer exports `BrowserAutoScroll`. The unchanged
  direct behavior assertions moved from Page to Root's `__tests__` folder, with
  their import updated to the implementation's new owning package.
- `ClipboardInput` now supplies `clipboardTarget`, a live capability for checking
  independent text editing using host selectors. Custom input providers must supply
  it and include the event target and its document's focused host in the query.
- `PointerInput` now includes `isCurrentRealmElement` and `focusTargetAncestor`.
  Custom pointer providers must implement both; focus must stop after attachment loss.
  React's browser event factory temporarily uses `capturePointerEvent` until it
  migrates to Root-owned normalized input delivery.
- `PanelRegistration` now supplies its current `inputRoot` instead of `getRoot`.
  Local event and keyboard handlers follow the exact current registration, even
  when a different panel reuses the same element; stale keyboard actions are
  skipped if an availability predicate detaches their originating registration.
- `PanelSelectionApi.runWithViewportPreserved` runs a synchronous structural edit
  with selection and viewport restoration bound to its originating input registration.
  Custom panel selection implementations must provide it. If setup or the edit
  fails, viewport cleanup is attempted and concurrent cleanup failures are aggregated.
- `BlockBehavior.onSplit` receives a `BlockKeyboardContext` without an HTML root.
  Split implementations should use its input attachment and panel selection
  operations for focus. The existing scheduled-block attachment test now passes
  the attachment without a root and checks that split callbacks do not receive one.
- `BlockBehavior.onOutdentAtStart` also receives `BlockKeyboardContext` without
  an HTML root. It uses `PanelSelectionApi.isRenderedBlockNested` to check the
  current panel occurrence; custom selection implementations must provide that query.
  `BlockSplitContext` is renamed to `BlockKeyboardContext` because both actions use it.
- `BlockBehavior.onResetEmpty` now receives `BlockKeyboardContext` without an HTML
  root. `PanelSelectionApi.adjacentEditableBlockId` supplies rendered neighbor IDs
  for reset and merge behavior; custom panel selection implementations must provide
  it. Direct behavior calls use the panel's current occurrence for these reads.
- `BlockBehavior.onMergeBackward` and `onMergeForward` now receive
  `BlockKeyboardContext` without an HTML root. The exported
  `removeEmptyBlockAfterStructuralPredecessor` helper takes a block ID and optional
  input attachment instead of a DOM scope. Custom panel selection implementations
  must provide `runWithStructuralPredecessorFocus`. A replaced attachment skips
  the browser selection and focus changes after the document edit.
- `KeyboardEditorEvent.root` has been removed from predicates and handlers.
  Canvas shortcut eligibility now checks the receiving panel's current input
  registration and its live transform state.
- `KeyboardEditorEventInit` now requires captured `insideBlock` and
  `insideContent` booleans instead of DOM root, block, and content elements.
  The keyboard transport converts its private browser context at delivery.
  The direct-construction fixtures in `react-editor.test.ts`,
  `keyboard-ancestor.test.ts`, and `keyboard-target-state.test.ts` were updated
  to supply those booleans; their existing behavioral assertions are unchanged.
- `focusCaret` and `scheduleBlockFocus` take a block ID, offset, and optional
  originating input registration instead of an HTML root. Without a registration,
  `focusCaret` still publishes selection but neither helper schedules browser focus.
  A registration owned by another panel is rejected even while it is attached.
  The existing scheduled-block, container-writing, and direct-input registration
  tests now pass the captured registration; their attachment checks are preserved.
- `BlockKeyboardContext.reactPanel` and `BlockOutlineContext.reactPanel` now expose
  `BlockEditingPanel` and `BlockOutlinePanel`, respectively. Custom behaviors must
  use the block, document, selection, and policy operations in those contracts;
  panel mounting, lifecycle, event registration, and `getRoot` are no longer exposed
  through these behavior contexts. The existing panel object is still passed directly.
- `KeyboardEditorEvent.reactPanel` now exposes `KeyboardPanel`, which contains the
  document, editing, selection, and surface operations used by keyboard handlers.
  Native root access, panel cleanup, and panel-level registration APIs are no
  longer in the callback's TypeScript contract. The original panel object is still
  passed directly, and the host retains its full lifecycle API.
- `EditorEvent` and `EditorEventInit` now use captured `insideBlock` and
  `insideContent` booleans instead of exposing `blockElement` and `contentElement`.
  The event-manager tests now assert those booleans and the absence of elements;
  the direct-construction fixture in `react-editor.test.ts` supplies the booleans.
  Native elements remain private to the event factory for capability capture.
- `EditorEvent.raw` and the `raw` constructor input have been removed. The event
  manager retains the native event only for synchronous claim and cancellation
  handling. `react-editor.test.ts` now checks that it is absent,
  `panel-lifecycle.test.ts` reads copied keyboard input, and
  `keyboard-input-snapshot.test.ts` mutates its own native fixture through a
  closure so the original snapshot assertion remains meaningful.
- `EditorEvent.root` and its constructor input have been removed. Canvas transform
  handling resolves its surface privately and checks the originating input
  registration before beginning a gesture. Event-manager and panel-lifecycle tests
  now assert attachment identity instead of receiving an HTML element, and the
  direct-construction fixture no longer supplies a root.
- Clipboard copy and paste converters receive `ClipboardPanel` instead of the full panel
  API. It provides the occurrence's selection, root IDs, element reads, and shared
  extension identity; native root access and panel lifecycle are no longer part
  of either context. The same panel object is supplied, without a runtime wrapper.
- `EditorEvent.reactPanel` now exposes `EventPanel`, a borrowed interface without
  native root access, panel lifecycle, or event and keyboard registration methods.
  Its editor and keyboard dependencies expose only operations used by handlers.
  The event-manager test now verifies panel identity without calling `getRoot`.
- Page's internal `BlockInputDispatcher.attach` requires the occurrence's input
  root. Its direct dispatcher test now owns and detaches that root explicitly;
  the editor controller already supplied it and retains ownership. The test also
  verifies that a stale disposer cannot detach a later use of the same root.
- Page's internal drag source feedback now receives a captured input region and
  block ID instead of a source element. Its existing feedback tests capture that
  region through the browser input adapter; their restoration assertions remain.
- `InputRegion` now requires `setTemporaryAttribute` for reversible presentation
  markers. Custom input-region providers must implement its attachment, restoration,
  idempotency, and failure behavior.
- `InputTarget` now requires root-bounded ancestor attribute lookup and an
  owner-scoped ancestor check. Custom providers must implement both; the existing
  Page ownership and Edgeless focus fixtures were extended with unused no-op
  implementations. Page uses these capabilities for block and content scopes.
- `InputTarget.isRoot()` distinguishes an input targeted at the occurrence root
  from a direct text child. Custom target providers and the Page ownership and
  Edgeless focus fixtures must supply it. Page's internal event-value constructor
  now accepts normalized input without a browser event or element.
- Page's private input browser context is now available only during pointer-down
  and pointer-move delivery. Its context lifecycle tests use pointer input and
  also verify that unrelated click input has no such context.
- Root `BrowserEvents` now keeps one registration snapshot across native listener
  phases. A handler added during capture waits for the next native dispatch instead
  of running in that event's later bubble phase. Observers and handler claims
  retain their existing per-group behavior.
- Kanban add-column and add-card controls schedule focus through panel selection.
  A changed selection or replaced input registration now cancels the deferred
  focus; previously a stale frame could focus a replacement occurrence.
- Outline navigation now checks for the surface-type capability rather than an
  event manager. A React editor without a mounted panel therefore uses its document
  outline instead of throwing when it has an event manager but no surface method.
- React input events provide `contentInput` for captured content caret and geometry
  reads. Slash input uses this capability rather than receiving a content element.
- Panel selection exposes `contentInput(blockId)` to read the rendered block's
  own caret and geometry without returning its browser element; it does not mount
  missing content and excludes nested occurrences. Slash selection refresh no longer
  accepts a content marker belonging to an embedded panel without its own block shell.

- Page now routes non-drag input through Root’s normalized listener. Its browser
  attachment adds capture listeners for dispatch identity; the Page listener tests
  identify the handler by phase rather than assuming a single native listener, and
  live in the events `__tests__` directory. Handler ordering and claims are retained.

- `InputRoot.findRegions` returns occurrence-owned region capabilities, and
  `InputRegion.readAttribute` reads their current attributes. Custom providers must
  implement both. Group drag source feedback now uses these capabilities; its
  fixture supplies a `BrowserInputRoot`, and the keyboard fixture supplies an
  empty region lookup. Markers still restore their original values on cleanup.

- Page drag completion no longer focuses a replacement source or receiving
  occurrence when the active gesture is canceled by detachment during the move.
  Local focus uses the captured occurrence capability and cannot reactivate after
  remount. Existing successful local and foreign drops retain their focus behavior.

- `BlockDragTargetScope` now owns a `focus()` operation. Receiver implementations
  must avoid focusing after their exact registration is disposed or replaced.
  Drag test scopes were updated for the new contract and their test files moved
  into `__tests__`. The Page receiver also checks that its root remains connected.

- The standalone canvas tool layer now observes the mounted occurrence’s window
  for blur, rather than the JavaScript global window. Its Escape and blur
  observations use separate listener groups so existing canvas input handlers
  run first and their claims do not suppress tool cancellation. The Edgeless
  demo Playwright configuration now discovers specs inside `__tests__`.

- The receiver-focus test now counts focus calls directly because this package’s
  type-checking environment cannot resolve `@jest/globals`; its assertions and
  covered behavior are unchanged.

- `CanvasPointerNormalizer` may now return undefined when its viewport is
  detached. Tool gestures ignore an unavailable start and cancel an active move
  or release without committing. The remount test now supplies the viewport
  capability used by the tool layer rather than a separate event manager.

- Standalone canvas tool input is now bound to the rendered attachment identity.
  After detachment, stale pointer samples cannot use a replacement attachment;
  an active gesture is canceled and capture is released. The existing remount
  fixture now supplies the borrowed attachment snapshot.

- React visual-tool normalization now returns undefined for detached coordinates
  instead of inventing (0, 0). Toolbar preset gestures capture the attachment at
  pointer down and cannot activate or commit after it is replaced. The existing
  tool-pointer test was updated to assert the new detached behavior.
- `useCanvasViewportCoordinates` exposes attachment-bound coordinate operations
  without browser elements. A retained capability becomes inactive after detach
  or remount, even when the same element is reused.

- Visual-tool and preset-drag subscriptions now roll back partial setup and
  attempt every cleanup. Preset cancellation and release also attempt preview,
  capture and tool cleanup after failures, reporting collected failures with
  `AggregateError` instead of stopping at the first failure.

- Added the required JSDoc to a panel fixture method in
  `kanban-add-focus-registration.spec.ts` to satisfy workspace lint. The test’s
  executable code and assertions are unchanged.

- Root input now supports normalized `mousedown`, and `InputRegion` providers
  must implement `ancestorAttribute` for target ancestry bounded by a mounted
  region. `createBrowserInputRegion` accepts elements only at the browser mounting
  boundary and returns an attachment-bound capability. The default canvas
  transform uses this input; higher-priority claims can suppress its registration,
  and nested canvas input no longer starts the outer default transform. The
  existing transform-controls fixture was adapted to the narrowed input contract.

- Browser input regions now keep their retained browser state in a JavaScript
  private field. The capability no longer exposes those implementation objects
  through a runtime `state` property.

- Page pointer-down no longer captures a native target in its private drag
  context; drag start only needs the mounted root. The two browser-context tests
  now exercise pointer-move, which still requires the target for hit testing,
  while retaining their original target identity and nested-delivery assertions.

- Connector reconnection now cancels if its original canvas attachment is no
  longer available, rather than committing an endpoint at invented coordinates
  or using a replacement attachment. Only the pointer that started the gesture
  can complete or cancel it. `ConnectorInteraction.resolveEndpoint` can return
  undefined when its attachment is unavailable.

- `PointerInput` now supplies `captureRootPointer`, returning an idempotent
  release capability or undefined after listener detachment. Custom pointer
  input providers must implement it. Releasing an older capability does not
  release a newer capture made through this capability on the same root and
  pointer. Canvas panning and marquee selection use this Root operation.

- `useCanvasToolGesture` now registers normalized viewport input and returns no
  React event handlers. Its caller supplies the viewport registrations and a
  capture-layer selector. Accepted tool gestures capture the viewport root rather
  than the SVG layer, and tool admission claims its Root listener group at priority 1000. The standalone and React remount fixtures now mount the layer inside its
  viewport and assert release on that root; their cancellation assertions remain.
  A tool whose accepted pointer can no longer be captured is canceled.

- `CanvasViewportCoordinates` now includes attachment-bound client-point hit
  testing with an optional exclusion selector. Preset placement uses it instead
  of accepting a viewport element. The preset attachment test fixtures supply
  the new capability; their existing cancellation assertions are unchanged.

- `EdgelessToolbarTool.getButtonProps` and `EdgelessToolbarRenderContext` are
  removed because they exposed React pointer events and native button targets.
  Registrations can provide a static `className`; creation tools receive the
  shared preset bindings automatically. External custom pointer bindings must move
  into tool behavior or a host-owned component.

- A toolbar preset gesture now retains an idempotent capture-release capability
  instead of the button element. A second pointer-down cannot replace an active
  preset gesture. The cleanup fixture uses the release capability and keeps its
  existing failure and cleanup assertions; a new test covers concurrent pointers.

- The private preset-placement hook now receives copied pointer values and
  browser capabilities instead of React pointer events or preview elements.
  Its toolbar adapter owns event conversion and preview mounting. The preset
  attachment fixture uses that adapter and its cleanup fixture supplies the
  preview capability; cancellation and failure assertions are preserved.

- Active toolbar preset gestures now observe movement, release and cancellation
  through Root window-capture registrations, which are removed on completion or
  cancellation. These observations run before descendant pointer handlers and can
  finish a gesture even if a descendant stops propagation. The attachment fixtures
  now attach a Root event owner and preserve their pointer and cleanup assertions.
  The existing placement performance probes now install their timing listeners
  before gesture registration so synchronous Root window-capture work is measured;
  their placement and preview assertions are unchanged.

- Preset gesture state and cleanup now live in a dedicated controller rather
  than a large React hook. Pointer normalization moved into a standalone module;
  the two existing normalization tests update only their import paths, retaining
  their original assertions. The controller preserves the scheduled frame's zoom.

- `PointerInput.captureTargetPointer` captures the nearest matching target inside
  the input root without exposing it, and protects newer Root captures on remount.
  Custom pointer-input providers must implement it. Preset toolbar pointer-down
  now uses Root observation and an internal tool marker; unavailable targets do
  not start a gesture. The preset input and attachment fixtures now exercise Root
  delivery while retaining their capture, preview and cancellation assertions.
  Canvas toolbar tool buttons expose their identity using the exported
  `CANVAS_TOOL_ATTRIBUTE` and `CANVAS_TOOL_SELECTOR` literals.

- `MouseInput.detail` now carries the browser-reported click count; custom mouse
  and pointer providers must supply it. Preset pointer-click suppression now runs
  through a Root capture observation before React click handlers. Keyboard clicks
  retain the shared toolbar activation behavior. The existing double-click focus
  fixture supplies a click count of two; its assertions are unchanged.

- Page no longer exports the native `DOMSelectionPoint` type by name. Its
  browser selection implementation retains that endpoint internally; the
  concrete controller's browser selection still exposes native operations and
  must be migrated before the selection boundary is complete.

- Page no longer directly exports `BlockDOMSelection`. Cross-editor focus uses
  the destination occurrence's browser selection capability. An adjacent Page
  without a registered navigation controller is no longer focused through raw
  DOM. The React structural-selection test now calls the existing
  `BlockSelectionRanges` operation directly, retaining its assertion; navigation
  controller test fixtures supply their Page selection capability.
- `BlockEditorController.browserSelection` now exposes portable selection
  operations and attachment ownership instead of the concrete browser class's
  native endpoint methods. Extensions continue to receive the narrower
  `BlockBrowserSelectionApi`, which excludes attachment.
- Page selection attachment now borrows its occurrence Root and stops selection
  reads, focus and gesture work when that Root is detached, even before Page's
  own disposer runs. Selection attachment takes the Root capability; direct
  implementation tests now supply it. A focus callback that detaches the Root
  no longer restores a caret into the stale occurrence. Selection restoration
  also stops before focusing if synchronous endpoint mounting detaches the Root.
- Page focus observers no longer deliver notifications after their borrowed Root
  detaches. If an observer detaches it during a notification, later observers in
  that delivery are skipped; callback failures are still reported.
- Page input delivery now rechecks its exact attachment and Root before each
  callback and after its availability predicate. Detaching or replacing the
  occurrence during a delivery prevents later observers and handlers from acting
  on the old event, even when a remount borrows the same Root. One direct internal
  event fixture now supplies an attachment identity.
- A Page input handler or observer removed by its own availability predicate
  no longer runs during that delivery. A replacement with the same ID starts
  receiving input on the next event, in line with the existing snapshot contract.
- Gap results no longer include `BlockDropGapRegion.previous` and `next` DOM
  registration objects. Gap kind and physical axis remain available; a between
  destination carries its canonical neighbor IDs.
- `ResolvedBlockDropTarget.outlineElement` is replaced by an attachment-bound
  `outline` input region. Outline feedback restores the previous marker value on
  release, including after detachment; a stale outline cannot affect a later
  attachment. The existing drop-target and feedback tests compare or provide
  regions instead of DOM elements, and were moved into `__tests__`; their
  destination, geometry and visible feedback assertions remain in place.
- `ResolvedBlockDropTarget.element` is replaced by an attachment-bound `anchor`
  input region. Root's `InputRegion.containsRegion` checks live containment for
  foreign receiver validation. Anchor feedback now restores its previous marker
  rather than unconditionally removing it. Drag, router, feedback, receiver and
  geometry test fixtures use regions and preserve their existing assertions;
  the receiver test was moved into `__tests__`.
- `BlockDragTargetScope.root` is replaced by an attachment-bound `region`.
  Root regions can compare document identity without exposing a document; custom
  `InputRegion` implementations must provide `isInSameDocument`.
  `DropSurfaceRegistry.register` and `BlockDropReceiver` now receive the
  mounted root separately from the receiver identity; the obsolete `DropSurface`
  type was removed. Registry, receiver and drag fixtures were updated to use the
  new contracts, and the registry tests were moved into `__tests__`.
- React's internal receiving scope no longer offers native hit resolution as an
  instance method. The host invokes the occurrence class directly, and the
  redundant `CrossDocumentPageRootController` type was removed. The existing
  receiving-attachment test now checks that native resolution is absent from
  the scope; its focus and replacement assertions remain unchanged.
- Page drag resolution now accepts an opaque `BlockDragHit` instead of an
  `Element` hint. The Page browser implementation retains the element privately,
  rejects disconnected or foreign-document hints, and shares the same captured
  hit through local and foreign routing. Hints are released after synchronous
  input or geometry resolution, including when a consumer throws. Existing geometry, pointer-capture and
  registry tests create or inspect browser hits in their fixtures; their target,
  destination, feedback and routing assertions remain. The React registry test
  uses a controlled `elementFromPoint` result and was moved into `__tests__`.
- `DropSurfaceRegistry.resolve` now receives only the already validated hit; it
  no longer accepts a source element or performs its own fallback hit test.
  `get(root)` was removed; registration identity is checked through `getCurrent`.
  The router compares source and receiver regions for local routing. Registry and
  React attachment tests now use receiver identity or the actual router, keeping
  their replacement, nested routing and cross-document assertions.
- Root's internal browser auto-scroll session now accepts only the normalized
  `InputTarget` already required by its public `PointerAutoScroll` contract.
  Direct browser auto-scroll tests construct normalized targets instead of
  passing elements; their scrolling, edge and frame-count assertions are kept.
- Panel registration's `inputRoot` contract now includes `clearSelection` and
  `focus`, in addition to attachment identity. Collapse selection repair uses
  those capabilities instead of reading the HTML root. If selection callbacks
  replace the panel attachment, the stale root no longer clears the replacement's
  browser selection or receives focus. Custom panel implementations must supply
  the two additional operations when exposing a registered input root.
- `InputRoot` and the panel's narrowed root contract now include `readAttribute`
  for live surface attributes. Custom Root providers must implement it. The
  Edgeless keyboard guard reads the transform marker through this capability,
  rechecks the registration after the read, and no longer needs `getRoot`.
  A Page keyboard fixture supplies the new method; its existing assertions are
  unchanged.
- `InputRegion.readAttribute` now discards a value when the region loses ownership
  synchronously during the read. Its existing test suite adds a regression for
  that attachment change without altering the earlier assertions.
- `InputRegion.ancestorAttribute` likewise discards values when the region loses
  ownership or the target no longer has the same matching ancestor inside it
  during the read. Callers cannot use a stale ID to start a canvas transform.
- `InputTarget` now provides `isUncapturedPointerTarget(pointerId)` for live
  connectivity and pointer-capture checks. Custom input providers must implement
  it. The Page input-ownership and React surface-focus fixtures supply the method
  without changing their existing assertions; Page drag uses the capability before
  capturing its hit.
- Root's built-in pointer map now includes `lostpointercapture`; Bento resize
  separators use this normalized input to cancel their active gesture. The
  separator controller's private input contract accepts copied pointer and key
  data with default-prevention and propagation capabilities.
- React panel `lostpointercapture` registrations now receive `pointerInput`
  rather than `undefined`, matching the other normalized pointer deliveries.
- Bento resize now obtains pointer capture through the normalized Root input and
  retains its identity-aware release. Its controller tests moved into `__tests__`
  and construct normalized input; the listener rollback tests also construct
  normalized input. Their existing behavioral assertions remain.
  Cancelling an older gesture no longer releases a newer capture on the same handle.
- Bento resize now borrows handle feedback and window cancellation registrations
  from its existing separator attachment instead of retaining the handle or
  attaching a second Root listener owner. Its tests use the borrowed capabilities;
  their existing assertions remain. Cleanup restores any previous resize marker.
- Removed the unused React clipboard helper that accepted native events. Its
  existing target and focus cases moved into the clipboard `__tests__` folder and
  now exercise the normalized target capability; their assertions are unchanged.
- A drop receiver registered on a new root no longer resolves through its old
  root while the earlier registration awaits cleanup. Only the receiver's latest
  registration can accept a routed hit; its stale disposer remains harmless.
- `CanvasToolbar` no longer accepts `getButtonProps` or exports
  `CanvasToolButtonBindings`. Registrations provide their optional button class
  with `className`; native click and pointer callbacks are no longer passed
  through that registration hook. The React editor's preset interactions use
  normalized Root input and continue to preserve the registered class.
- `CanvasToolButtonProps` now provides `onActivate`, `toolId`, `menuId` and
  `menuOpen` instead of native button props and React event callbacks. Custom
  toolbar buttons must map these values to their own accessible browser controls;
  tool IDs must remain on the rendered button for preset input routing.
- `CanvasViewProps` and its world-layer presentation props no longer inherit
  native React HTML attributes. They retain the styles, classes, data markers,
  accessibility attributes and mounting ref used by current views. Consumers
  must register input through the viewport events API instead of passing native
  event handlers to the viewport or world layer.
- Block-handle Delete and the deletion phase of Cut now retain the invoking
  registration rather than its HTML root. If selection publication replaces the
  registration, the action rejects before deleting; if deletion replaces it, no
  stale focus or deferred caret work is scheduled. Cut also retains the original
  registration across its clipboard write; replacement rejects the Cut without
  deleting, while the completed clipboard write remains available.

- The browser registration-order test filters its click target through normalized
  `mouseInput.target` instead of the removed native `raw` event. Its existing
  capture, bubble, passive, window and deferred-registration assertions remain,
  and another button verifies that the target filter excludes unrelated clicks.
- React `EditorEvent` now supplies `mouseInput` for mouse deliveries. Root's
  temporary browser capture helper accepts the native mouse event until React's
  event transport is fully migrated to normalized delivery.
- Root `BrowserInputListeners.register` accepts an optional `passive` setting.
  Omitted settings remain non-passive, preserving existing default prevention.
  `BrowserEvents` registrations and observers also accept it; passive and active
  callbacks use separate listener groups and retain group-local claim behavior.
  The workspace `test:e2e` script builds Root before browser tests so the
  passive-listener test exercises the current published browser bundle.

- The only-child outdent browser fixture now scrolls the intended parent edge
  outside the viewport's auto-scroll band before measuring it. Previously the
  stationary pointer was 40 CSS pixels from the bottom, allowing scrolling to
  move the target between feedback and release. The drop-line and hierarchy
  assertions remain unchanged; edge scrolling itself remains enabled.

- The existing Kanban and Columns horizontal-gap reorder test now positions the
  target gap 128 CSS pixels from the scroll host's leading edge instead of 32.
  At 32 pixels the Kanban host auto-scrolled during pointer movement, moving the
  intended gap before release and making the reorder assertion address a different
  location. The reorder and undo assertions are unchanged; edge scrolling remains
  enabled and requires separate coverage.
- The temporary `BrowserListenerDispatch` callback now receives a fourth argument
  that captures normalized input for the occurrence selected by host routing.
  Callers implementing the callback may ignore it; code invoking this callback
  directly must provide it. This browser-only bridge remains temporary while the
  React multi-panel transport is migrated.
- The interim `captureKeyboardEvent` browser export has been removed after its
  React caller moved to the listener's normalized delivery. Existing tests still
  use the older `captureKeyboardTarget` export, which remains available.
- `FocusInput` providers must now implement `captureRelatedTargetWithinAncestor`.
  The browser adapter captures the ancestor identity and returns a live related
  focus target query; consumers no longer need the native focus event or element.
- `TextInput` providers must now implement `captureTargetText`. The browser adapter
  captures an owned content host and supplies a live reader without exposing it.
- Browser input target normalization now resolves element ancestry for any DOM
  node with a parent element, including comment nodes. Previously it did so only
  for elements and text nodes; non-browser target providers may omit the new
  nearest-ancestor occurrence comparison.
- `selectionchange` input now carries `selectionTarget`, an opaque capability
  for the current selection anchor or, when absent, the event target. Custom
  `BrowserInputMap` providers must supply that field for selection changes.
- `event-cleanup.test.ts` now expects two identical injected removal failures:
  the ordinary click listener and the dispatch-identity boundary are separate
  resources. Both removal attempts and both failures remain represented.
- `BrowserListenerDispatch` now receives a fifth opaque identity argument. With
  dispatch tracking enabled, it is shared across listener groups for a dispatch
  and changes when an event object is dispatched again.
- `BrowserListenerDispatch` now receives a sixth argument providing synchronous
  browser-default status and cancellation. Implementations that invoke the
  browser-only callback directly must provide this capability.
- `PanelRegistry.resolveEventRoot` now accepts an input name, opaque dispatch
  identity and Root pointer-ownership capability instead of a native event.
  The two panel-routing tests were updated to pass those existing listener values;
  their assertions and routing behavior are unchanged.
- The new Root pointer-ownership test now compares opaque owner identities by
  reference. Deep equality treated distinct empty identities as equal and could
  therefore miss incorrect routing.
- Removed the unused `captureMouseEvent` export from `@chulane/rivto-root/browser`.
  It accepted native events and elements; Root's own auto-scroll tests continue
  to use the internal helper. Browser consumers should use normalized input.
- Removed `capturePointerEvent` from the browser entry and deleted its unused
  implementation. Bento resize and Page drag-feedback tests now dispatch through
  Root listeners instead of manually normalizing native events. Their assertions
  remain in place; the detached-input case now detaches a real listener, and
  separate gesture attempts use fresh events.
- Removed `captureClipboardData` from the browser entry. Its React clipboard
  test now dispatches copy and paste through Root's normalized listener and keeps
  the existing format-read, format-write, and missing-data assertions.
- Removed `captureClipboardTarget` from the browser entry. The React clipboard
  target tests now use actual elements and normalized Root delivery instead of
  fake native events. They retain the label, block, redirected-focus, marked
  input and toolbar-button cases.
- Removed `captureKeyboardTarget` from the browser entry. React's direct event
  construction and keyboard target tests now receive the capability through a
  Root listener; existing live ancestry and cross-realm assertions remain.
- Keyboard target identity is now captured per delivery. Redispatching or
  retargeting the same native event no longer changes an earlier input's target;
  properties and ancestry of the captured target are still read live. Root and
  React tests now create a new delivery when checking a different target.
- Clipboard target identity is captured per delivery as well. Redispatching a
  native clipboard event no longer changes an earlier input's target; ancestry
  and the owning document's focused element remain live.
- Pointer continuations now capture the gesture owner once per native dispatch,
  including when there is no owner. A gesture started by an earlier listener no
  longer changes the owner observed by later listeners for that same delivery.
  Redispatching the same native event captures the current gesture again.
- Content-host browser mechanics now belong to Root. React's `ContentInput`
  contract uses the generic `readAncestorAttribute(selector, attribute)` instead
  of `readBlockId()`, with block selectors supplied by React. Root's normalized
  text input and occurrence root expose optional host-capture and lookup
  capabilities for non-browser provider compatibility.
  Four content-host tests moved from React to Root and use the generic ancestor
  query; their identity, reparenting, caret, and decoration assertions remain.
  The React occurrence test uses the same generic query. The slash placement test
  now supplies copied geometry instead of a fake HTML element and was moved into
  `__tests__`; its positioning assertions remain unchanged.
  Ancestor reads are bounded to the captured occurrence and discard a result if
  the host or matching ancestor moves during the read; the previous React helper
  could inspect a matching ancestor outside the occurrence.
- Text host capture accepts an optional nested-occurrence selector. When supplied,
  capture and ancestor reads reject a host moved into another occurrence, even
  when both occurrences use the same block ID. React supplies its panel selector
  and rechecks ownership before deferred TODO and slash input work. The existing
  Root occurrence test file gained regressions for this boundary; its previous
  assertions remain unchanged. New React regressions are under `__tests__`.
- Removed the element-taking `restoreTextCaret` browser export. An attached Root
  can capture its currently focused text host, whose `restoreCaret` operation
  accepts a UTF-16 offset without exposing the element. Focused-host capture
  rejects nested occurrences and detached registrations. React's pending-focus
  hook still focuses its mounted renderer, then asks Root to restore its caret;
  no existing tests were changed for this API migration.
- Panel input roots now include the existing Root `isConnected` capability.
  Contentless pending-focus restoration uses it along with Root focus and
  selection clearing, and rejects a registration replaced before or during focus.
  The new regression tests are in `__tests__`; existing tests were not changed.
- `BrowserEventListeners` no longer passes the native `Event` to its dispatch
  callback. Its remaining arguments are the listener group, surface root,
  normalizer, dispatch identity, and cancellation/ownership capabilities.
  The existing Root tests for pointer ownership, redispatch, listener control,
  selected roots and dispatch identity updated callback positions; the two tests
  that stopped propagation now do so through normalized input. The React panel
  routing cost and replacement tests use the group's input name instead of the
  native event's type. Their routing, propagation, identity and lifecycle
  assertions remain. A new test checks that no native event reaches the callback.
- Its normalizer now accepts the selected `InputRoot` rather than an element and
  attachment callback, and returns undefined for stale or unsupported roots.
  The selected-root and stopped-propagation tests now pass actual browser Root
  capabilities; their existing routing and dispatch-identity assertions remain.
  New tests cover detached roots and replacement during normalization.
- Multi-panel listener callbacks receive an opaque surface identity instead of an
  `HTMLElement`. Panel event routing now returns the existing borrowed panel
  registration instead of its element, and `resolveEventRoot` was renamed to
  `resolveEventPanel` to reflect that result; the event factory reads surface mode
  through that registration's Root. The Root normalized-dispatch, pointer-owner,
  stopped-propagation and disconnected-redispatch tests were adapted to use
  identities or their own retained Roots. The React routing cost and replacement
  tests now compare the returned Root, and the cleanup fixture no longer supplies
  unused element lookup methods. Existing assertions about routing, propagation,
  redispatch and teardown remain; a new test covers identity across remounts.
- `BrowserEventListeners.connect` now takes active browser `InputRoot` values
  instead of HTML elements and rejects stale or unsupported roots before changing
  listeners. `PanelRegistry.getRoots` was replaced by `getInputRoots`; the event
  manager borrows those registrations. Existing browser-listener tests construct
  Roots for their test elements through a shared test helper; the React routing
  and event-cleanup fixtures also pass Roots. Their behavioral assertions remain.
  Formatting was also applied to `input-target-ancestor`, `keyboard-target-input`,
  `text-input-redispatch`, and `text-node-target` tests; no assertions changed.
- Multi-panel listeners no longer deliver or cancel browser input after the last
  Root for their surface, document, or window has detached, even before listener
  reconciliation. A shared document or window listener remains active while
  another Root for that target is attached. A Root moved to another document no
  longer authorizes delivery from its old document before reconciliation. New
  tests cover detached targets, separate documents, owner-check reentrancy, and
  bounded target lookup; no existing tests were changed for this correction.
- React editor panel lookups `getActiveRoot` and `getDefaultRoot`, which returned
  HTML elements or null, were replaced by `getActiveInputRoot` and
  `getDefaultInputRoot`, which return the existing attachment-bound Root or
  undefined. Selection ownership now compares the exact registration capability.
  A stale registration on the same surface no longer grants selection ownership;
  an unregistered mounted surface remains excluded as before. `hasActivePanel`
  distinguishes the brief removal interval when the active registration has been
  withdrawn but its selection cleanup has not completed, preventing early fallback
  to the default panel.
  Existing panel lifecycle and initial-focus tests compare the corresponding
  Root instead of its element; their active/default and cleanup assertions remain.
  The embedding hover-selection browser test likewise reads the active/default
  Root's role through its capability, retaining its role and selection assertions.
  A new test covers Root invalidation and same-element remount replacement.
- `PanelRegistry.getSurfaceType` accepts a Root capability instead of an HTML
  element. A detached Root resolves to `block` rather than consulting a replacement
  on the same surface. `ReactPanel.getSurfaceType` uses its mounted Root and falls
  back to its declared mode while that Root is being released. New tests cover
  surface mode, fallback, remount, and replacement during a browser attribute read;
  no existing tests were changed for this API migration.
  If the registration is replaced during an identity or panel-mode read, the
  old Root now also resolves to `block` instead of returning the replacement's mode.
- Nested panel teardown restores focus through the mounted Root and the enclosing
  panel's current Root. If either occurrence is no longer attached during cleanup,
  focus is not transferred to a stale surface.
- `PanelRegistry.registerPanel` and `getInputRoot` now accept a mounted
  `BrowserInputRoot` instead of an HTML element. Registration rejects detached
  Roots; the separate optional occurrence argument and element-based teardown
  fallback have been removed. `getApi(element)` has no production consumers and
  was removed. Direct-registration test fixtures now create and detach a mounted
  Root and pass it to these APIs; their replacement, rollback, routing, cost,
  and focus assertions remain. A new test covers detached registration and active
  mode during removal and same-element replacement. The mounting boundary still
  receives the HTML element. Direct callers now pass `registerPanel(root, options?)`.
  The registry previously required a document model that it never read. Mounted panel
  roots and options supply all routing and teardown state.
- Extension setup and panel consumers now borrow `ReactEditorExtensionApi`, which
  excludes runtime destruction and panel registration. `PanelAPI.document` and
  clipboard algorithms borrow editor operations that exclude document
  editor destruction. Each clipboard strategy now receives only its block commands and
  selection lookup. The host retains the full editor for lifecycle ownership.
  Four fixture annotations in `react-editor.test.ts` were updated to the borrowed
  extension type; their assertions are unchanged. The lifecycle browser fixture
  installs its destruction failure on the host-owned editor rather than from
  extension setup, preserving the asynchronous cleanup failure scenario.
- Cross-document Page placement now rejects a receiver that was replaced on the
  same surface before reading its geometry. Focus requests use the receiver's
  attachment-bound Root region and stop after replacement or disconnection.
  The browser region factory provides a `FocusableInputRegion`, which requests
  focus without scrolling only while the captured region remains active; ordinary
  `InputRegion` providers are unchanged. Existing tests were unchanged; new tests
  cover stale placement and region focus.
- Page's internal initial-focus reconciliation now accepts the exact mounted Root
  instead of its HTML element. Browser implementations provide the separately
  scoped `FocusBoundaryInputRoot.hasFocusWithin` capability; ordinary `InputRoot`
  and `BrowserInputRootApi` consumers do not acquire it. Two existing lifecycle
  test calls now pass their captured Root, preserving their detachment assertions.
  New tests cover nested boundaries, a Root detached during lookup, and an older
  still-attached Root on the same element. A focus change during boundary lookup
  now discards the old result instead of reporting a stale initial focus.
- `BrowserInputListeners.attach` can now borrow an active browser Root in addition
  to accepting an element at a standalone mounting boundary. Borrowed Root
  detachment stops input delivery and invalidates attachment-bound captured
  regions even before the listener disposer runs. A detached nested Root no
  longer claims its parent's input boundary. Page's focus observer attaches via
  that Root, and its normalized input listener now borrows the same Root. A
  captured Page region therefore becomes inactive when that Root detaches even
  if the listener has not yet been disposed. No existing tests were changed for
  this listener migration; new tests cover stale regions and setup rollback.
  Native delivery also rechecks registration and attachment after normalization,
  so a registration removed during capture does not receive that stale input.
  Nested ownership inspection snapshots shared owners: an owner registered by
  a reentrant ownership check cannot claim the delivery already being inspected.
- `BlockDragRouter` now receives the existing source `InputRegion` alongside
  the browser mount element. It refuses routing after that exact registration is
  disconnected, moved to another document or replaced, and discards results if ownership changes during
  hit testing or a routing callback. The Page adapter passes its existing region;
  two router test files pass the corresponding region without changing their
  geometry, routing, or cleanup assertions. New tests cover same-element source
  replacement and reentrant invalidation.
- `BlockBrowserSelectionOwner.attach` now requires the borrowed Root's
  `clearSelection` and `focus` operations alongside `isAttached`. Structural
  selection uses these capabilities instead of clearing and focusing the native
  root directly. Existing selection assertions remain unchanged; new tests in
  `__tests__` cover delegation and detachment during selection clearing.
- `InputRoot` now exposes `scrollFirstMatchingRegionIntoView` to find and reveal
  an attribute-matched region owned by the current occurrence, without exposing
  a browser element. Page structural selection uses it in place of its native
  block lookup and scroll. `BlockBrowserSelectionOwner.attach` consequently
  borrows this operation as well. One keyboard test fixture that supplies a
  complete Root now provides the new operation; its assertions are unchanged.
- `InputRoot.focusTextHost` now focuses an owned content host and restores its
  caret without exposing a native element. It distinguishes missing owner,
  missing content, and an ended caller attachment. Page translates those results
  to its existing caret-focus outcomes and supplies its own attachment check.
  `BlockBrowserSelectionOwner.attach` now borrows this operation; the normalized
  keyboard test fixture supplies it as part of its complete Root. The existing
  nested-text and end-of-content assertions moved from the Page selection test to
  Root's `__tests__/focus-text-host.test.ts`, where they exercise the surviving
  browser implementation; their expected behavior remains unchanged.
- `InputRoot.readTextSelection` returns directed owner identities and UTF-16
  offsets without exposing selection nodes. `BlockBrowserSelectionOwner.attach`
  borrows this operation, and Page retains model ordering and selection policy.
  The normalized keyboard fixture adds the operation to its complete Root; its
  existing assertions are unchanged. New Root tests cover reverse selection,
  nested occurrences, and detachment during the browser read.
- `InputRoot.readTextLength` and `restoreTextSelection` now supply the browser
  lookup and directed range restoration for Page. Page continues to decide when
  to mount virtualized owners and supplies its attachment-currentness check.
  `BlockBrowserSelectionOwner.attach` borrows these operations; the normalized
  keyboard fixture supplies them on its complete Root without changing its
  assertions. New Root tests cover reverse ranges, mounting, contentless owners,
  and fallback selection; a Page test covers detachment during focus.
- `InputRoot.createTextSelectionGesture` now creates the occurrence-bound pointer
  gesture that captures live browser endpoints, hit-tests content, and restores
  ranges. Page's gesture maps owner identities to block IDs and supplies mounting
  and attachment checks; its native-point helper methods and types were removed.
  The native endpoint and absent-versus-contentless mounting assertions moved to
  Root's `__tests__/text-selection-gesture.test.ts`. Page's gesture, replacement,
  and attachment tests now exercise the Root capability while preserving their
  original lifecycle and selection assertions. The normalized keyboard fixture
  supplies the new operation on its complete Root.
- `InputRoot.adjacentTextPosition` and `verticalTextPosition` now own browser
  content lookup and visual-line measurement for caret navigation. Page retains
  the mounting callback and maps owner identities to block IDs. The Page visual
  caret tests now supply deterministic range geometry to the Root-backed path
  instead of mocking a removed DOM-taking static method; their wrapped-line,
  duplicate-owner, mounting, and attachment assertions remain. The normalized
  keyboard fixture supplies the new operations on its complete Root.
- `BlockEditorApi` no longer exposes the native layout-region registry or the
  `register` and `registerLayout` methods on `dropTargets`; destination lookup
  remains available. Page's internal rendering context and mounted view borrow
  the same controller-owned managers for primitive refs and drop registrations.
  The compile-time API test now checks these restrictions; its existing root
  ownership assertions remain unchanged. Native registration remains on the
  mounting view until the layout and drop geometry migrate into Root.
- `BlockVirtualizationController.attach` now receives the owning editor's view
  registry; the global `getForRoot` lookup was removed. Page selection and React
  navigation borrow the owning controller's lookup, while the mounted tree borrows
  registration only. The virtualized-view demo tests moved into `demo/__tests__`
  and now query that registry; selection and navigation tests inject or register
  the corresponding view without changing their behavioral assertions. New tests
  cover replacement cleanup, editor isolation, destruction, and setup rollback.
- `InputRoot.observeTextOwners` reports the current focused and selected owner
  IDs and returns a disposer, without exposing browser events or nodes. Mounted
  virtualization views implement `observeRoot`, and the controller registry
  binds the view and Root in either attachment order. Page keeps its pinning
  policy and geometry observers. Detachment attempts every cleanup even if one
  fails. Existing view fixtures now supply the observation capability; the demo
  virtualization tests bind a Root, and the complete keyboard Root fixture
  supplies the new method. New lifecycle and observer tests live in `__tests__`.
- Page's missing virtualized-endpoint check now borrows Root's `findRegions`
  capability instead of querying an element. Matching blocks in nested editor
  occurrences no longer count as mounted endpoints of the parent. The existing
  attachment test marks its editor boundary and checks this nested case.
- `BlockVirtualizationRegistry.get` now accepts the borrowed Root identity, and
  returns a view only while that exact occurrence is bound. Page selection and
  React navigation pass their existing Root; mount-time view registration still
  uses its native root. Registry tests now bind an occurrence before lookup, and
  the demo and navigation fixtures use the same bound occurrence. Their
  replacement and isolation assertions remain, with added stale-identity checks.
- Virtualization binding and lookup now require the Root's `isAttached` capability.
  A detached Root, or a binding released during its attachment check, cannot
  retrieve a view. Registry and navigation test fixtures provide that capability;
  a new lifecycle test checks detachment and synchronous binding removal.
- Virtualization registration and binding now take Root `InputRegion` surface
  identities instead of HTML elements. Their browser mounting owners create the
  regions; Root compares the exact active surfaces. Existing registry, selection,
  demo, and navigation fixtures now create regions for their mounted elements.
  Their assertions remain, with added coverage for reusing one region object.
- The virtualization view now delegates document-offset observation and
  end-following scroll behavior to `observeDocumentOffsetAndFollowEnd` at the
  browser mounting boundary. The view still owns and disposes the observation;
  its existing metadata and cleanup assertions remain unchanged. New Root tests
  cover scrolling away, frame cleanup, and failed resize-observer setup.
- `BlockBrowserSelectionOwner.attach` now receives a structural hit-test
  capability rather than an HTML element. The editor's mounting boundary creates
  `BlockPointerHitTest`, which retains the registered-layout and nested-editor
  behavior. Selection attachment fixtures now provide that capability; hit-test
  assertions and spies target the extracted implementation without changing the
  expected results. The browser hit test itself still belongs to Page.
- Panel selection operations now check the panel-owned navigation controller's
  attachment directly instead of finding it again through the native surface.
  Navigation tests now cover detached Roots, synchronous teardown during the
  attachment check, and replacement on the same element. Cross-panel discovery
  still uses the existing native lookup until its own migration.
- `SelectionViewport.run` now borrows the initiating panel's navigation
  capability instead of looking up controllers by HTML element. Direct viewport
  fixtures pass the existing controller; their restoration assertions remain.
  A new test verifies that deferred restoration cannot mount through a replacement
  controller on the same surface.
- `InputRoot.readRegionViewportTop` provides a numeric viewport coordinate for
  the first matching descendant. Viewport restoration borrows it for anchor
  measurement instead of querying the native surface. The complete keyboard
  Root fixture supplies the new method, and direct viewport fixtures pass their
  existing input Root. New Root tests cover missing regions and detachment
  during lookup or measurement.
- `InputRoot.readRegionValues` and `measureRegionViewportBounds` expose matching
  identities and numeric viewport geometry without browser objects. Viewport
  restoration still chooses its own anchor, but Root owns the descendant scans.
  The complete keyboard Root fixture supplies these methods; direct viewport
  fixtures continue using their existing input Root. New Root tests cover
  duplicate values, nested descendants, and detachment during measurement.
- `InputRoot.captureDocumentScroll` returns a capability for adjusting the
  captured document scroll without exposing its element. Viewport restoration
  now borrows that capability; the complete keyboard Root fixture supplies the
  new method. Root tests cover detachment, document moves, and detachment while
  reading the current scroll position.
- `SelectionViewport.run` no longer takes an HTML surface. It keys settlements
  by the Root's opaque surface identity, or by the Root itself when a provider
  does not supply one. Direct fixtures now pass the existing Root only. Tests
  cover separate Root wrappers sharing a surface and detachment while reading
  the identity; the prior viewport behavior assertions remain unchanged.
- `InputRoot.observeWindowWheel` delivers browser-reported vertical deltas
  without exposing wheel events. Viewport restoration now owns its disposer
  instead of installing a window listener directly. The complete keyboard Root
  fixture supplies the capability; new tests cover detachment during delivery
  and cancellation while the viewport acquires the observation.
- `InputRoot.captureFrameClock` provides occurrence-bound monotonic time and
  frame requests without exposing a window. An accepted frame can still run
  after detachment so its owner can release pending work; new requests are
  rejected. The viewport borrows this clock and releases its settlement if a
  request is rejected. The complete keyboard Root fixture supplies the method;
  new tests cover detachment, document moves, and rejected viewport scheduling.
- `FrameClock.requestFrame` now returns an idempotent cancellation function for
  accepted frames and undefined for rejected requests, replacing its boolean
  return. Viewport restoration owns and cancels its outstanding correction
  frame. Existing clock assertions and the rejected-frame fixture now check
  the new return contract; new tests cover cancellation after detachment and
  cleanup failures without skipping other viewport resources.
- Deferred selection restoration now borrows the panel's existing mounted Root
  frame clock and stores its cancellation capability instead of a browser window
  and frame ID. The existing selection-manager test file moved into `__tests__`;
  its synthetic surface fixtures now provide the corresponding mounted Root,
  preserving their cancellation and replacement assertions. New tests cover
  rejected or throwing frame requests and frame-cancellation failures. The extension
  cleanup test also moved into `__tests__` and supplies its synthetic mounted
  Root, so it continues to exercise cleanup after a scheduled restoration.
- `InputRoot.observeInput` observes normalized bubbling input on the mounted
  occurrence, including nested surfaces. `FocusInput.hasRelatedTarget` distinguishes
  a missing focus target from a target without element ancestry. Deferred selection
  now borrows these capabilities and keys pending work by opaque surface identity;
  an old occurrence cannot restore work after a same-element remount. The keyboard
  Root fixture supplies the new observation method. Selection cleanup tests expect
  the browser adapter's explicit `false` capture argument when listeners are removed;
  the pending-surface fixture now changes the mounted Root rather than only mocking
  its native element. Tests also cover partial registration failure and remounts.
- `InputRoot.hasRegionAncestor` checks a rendered region's ancestry using its
  exact attribute identity and occurrence boundary. Panel selection now uses
  it for rendered nesting and reuses `adjacentTextPosition` for editable block
  traversal, including card scopes and edge mounting. The unused native block
  traversal helpers were removed. The keyboard Root fixture supplies the new
  ancestry method, and focused tests cover nested panels, unusual identities,
  detachment during lookup, and contentless navigation barriers.
- `InputRoot.captureTextOwnerScope` captures a local owner scope without exposing
  its element. `TextOwnerScope` checks for owners without directly owned content
  and can focus the captured scope. Structural-predecessor editing now borrows
  these capabilities and Root selection clearing; the unused native navigation
  scope and block lookup exports were removed. The keyboard Root fixture supplies
  the new capability. New tests cover scoped and nested content, owner removal,
  detachment during lookup, and occurrence replacement during editing.
- `InputRoot.findAdjacentOccurrence` exposes the immediate top-level neighbor
  through an opaque identity and occurrence-bound edge-text reads. Page navigation
  indexes its existing lifecycle owner by that identity and captures an attachment
  check before mounting, so same-element remounts cannot receive stale focus.
  The internal `getForElement` lookup was replaced by `getForIdentity`; its tests
  now use the registry key, and the keyboard Root fixture supplies the new method.
  New tests cover nested occurrences, removed destinations, same-element remounts,
  nesting during an attachment check, and source deactivation during mounting.
  The browser mounting adapter exposes
  `getBrowserElementIdentity` so standalone and Root-backed registrations for the
  same element replace each other; selection consumers receive only the identity.
- `InputRoot.readViewport` returns normalized viewport dimensions for the current
  occurrence. Slash menu positioning now uses that capability, and its portal
  is created by the editor mounting boundary only when the captured input
  registration still matches the mounted surface. Selection ownership now asks
  the panel whether an interactive surface is assigned instead of obtaining the
  native element. The keyboard Root fixture supplies the new viewport method;
  the selection ownership fixture now mocks the boolean availability check.
  Tests cover document movement, stale portal registrations and release-time
  selection ownership.
- `InputRoot.setTemporaryAttribute` borrows the occurrence's surface attribute
  for a gesture and returns cleanup that remains usable after detachment.
  Edgeless transform admission now reads panning state and publishes its active
  marker through the routed Root; the marker and canvas pins are cleaned up on
  failed preparation or cancellation. Moveable controls now require a current
  input registration before beginning. The keyboard Root fixture supplies the
  new method, and tests cover detached cleanup and failures acquiring or releasing
  the marker, including a new gesture started by cleanup. Native transform
  geometry was subsequently moved to Root region style sessions.
- Edgeless controls now capture the panel's input registration instead of its
  HTML element. `beginControls` accepts that registration, and control cleanup
  only cancels gestures started by the same registration. Lifecycle tests pass
  the current Root in place of the element. A same-element remount test verifies
  stale controls cannot begin or cancel the replacement occurrence's gesture.
- `InputRegion.captureStyles` reserves named CSS properties for a temporary
  style session; its finish operation can restore explicit styles after
  detachment without overwriting a newer session. Temporary Root and region
  attributes now also preserve newer owners when cleanups overlap. The
  Edgeless transform controller captures regions instead of DOM elements,
  excludes nested occurrences, and updates connector and target styles through
  these sessions. Its lifecycle tests now supply the panel's Root and check
  cancellation, remounts and preparation failure; new Root tests cover style
  and attribute ownership.
- `CanvasToolLayer` now receives an opaque surface identity and a narrowed
  attachment capability rather than a native root and full browser layers.
  Tool samples use the captured attachment's coordinate conversion and are
  discarded if the attachment changes during normalization. The existing
  remount test fixtures now supply the opaque identity, and regression tests
  cover replacement during coordinate conversion.
- Page's hovered selection feedback now owns a temporary Root region attribute
  instead of toggling an attribute that becomes inaccessible after detachment.
  Its existing behavior is retained; a new test covers a borrowed Root detaching
  before Page's selection feedback is disposed.
- `ReactPanelApi.getRoot` was removed from the consumer contract. Components
  and extensions use `inputRoot` capabilities; the React mounting owner retains
  its concrete panel and its internal native-root lookup. The panel lifecycle
  test now checks the current input registration instead of reading the element
  through the public API.
- The internal panel snapshot and surface context now expose a surface-specific
  interface rather than the concrete panel. It retains the Page mounting and
  nested-panel capabilities the view uses, but excludes panel and shared-editor
  destruction. The host panel owner continues to hold the concrete controller.
- `BlockEditorController.getRoot()` was replaced by its borrowed `inputRoot`.
  The Page mounting view compares the Root's opaque element identity with the
  committed surface and still attaches only when the host has not done so.
  Page and React lifecycle tests now compare occurrence identities or the
  absence of a Root instead of reading the native element; DOM rendering tests
  obtain elements from their own mounted fixtures. The standalone Page demo uses
  a temporary Root attribute for its focus marker.
- `InputRegion.readBounds()` returns viewport rectangle data while the captured
  occurrence remains current. The standalone Page drop inspector now measures
  the resolved anchor through that capability and compares opaque regions rather
  than reading the removed drop-target element. This restores its demo build.
- Structural pointer hit testing now borrows Root point, region identity and
  geometry capabilities. Page's registered layout lookup returns opaque region
  identities so custom rows and body slots retain their existing behavior;
  unregistered layouts use bounded region traversal. Page selection fixtures now
  supply a Root and layout registry to the hit-test constructor, and the keyboard
  fixture supplies the new Root methods. New tests cover nested occurrences,
  registered custom regions, nearest descendant rows and detachment.
- `DropSurfaceRegistry.register` and `BlockDropReceiver` now accept the receiving
  Root rather than an HTML element. Routing compares opaque ancestor identities;
  the Root owns the temporary surface marker and releases it even after detachment.
  Page drag occurrences capture a Root region bounded by their registration and
  no longer retain the receiving element. Receiver fixtures now supply explicit
  Roots. The marker-failure fixture throws on the first write so Root can perform
  its documented rollback, while still verifying that the prior registration survives.
- Panel availability subscribers are also notified when the input Root changes.
  The Page drag boundary observes that Root so it releases and reinstalls its
  receiver after a panel is disabled, re-enabled, or remounted on the same surface.
- Page's input dispatcher and event owner attach with the borrowed Root alone;
  their attachment tests now supply that Root instead of a separate HTML element.
  Pointer-move delivery uses Root's normalized input, and an uncaptured target is
  represented by a short-lived `InputHit` that consumers release after use.
  The old Page-only native context tests now verify opaque hit release, nested
  delivery and stale callbacks through normalized input; pointer-down coverage
  remains in the normalized dispatch tests. The temporary browser hit adapter
  still exposes native elements to the unmigrated Page drop geometry.
- `BlockDragRouter` now receives the source Root capability instead of an HTML
  element. Its fixtures create or reuse the owning Root; the keyboard fixture
  supplies the new document-capture operation required by `InputRoot`. Captured
  document capabilities reject detached, disconnected, or moved occurrences and
  preserve the caller's ownership of any borrowed hit. Receiver lookup uses the
  hit's opaque ancestor identity, replacing a browser-only ancestor helper.
- Page drop geometry now borrows document hit testing and region capture from its
  attached Root. Its result anchor and optional hierarchy outline remain bound to
  that exact Page attachment; stale or moved attachments produce no drop target.
  New tests check feedback capture, detachment during capture, and replacement
  during hit testing before any replacement registrations are inspected.
- Page drop resolution now checks the hit's nearest editor identity against the
  attached Root before walking geometry. A new lifecycle test covers replacement
  during that identity lookup. Drop geometry stores copied bounds and computed
  direction and token values rather than retaining DOMRect or CSS style objects;
  a new test checks that later browser changes cannot alter the captured values.
- `InputRegion.readLayout` returns copied viewport bounds, scale, direction, and
  requested computed CSS properties while the region remains owned. Page drop
  anchor, registered content, and list-direction measurements now use Root
  regions; its geometry snapshot test supplies a captured region. A detached or
  replaced measurement stops the query before later region declarations run.
- Layout-host and occupied-background bounds also use Root regions. The new
  measurement test checks copied bounds and invalidation during a browser read.
- Root regions now support selector matching and a bounded ancestor walk. Page
  background and adjacent-hit checks use these capabilities, so drop layout
  helpers no longer receive a native hit. New tests cover boundary ordering and
  discard a result when the hit or a previously visited ancestor path moves
  during traversal or measurement, even within the same boundary.
- `InputHit.isCurrent` reports whether its captured target remains connected and
  unreleased. Page's captured hit region is now bounded by that lifetime; a new
  test releases a borrowed hit during resolution and checks that no drop survives.
- `InputRegion.someAncestorWithin` replaces `someAncestorBefore` and includes the
  supplied boundary. The background consumer explicitly skips that boundary;
  ancestor tests now assert inclusive ordering. Nested drop lookup uses that walk
  and opaque registration identities; a new test covers a hit moving between
  branches during a registration read. Outline normalization uses the same
  attachment-bound walk; another test checks a moved starting region.

# Page drop-layout host identity

`BlockDropLayoutRegistration` now accepts `identity` instead of `element`.
Mounted React refs obtain the opaque identity at the browser boundary; the drop
resolver captures the corresponding region from its current Root when measuring.
Page drop-target and presentation tests now register or compare those identities
instead of reading the registered layout host element. Their geometry, ordering,
replacement, and cleanup assertions are unchanged.

`BlockDropTargetRegistration` and ordered layout items now also use `identity`
in place of `element`. Their React mounting owners capture identities from refs,
and the resolver measures and creates feedback through the attached Root. Tests
were updated to supply or compare identities while preserving the original
geometry, ordering, lifetime, and selection assertions.

`BlockDropMeasurements` now borrows its owning editor's layout registry; tests
construct that dependency explicitly. Drop measurement no longer consults the
global mounted-region lookup, and registrations in another editor cannot replace
the owning editor's identity lookup when the same element is temporarily shared.

`BlockLayoutRegions.register` now takes an opaque identity, and owned-role
lookup takes an attachment-bound region and Root. Mounting refs register their
elements through the browser adapter. Its weak lookups initially supported
native row-hover, but were removed after hover migrated. Tests register identities or use that
mounting adapter, and `block-layout-regions.test.ts` moved into `__tests__`.
The existing role, containment, replacement, and cleanup assertions are retained.

`BlockRowHover` and its tests moved into the browser boundary and `__tests__`,
respectively. Row feedback now uses Root's temporary attribute ownership, so
destroying an older hover owner cannot erase a newer owner's marker. The existing
hover, scrolling, listener cleanup, and bounded-geometry assertions are retained.
The browser hover owner now borrows the editor event observer for document scroll
and Root for frame scheduling and hit capture. Its fixture supplies the editor
events explicitly; a new test covers cancellation and a later attachment.
Hover now borrows the current editor Root for geometry and marker ownership;
its fixture supplies that Root getter. One existing mock rectangle now includes
width and height, matching the browser rectangle contract used by Root. The
original nested-whitespace assertion is unchanged, and a new test verifies that
detachment during measurement cannot mark a stale row.

`InputRegion.captureChildren` provides attachment-bound, indexed access to live
immediate children. Hover uses it for bounded list traversal and borrows the
occurrence's layout registry to resolve registered rows and child hosts. Its
existing test fixture supplies that registry; its hover and logarithmic geometry
assertions remain unchanged. New Root coverage checks live ordering and invalidation
when children move or the attachment ends. Hover also resolves captured hits and
registered slot ownership through Root and the occurrence's layout registry;
new tests cover both slot and body ownership without changing existing assertions.
The superseded browser-element layout lookups have been removed. Layout registry
and BlockEditor tests now inspect registered identities through the occurrence
registry and Root; their wrapped-role, nested-boundary, replacement, isolation,
and ref-cleanup assertions remain covered.

`PageBlockDrag.attach` now borrows the occurrence Root and target resolver without
receiving a native element. The React mounting boundary verifies the Root matches
its mounted element before attaching. Its source-lifetime test supplies the Root
directly; the mismatched-surface assertion moved to the mounting boundary, where
the verification now occurs. That test file remains under `__tests__` and uses
the `.tsx` extension for its React fixture.

`BlockVirtualizationController.attach` now accepts occurrence-region and
geometry-observation factories instead of an HTML host and margin callback. The
browser mounting adapter discovers the occurrence and owns the native host and
root for measurement; the controller owns the returned cleanup and registration.
Existing replacement and setup-rollback tests attach through that browser boundary,
as does the demo's observer and subscription cleanup fixture. A new test covers
geometry setup failure and duplicate attachment rejection; selection and cleanup
assertions remain unchanged.

Normalized `KeyInput` now includes `defaultPrevented`, copied when the listener
receives the event. The default Edgeless toolbar uses normalized document input
and a Root region for menu dismissal, retaining prevented-Escape, inside/outside
pointer, active-tool, and cleanup behavior. New tests cover these cases under
`__tests__`; the Page keyboard fixture supplies the new field without changing
its assertions. Custom toolbar layouts keep their own dismissal policy.

The unused `BlockBehaviorContext` type and `createBlockBehaviorContext` helper
were removed. They required a native surface even though production behavior
dispatch already uses snapshot and keyboard contexts. The existing behavior
fixtures now use `createBlockSnapshotContext`, removing their unused fake HTML
roots while retaining their selection, document, and behavior assertions.
Extensions should use `BlockKeyboardContext` for keyboard editing behavior and
`BlockSnapshotContext` for detached block snapshots.

`EdgelessSelectionController` now owns a supplied marquee and borrows its exact
occurrence Root instead of retaining a native root. Browser mounting creates the
marquee, and the controller reads pan markers through Root. Existing controller
and canvas fixtures supply those dependencies; the controller cleanup test moved
into `__tests__` with its assertions preserved. A new test covers pan admission
and replacement during a marker read; another covers same-element Root remount.
The controller also rechecks the captured Root after focusing, so a synchronous
replacement cannot clear selection or start a marquee; a new test covers that path.
The marquee rectangle and viewport measurement now use Root capabilities; their
browser implementation owns the native objects and rejects a detached occurrence.

Drag-handle click tracking now copies pointer identity and coordinates at the
React mounting boundary and observes the rest of the press through normalized
Root input. The existing handle tests moved to `__tests__`; their listener
cleanup assertion now compares the effective capture flag because the normalized
transport uses listener option objects when registering. Threshold, navigation,
pointer identity, cancellation, and cleanup assertions remain in place.

The private `CanvasDragInput` adapter now lives in Edgeless's browser boundary
and forwards its current native event directly to Moveable. The React transform
component receives only Alt and Shift values. Its existing input tests now
inspect the event at the library handoff, retaining nested, reentrant, touch,
and cleanup assertions; a new test checks modifier updates before the current
Moveable ref is read.

Moveable's private control callbacks and DOM geometry conversion now reside in
the Edgeless browser boundary. Their existing geometry test moved into
`browser/__tests__` with only import paths changed; its bounded-scan and
alignment assertions are unchanged. The DOM target and marker helpers and their
existing `__tests__` moved to the same browser boundary; their behavior and
assertions are unchanged.
The standalone canvas cancellation browser test now waits until its pointer-down
listener is installed before dispatching input. Its cancellation and no-commit
assertions are unchanged; this fixes a setup race observed in a 12-worker run.

Edgeless transform modifiers now observe the mounted viewport's normalized
window input instead of the global window. They continue to update on keydown
and keyup and reset on blur. New tests cover the owning iframe, observation
cleanup, and rollback when registration fails; existing transform assertions are
unchanged.

Root now normalizes `pointerleave` and supplies `InputTarget.captureTargetHit`
for the original connected event target, including captured pointers. Existing
test doubles implement the new target capability. Hover pointer movement and
leave now use Root's normalized browser listener transport rather than registering
native listeners directly. The borrowed listener includes nested input so the
outer marker is still cleared when the pointer enters a nested editor.

`CanvasMarquee` is exported from `@chulane/rivto-edgeless` instead of its
`/browser` entry. Its constructor takes an occurrence-bound Root rectangle
overlay rather than an HTML element, and `snapshot` takes an `InputRegion` and
returns undefined when that occurrence is inactive. `InputRoot` now provides
`createRectangleOverlay` for styled, data-marked client-coordinate rectangles.
The existing marquee tests moved under `core/__tests__` and retain capture,
selection, geometry, and cleanup assertions; an additional test covers detach
during capture. React fixtures now supply the same Root used by their controller.

The Page normalized keyboard fixture implements the complete InputRoot contract;
it now supplies the rectangle capability without changing its keyboard assertions.

Eraser feedback now reads and marks regions owned by its current Root. The new
`__tests__/eraser-feedback.test.tsx` covers nested occurrence isolation, marker
restoration, and remount. The existing eraser browser test additionally asserts
the visible target marker before release, while retaining its deletion checks.

Root's normalized mouse input now includes `contextmenu`, including its target,
button, coordinates, and default-cancellation capability. Edgeless tool reset
registers context-menu and secondary-pointer observations through panel events;
its handlers retain browser-default cancellation and release registrations when
the visual layer unmounts. New Root, panel, and browser tests cover normalization,
cleanup, tool reset, and the exclusion of editor controls.

Visual tool state markers now use temporary attributes on the exact mounted Root
instead of direct dataset writes. Cleanup restores previous values, including
after detachment, without removing markers owned by a replacement occurrence.
New tests cover replacement, partial setup failure, and detachment during setup.

`InputRoot.observeWindowInput` observes normalized input in the occurrence's
window with a caller-selected capture or bubble phase. It replaces
`observeWindowPointerDown`; property previews use capture-phase pointer presses to commit on
outside presses without retaining a native window or event; cleanup commits the
pending preview and releases the captured observation. The unused `panelRef`
option was removed from `EdgelessPropertiesPanel`. The complete InputRoot test
fixture supplies the new observation capability without changing its assertions.
New tests cover inside and outside presses, Root replacement, detachment, and
document movement; browser tests retain the property editing and commit checks.

TODO storage menus use the same Root capability for outside pointer presses and
for Escape after inner controls can consume it. The keyboard test fixture now
supplies the renamed capability. The Root window-input test moved into its
`__tests__` folder and checks bubble-phase default prevention as well as capture.

`InputRoot.writeClipboard` writes named string formats through the occurrence's
own document and window. Its asynchronous format list selects the ClipboardItem
formats; the copy-command fallback writes every supplied format. Clipboard menu
actions now require the invoking panel to remain attached when the write starts,
and cut still checks the same occurrence after the asynchronous write. The Page
keyboard test's complete InputRoot fixture supplies the new method; its keyboard
assertions remain unchanged. New Root tests in `__tests__` cover an iframe window,
fallback formats and cleanup, rejection without fallback, and detachment.
The existing browser-clipboard tests moved into `__tests__` and mount their
invoking panels in a browser test environment. Previously their menu calls used
global clipboard doubles without an attached occurrence; their assertions about
embedding references and preserving cut data on permission denial are unchanged.

Clipboard `parseHTML` converters receive detached `HtmlElement` data instead of
native `Element` instances. Tag names remain browser-parsed; attributes are read
from `attributes`, and ordered text and element descendants from `children`.
The Root browser boundary owns HTML parsing and attribute lookup. Existing
shape and demo Counter converters now read the detached attributes. New tests
under `__tests__` cover tree data, nested lists, ignored content, converter
ordering and Page's canvas-element restriction. The exported `clipboardHTMLText`
helper likewise accepts detached `HtmlNode` data instead of a browser `Node`.

Moveable's control accessibility setup and native keyboard listener now live in
the Edgeless browser adapter. The React effect supplies the current library
controller, selection and markers, and owns the returned cleanup. The public
control adapter contract is unchanged. A new test under `__tests__` verifies
keyboard resize and rotation, marker ordering, and cleanup.

`BlockEditorAttachment` no longer stores a native root element. Page captures
its virtualization region from the attachment's Root identity, and rolls back
the attachment if that Root ends during capture. The new tests under `__tests__`
verify borrowed Root ownership and capture-time rollback.

`BlockEditorController.attach` now accepts a host-owned `PageInputRoot` only;
the host creates and detaches the occurrence. React's panel passes its mounted
Root, while standalone `BlockEditorScope` creates and releases its own Root.
The attachment rejects inactive Roots and its disposer releases Page resources
without detaching a borrowed Root. The former mismatched-element assertion is no
longer applicable because the API does not accept an element; its lifecycle test
now checks rejection of an inactive Root. Existing Page attachment fixtures now
use a test-owned Root, preserving their input, selection, drag and cleanup
assertions. Three edited tests were moved into their nearest `__tests__` folders:
`editor/block-editor-controller.test.ts`,
`editor/selection/block-pointer-selection.test.ts`, and
`editor/extensions/block-editor-extensions.test.ts`.

<details>
<summary>Page attachment tests updated for Root ownership</summary>

- `packages/rivto-page/src/editor/__tests__/block-editor-controller.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drag-browser-hit.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drag-extension.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drag-focus-lifetime.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drag-reentrant-cancel.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drag-replacement-error.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drop-target-root.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/block-drop-targets.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/gap-region-boundary.test.ts`
- `packages/rivto-page/src/editor/drag-and-drop/__tests__/outline-boundary.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-editor-events.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-input-cross-document.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-input-listeners.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-input-pointer-delivery.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-input-public.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-input-scope-snapshot.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/block-input-text-target.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/borrowed-input-root.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/borrowed-root-input-region.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/focus-initial-identity.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/focus-root-lifetime.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/input-predicate-removal.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/input-root-cleanup.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/input-root-dispatch-lifetime.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/input-root-lifecycle.test.ts`
- `packages/rivto-page/src/editor/events/__tests__/pointer-redispatch-registration.test.ts`
- `packages/rivto-page/src/editor/extensions/__tests__/block-editor-extensions.test.ts`
- `packages/rivto-page/src/editor/keyboard/__tests__/block-keyboard.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/block-caret-focus.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/block-native-selection.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/block-pointer-selection.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/block-selection-feedback-region.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/browser-selection-attachment.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/horizontal-caret-capability.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/pointer-occurrence-replacement.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/pointer-range-selection.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/pointer-start-target.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/selection-root-lifetime.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/structural-click-input.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/structural-focus.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/structural-occurrence-replacement.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/text-drag-occurrence-replacement.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/vertical-caret-capability.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/vertical-caret-duplicate.test.ts`
- `packages/rivto-page/src/editor/selection/__tests__/vertical-caret-mount.test.ts`
- `packages/rivto-page/src/editor/virtualization/__tests__/attachment-root-region.test.ts`
- `packages/rivto-page/src/editor/virtualization/__tests__/virtualization-observation.test.ts`
- `packages/rivto-page/src/presentation/components/block-editor/__tests__/block-editor-scope-attachment.test.tsx`
- `packages/rivto-page/src/presentation/components/block-layout/__tests__/block-row-hover.test.ts`

</details>

Page input registrations support the `including-nested` scope when an observer
must see input from nested editor occurrences. Default root registrations retain
their local-only behavior. Row hover uses this scope with normalized capture and
leave observations; it keeps an opaque occurrence identity instead of retaining
the mounted element or installing a separate native listener. The existing
`block-row-hover.test.ts` fixture now supplies that identity, and
`block-input-scope-snapshot.test.ts` checks local and nested delivery.

`MarkdownLinkClick.event` is replaced by `preventDefault()`. Hosts receive the
block ID and sanitized URL as before and can cancel browser navigation during the
callback without receiving a React event or HTML element. The demo and Markdown
guides use the new capability. New Page/Edgeless link timing tests live under
`e2e/__tests__`; the existing ordinary-link and custom-protocol assertions remain
unchanged.

Page navigation now borrows a Root instead of retaining a native element. Its
`setRoot` internal contract accepts the occurrence itself; the panel passes its
mounted Root. `InputRoot.suspendScrollAnchoring` restores the original inline
style after overlapping owners release it, including after detachment. Root's
existing owned-region scrolling now also supports surfaces whose panel boundary
is an ancestor, while continuing to exclude nested panel boundaries. The Page
keyboard fixture supplies the new Root operation. Existing navigation, canvas,
selection-owner, and selection-viewport tests now construct borrowed Roots;
the former `PanelDOM.findBlock` test double is replaced by a Root scrolling
double. New tests cover overlapping suspensions, failures, replacement during
setup, and unmarked surfaces under a panel.

The concrete React panel no longer retains or returns its native root element.
Its mounting boundary keeps an opaque surface identity through synchronous
cleanup and owns the mounted Root; focus checks and inert/attribute updates go
through that Root. The obsolete concrete `getRoot()` method was removed.
Tests in `panel-page-attachment`, `contentless-focus-root`,
`panel-registration-identity`, `collapse-root-lifetime`, and
`delete-root-lifetime` now assert Root identity or interactive availability.
`extension-manager` and `panel-selection-manager` no longer install unused
`getRoot` doubles; their existing cancellation and restoration assertions remain.
New Root mount-attribute and panel focus tests are in `__tests__`.

Table column resize now consumes normalized pointer and keyboard input and
borrows the active occurrence Root. Root captures matching owned regions and
priority-preserving inline style sessions; window cancellation and pointer
capture are released with the gesture. The resize separator is marked with
`data-table-resize-handle` for its mounted input attachment. The Page keyboard
fixture supplies `findRegionsByAttribute`, and the existing table resize test
was moved to `__tests__` and now delivers normalized input through a test-owned
Root listener. Its commit, undo, cancellation, stale-column, cleanup-failure,
and foreign-occurrence assertions remain, with additional reentrant capture and
Root replacement checks. Root tests in `__tests__` cover inline style priority,
ownership replacement, and first matching owned-region lookup.

`placeCaretAtPoint(HTMLElement, ...)` is no longer exported by the React package.
Use `InputRegion.placeCaretAtPoint` on a region captured from the current Root;
the browser implementation retains the existing geometry and collapsed-start
fallback. `EditableLabel` now obtains the panel Root from its EditorPanel context
and retains a requested point until its occurrence becomes available. Its public
types remain exported from the package and now live in `components/types.ts`.
New tests cover caret placement, detachment during focus, delayed attachment, and
replacement during focus. Existing label browser scenarios retain their assertions.

`InputRegion.observeBounds` now supplies an initial viewport rectangle and follows
resize and ancestor scroll without exposing browser elements. The edgeless grid
spotlight borrows this region, a Root frame clock, and an overlay style session;
it no longer retains native viewport or overlay elements. Its existing scroll and
resize test moved into `__tests__` and keeps the original assertions, with added
coverage for frame coalescing, pan suppression, detachment, and cancellation.

`EdgelessSurfaceController` now borrows the exact mounted Root for pan state
and owns temporary pan marker leases instead of retaining the viewport element.
Callbacks captured for a replaced Root are ignored and cleanup restores earlier
marker values. The existing card-focus fixture no longer assigns an unused
viewport field; its focus assertions are unchanged. New tests cover marker
restoration, replacement, and partial setup failure.

`InputRegion.beginEditableTextSelection` now owns nested editable hit testing,
focus, browser selection, and temporary pointer listeners. `usePreventTextEditing`
keeps its existing React attributes while passing only copied pointer fields and
cancellation to Root; its selection owner releases subscriptions on completion,
unmount, or Root replacement. The hook now requires an EditorPanel context, and its
public attribute type remains exported from the hook with its declaration in
`hooks/blocks/types.ts`. New tests cover hit rejection, pointer identity, cleanup,
setup failure, and Root replacement. A new browser performance test exercises
actual code selection in Page and Edgeless at normal and large document sizes.

The inline-code line-height selector also matched fenced-code content. On the
unchanged baseline Firefox's Edgeless code editor had zero height, preventing
selection. The selector now excludes the fenced-code wrapper; the new browser
check asserts a nonzero editor height and verifies the actual selection.

`EditableLabelProps` now exposes its actual text, editing, caret, and class-name
contract instead of inheriting arbitrary native HTML attributes and event callbacks.
Its workspace consumer already uses only these named props. Internal React event
handling remains in the label and is still part of the remaining browser audit.

DOMEventName now denotes Root's supported input literals and no longer takes a
DOM target type parameter. Registrations that used browser-only names must move to
a supported normalized input or a custom event. Touchstart is included as a
normalized notification with cancellation and target capabilities; the existing
Moveable adapter still owns any native input needed by that library. Event type
declarations were consolidated into managers/events/types.ts. A compile-time
contract covers supported and unsupported names, and a Root test covers the
existing touch-start delivery and cancellation behavior.

React keyboard binding, keymap, and KeyboardApi declarations now live together in
managers/keyboard/types.ts. Package-level exports remain available; internal
direct imports and the historical audit link were updated. No keyboard behavior
or test assertion changed.

Bento resize no longer passes its mounted tile element into the controller. The
handle's browser adapter resolves its tile and sibling lane within the borrowed
panel Root, and the active gesture owns temporary region styles and its panel
availability subscription. `InputRegion.readLayoutWidth` exposes the local CSS
pixel width needed to freeze sibling slots without exposing elements. Existing
resize tests use Root regions, and new cases cover the nested handle wrapper,
synchronous cancellation, and replacement of a Root on the same element.

`BlockEditorScope` now borrows an `inputRoot` capability instead of accepting an
HTML `root` and attaching it itself. Hosts must attach their controller and pass
the matching occurrence Root. The standalone `BlockEditor` still creates and
releases its own Root when a host has not already attached that view; a host-owned
attachment remains attached when the view unmounts. Its rendering scope depends
on `BlockEditorScopeApi`, which does not expose the controller's attach operation.
The attachment tests cover both ownership paths and remain in `__tests__`.

Edgeless transform controls now react to panel Root registration changes directly,
including disable and re-enable without a surface remount. Their props interface
is declared in the Edgeless `types.ts`; their input behavior and public package
exports are unchanged.

`BulletThreadingAnchor` no longer receives or returns browser elements. It receives
a block capability with `captureChildren()` and returns an occurrence-owned region
identity capability, or `undefined` to skip the block. An anchor outside the block
or current occurrence, a detached anchor, and an anchor with zero dimensions are
ignored. The demo now finds its row and controls through region operations. The
threading browser observer and DOM path traversal moved under the extension's
`browser/` directory; tests cover foreign anchors and detachment during a callback.
`InputRegion.observeSize` is a new required Root capability for implementations;
it observes size without exposing a browser element and releases its observer on
cleanup. It throws when browser size observation is unavailable, preserving the
threading extension's earlier failure for that missing browser capability.
`InputRegion.observeStructure` is also required for subtree child-change
notifications. Root's normalized input literals now include window `resize`.
Threading borrows these observations and its frame clock from the current Root,
and no longer installs native focus, scroll, resize, or mutation listeners itself.
`InputRoot.captureFocusedRegion` and `someTopLevelRegion` are new required
capabilities for normalized focus and bounded traversal; the Page keyboard test
fixture supplies no-op implementations without changing its assertions.
`InputRoot.createPathOverlay` is a new required capability for a body-hosted SVG
path. Bullet threading uses it for creation, bounds, path updates, and cleanup;
it no longer exposes native surface or SVG references to its ordinary logic.
The Page keyboard test fixture supplies a no-op path overlay without changing its
assertions. Root and threading tests cover setup rollback, replacement on the same
surface, and cleanup after detachment.

`BrowserEvents.attach` now borrows a browser-backed Root instead of receiving an
HTML element. Detaching the event manager leaves the Root with its owner; a
detached Root no longer blocks a replacement event manager on the same element.
`CanvasViewport.attach` can borrow a matching host Root or create and release its
own for standalone use. `CanvasView.inputRoot` accepts the host Root, `null` while
waiting for it, or omission for standalone ownership. Panel-backed Edgeless views
pass their mounted occurrence even while routing is disabled. Viewport operations
stop when the borrowed Root detaches, and late cleanup cannot withdraw a newer
viewport on the same element.

The following existing tests now create a fixture-owned Root before attaching
`BrowserEvents` and release it with their existing attachment. Their event-order,
claim, nested-boundary, and cleanup assertions are unchanged:

<details>
<summary>Updated event attachment fixtures</summary>

- `packages/react-rivto-editor/src/extensions/edgeless/visuals/components/__tests__/preset-pointer-input.test.tsx`
- `packages/react-rivto-editor/src/extensions/edgeless/visuals/hooks/__tests__/preset-drag-attachment.test.tsx`
- `packages/react-rivto-editor/src/extensions/edgeless/visuals/hooks/__tests__/preset-pointer-subscription.test.ts`
- `packages/react-rivto-editor/src/extensions/edgeless/visuals/hooks/__tests__/tool-gesture-attachment.test.tsx`
- `packages/rivto-edgeless/src/browser/__tests__/canvas-control-modifiers.test.ts`
- `packages/rivto-edgeless/src/browser/__tests__/canvas-events.test.ts`
- `packages/rivto-edgeless/src/browser/__tests__/canvas-tool-cancellation.test.ts`
- `packages/rivto-edgeless/src/browser/__tests__/canvas-tool-input.test.ts`
- `packages/rivto-edgeless/src/hooks/__tests__/canvas-tool-input-lifecycle.test.tsx`
- `packages/rivto-root/src/browser/events/__tests__/browser-event-phase-snapshot.test.ts`
- `packages/rivto-root/src/browser/events/__tests__/browser-events.test.ts`
- `packages/rivto-root/src/browser/events/__tests__/nested-observation.test.ts`
- `packages/rivto-root/src/browser/events/__tests__/passive-groups.test.ts`

</details>

The existing canvas input controller tests were moved to
`packages/rivto-edgeless/src/browser/__tests__/canvas-input-controller.test.ts`;
only their relative imports changed.

`CanvasInputController` now receives the attached Root after its event registrar.
It borrows the Root's frame clock for pointer and wheel panning; it does not own
or detach the Root. `CanvasViewport.attach` rejects a Root whose surface does not
match the viewport; callers of the controller must supply events attached to the
same Root. `CanvasViewport.attach` and `CanvasView.inputRoot` therefore
require the host Root's `captureFrameClock` capability. The canvas input and event
test fixtures pass their existing fixture-owned Root to the controller; their
existing gesture and event-order assertions are unchanged. New tests verify that
pending pan and wheel frames do not publish after the borrowed Root detaches.

Canvas input now borrows Root focus operations: the controller no longer reads
`document.activeElement` or calls the viewport element's `focus` directly.
`captureFocusedRegion` accepts an optional boundary selector; omitting it retains
focus lookup through nested content, as the canvas previously did. `InputRoot.focus`
accepts `preventScroll`, defaulting to true as before. The canvas passes false to
preserve its prior browser focus behavior. Host Roots passed to `CanvasView` or
`CanvasViewport` must supply these two capabilities. Existing canvas assertions
remain unchanged; new Root and canvas tests cover focus ownership and scroll policy.

Canvas input obtains viewport bounds, computed line height, and page-wheel inner
size through a region captured from its borrowed Root. Host Roots passed to the
canvas must supply `captureRegionByIdentity`. `InputRegion.readClientSize` and
`readComputedProperty` are new required capabilities for region implementations;
both return no value when their ownership ends during a read. The existing Root
region-layout test now also checks these values and detachment; its previous
geometry and scale assertions remain unchanged. Existing canvas wheel-unit and
gesture assertions are unchanged, and a new test covers detachment while zoom
geometry is read.


`CanvasInputController` now receives the scene, event registrar, Root, and options;
it no longer accepts an HTML viewport argument. Its Root creates a rectangle inside
the viewport with the existing clipping and presentation, and removes it during
controller cleanup. `RectangleOverlayStyle` accepts a root container and CSS
properties for this use. The earlier test for mismatched HTML viewport and Root is
replaced by a detached-Root test because the controller no longer receives an
HTML viewport; the viewport attachment continues to reject mismatched Roots.
A marquee regression preserves selection, local positioning, hiding, and cleanup.

Page keyboard event construction now uses the primary modifier already captured
by its keyboard transport, rather than reading the browser platform on each input.
`BlockKeyboardEvent` is exported only as a type; the internal normalized-input
fixture now supplies its modifier explicitly and retains its existing assertions.
A regression verifies that shortcut descriptions and action matching remain
consistent if the platform value changes after the runtime is created.

`InputRoot.hasRegionByAttribute` is a new required capability for checking an
exact descendant attribute within an occurrence while excluding nested editor
boundaries. Page's virtualized selection check now borrows it instead of
constructing a CSS selector itself. The normalized keyboard fixture supplies a
no-op implementation to satisfy the complete Root contract; its keyboard
assertions are unchanged. New tests cover selector characters in IDs, nested
occurrences, ownership changes during lookup, and the targeted query.

The unused internal `PanelDOM`, `isInPanel`, and `findPanelElements` helpers and
`PanelDOM` manager-barrel export were removed. They were not exported from the
package entry point and had no production callers. The old panel containment test
moved into `panels/__tests__` and now checks the same owning and nested occurrence
cases through Root regions using actual DOM nodes. The Page navigation test checks
that the same direct row, rather than a descendant row, is identified through Root
child regions. These replacements retain the original boundary and row assertions.

`useEditorRoot()` now exposes only the surface mounting `ref`; its former
`element` field is no longer public. Page drag and Edgeless selection compare
opaque surface identities, while React surface portals resolve their DOM host
inside an internal rendering boundary. Custom surfaces still assign `ref` to
their container; consumers use the panel's `inputRoot` for browser operations.
The Root hook test checks the public keys, mounting callback, and portal cleanup.

The unused internal `dom-nodes` helpers and their manager-barrel export were
removed. They had no production or test consumers and were not exported by the
React package entry point; cross-realm browser mechanics remain in Root.

`InputRoot.focusRegionByIdentity` is a new required capability for focusing an
owned, connected region without exposing its element. Its optional boundary
selector excludes nested occurrences, and focus handlers that detach or move the
region invalidate the request. Deferred block caret restoration now captures the
editable's opaque identity at mount and uses this Root operation, then checks the
focused host's identity before restoring the caret. The complete Root fixture in
`block-keyboard-normalized.test.ts` supplies a no-op implementation; its existing
keyboard assertions remain unchanged. New tests cover normal restoration, a
different host taking focus, a foreign editable, and nested occurrence boundaries.

`InputRoot.captureEditableTextByIdentity` is a required capability that captures
an owned editable by its opaque identity. The returned capability reads and
synchronizes text only while the editable remains in its original Root and
boundary. Complete InputRoot implementations and test fixtures must provide it.

Text editing attributes are still spread onto a React contenteditable, but their
public input and composition callbacks no longer expose React or native events.
Calling them without React delivering an event does not edit the block. To group
text input with other changes, pass `runTextInput` to `useBlockEditing` and call
its `apply` callback synchronously inside the desired transaction. TODO editing
uses this option to retain its timestamp update in the same transaction.

The block editing controller test moved into `hooks/blocks/__tests__` and retains
its text and composition assertions. Additional tests cover stale input,
replacement of an editable, and Root attachment or replacement, including when a
panel is disabled. The normalized Page keyboard fixture supplies the new Root
method without changing its keyboard assertions.

The internal Page selection host now borrows `mountedRoot` attribute reads in
place of its optional `getRoot` element getter. A mounted Page occurrence in an
Edgeless document therefore uses its own surface marker when deciding whether a
gesture can start. Replacing or detaching that Root during a marker read rejects
the current gesture. The existing selection fixture now supplies a browser Root;
its original selection assertions remain intact, and new tests cover the real
panel attachment and replacement during a read.

`PreventTextEditingAttributes.onPointerDown` no longer exposes a React pointer
event in its public type. Spread the attributes onto the nested control so React
delivers the pointer; invoking the callback directly without an event does
nothing. Root still owns the resulting selection and temporary pointer tracking.

`EditableText` now also requires `readRenderedText` and `insertText` for visual
labels. Rendered reads preserve browser line breaks, while insertion prefers the
browser's native editing operation and rejects insertion if focus or selection
belongs outside the captured host. Implementations of this Root capability must
supply both operations.
Block editing borrows only its existing text operations; visual labels borrow the
rendered-text and insertion operations they use. A label waits for its owning
Root before seeding text or focusing, and retains its last owned draft if the
Root detaches before blur.

The old `components/editable-label-text.test.ts` moved into `__tests__`: its
rendered-text assertions moved with the implementation to Root, while its
newline-input assertion remains in React. New tests cover the native insertion
path, fallback insertion, foreign selections, Root replacement during focus,
foreign focus, and preserving an owned draft after detachment. Insertion fixtures
now focus their owned host before invoking this capability. A new typing performance test
also resides in `e2e/__tests__`.

An initial assertion that Ctrl+Z should undo the native label DOM edit failed in
both Chromium and Firefox, in parallel and serial runs. The existing history
extension deliberately routes the shortcut to collaborative document history;
undoing the newly created visual caused the test's `last()` locator to select
another label. That incorrect assertion was removed from the new timing test.
The Root unit test verifies that insertion still attempts `execCommand` first;
this does not claim that keyboard shortcuts use the browser's private undo stack.

`BlockDropTargetProps` and `BlockDropExcludeProps` no longer inherit React HTML
attributes or native-event callbacks. Put styling, accessibility attributes,
refs, and React handlers on the existing `asChild` element, or register editor
input through the normalized event API. `BlockDropTarget` retains support for an
absent child while a target is not rendered. The type declarations moved to the
adjacent `types.ts` and remain exported from the same
package entry point. The exclusion test retains its original marker, identity,
and cleanup assertions and now also checks the child's class and click handler.
The new absent-child test compares against the same empty editor without a drop
declaration. Its initial assertion incorrectly expected no exclusion marker, but
the existing editor already renders an inert spacer; the comparison retains that
baseline and checks that the absent target adds no markup.

`InputRegion` implementations now provide `observeInput` for normalized input
on a captured region in capture or bubble phase. Page exposes this through
`BlockEditorEventsApi.observeRegion`; subscriptions follow the attached Root and
are released when their registration or editor is destroyed. Callbacks receive
normalized input and only the region capability needed to set a temporary
attribute. Stopping propagation uses the normalized input capability.

`BlockItemProps` no longer accepts inherited native React event callbacks. Use
`bindInput` to register a region observer and return its cleanup. The supplied
identity belongs to that mounted item and must not be reused after unmount. The
nested wrapper test now uses this API and retains its original inner-before-outer
bubble and removal assertions. Additional tests cover cancellation, Root
reattachment, registration failures, and restoring wrapper markers on cleanup.
The demo wrapper restores its marker on each pointer delivery even if another
actor removed the marker since the previous delivery.

A new Root test initially assumed `InputTarget.hasAncestor` became unusable after
delivery; the existing contract only instructs consumers not to retain the
capability. The test now checks the documented expiration of a captured target
hit instead, without changing that existing behavior.

`BlockEditorProps` no longer inherits React native event callbacks. Register root
input through `editor.events.observe` or `editor.events.register`, selecting the
capture phase explicitly where needed; registrations follow editor attachment and
retain their documented priority and cleanup semantics. React synthetic events
and normalized browser input are different contracts, so choose the corresponding
browser input name when migrating a handler. Root styling, accessibility
attributes, children, and the mounting ref remain available. The public type is
now declared in the adjacent `types.ts` and remains exported from the same entry
point. A new test checks capture and bubble delivery, detach, remount, and retained
presentation attributes; no existing event assertions were removed.

`DragHandleProps` no longer inherits other React native event callbacks, such as
`onKeyUp` or `onPointerEnter`. Its existing `onOpen` and `onMenu` actions, button
attributes, and accessibility properties remain. The mounting ref was retained
at that stage and removed in the later handle binding change below. Other input can be
registered with the editor's normalized input API; React synthetic event names and
browser input names do not always have identical propagation behavior. The type
moved to the adjacent `types.ts` and remains exported from the same entry point.
Existing handle interaction tests remain unchanged, and a new type-contract test
checks the public actions and excluded callbacks.

`BlockRowProps` and `BlockChildrenProps` no longer inherit React native event
callbacks. Their optional `bindInput` receives the mounted region's opaque
identity and normalized `observeRegion` registration; callers return cleanup.
Capture and bubble callbacks retain browser region order. Bindings release on
replacement or unmount; their listeners detach and reconnect with the Root. The prior item binding type is retained;
`BlockLayoutInputBinding` names the same contract for any of these layout regions.
The prop declarations moved to their adjacent `types.ts` while preserving their
existing package exports. A new nested row/child-host test checks capture and
bubble order, styling, cleanup, and remount; the existing item binding tests moved
with the generalized private hook and keep their setup and cleanup assertions.
A standalone browser fixture, built as an additional demo entry, checks the same
nested capture and bubble order after a view remount in Chromium and Firefox.

`DragHandle` no longer forwards an HTML button ref. Its `bindHandle` callback receives
the mounted handle's opaque identity and returns a cleanup; the `onMenu`
coordinates remain unchanged, and Page drag activation continues to use the
handle marker. The React block menu captures that identity and the current panel
Root at invocation, then asks that same Root to restore focus when the menu closes. A replaced or detached occurrence,
foreign handle, or removed handle is not focused. `InputRoot.focusRegionByIdentity`
accepts an optional focus-options argument: scrolling remains prevented by default,
while the menu explicitly preserves the prior browser behavior that permits
scrolling. Existing callers need no change. The Root and handle tests cover both
focus options, reentrant detachment, identity, and replacement; the previous menu
focus and drag assertions remain. A new React test initially ran in the package's
Node environment and failed because `document` was unavailable; it now selects
jsdom explicitly and passes.

`BlockSlotPlacementProps` no longer inherits React native event callbacks. Its
optional `bindInput` registers normalized input on the mounted slot identity and
returns cleanup; a slot that renders no host installs no binding. Styling and
accessibility attributes remain available. Slot presentation types moved to their
adjacent `types.ts`, with the existing package export preserved. A new test checks
registration and removal as a contribution appears and disappears. The existing
browser fixture now uses a manual start slot with an interactive contribution;
its original row and child-host assertions remain, and a new case checks nested
slot capture/bubble order and remount in both browsers.

`BlockView` now forwards `RegionIdentity` instead of `HTMLDivElement`. Use that
opaque identity with the owning Root for geometry, focus, or other supported
operations; the identity does not establish an attachment lifetime on its own.
`BlockViewProps` no longer includes React native event callbacks. Its optional
`bindInput` installs normalized input and requires a BlockEditor context; an
unbound BlockView still renders independently. Presentation attributes and
children remain available. Its prop declaration moved to the adjacent `types.ts`
and remains exported from the same package entry point.

`BlockDropTarget asChild` accepts a composed Page shell's identity while retaining
its existing support for ordinary ref-forwarding DOM children, without adding a
wrapper. The layout registry and drop target use the same shell identity.
Browser identity capture now returns the nominal `RegionIdentity` type, preventing
an HTML ref from being passed where a shell identity is expected. A type test
first failed with an unused `@ts-expect-error` when the ref was merely `object`,
because TypeScript accepted an HTML ref; the nominal type makes that rejection
real. New tests cover shell input, callback-ref cleanup and replacement, drop
composition, and ordinary and cross-window DOM targets. The existing demo fixture
retains its row and slot assertions and adds shell and foreign-window checks.
The existing handle-mount performance test previously waited for only 200 of the
3,060 handles in the large fixture. One after-change sample captured 3,055, so
the test now waits for all 60 base handles plus the 15 handles in each repeated
branch before recording a sample. The incomplete sample is retained in the raw
log but excluded from the matched comparison; the corrected test was rerun.

`BlockRow`, `BlockChildren`, `BlockItem`, and `BlockDropWrapper` now forward a
`RegionIdentity` instead of an `HTMLDivElement`. Use the owning Root to inspect,
measure, or interact with the mounted region. Ref callbacks still receive null or
have their returned cleanup called on replacement and unmount. `BlockDropTarget`
and `BlockDropLayout` compose both these identity refs and ordinary DOM child refs
without adding markup. Bento's tile uses the identity ref only to track whether
its resize controls may mount; its resize geometry still comes from Root.

Existing Page tests that used an HTML ref now compare the forwarded identity with
the corresponding mounted element's browser identity. Assertions about wrapper
nesting, styling, counters, cleanup, and stable unaffected wrappers remain and use
the rendered elements directly. New tests reject native refs at compile time and
cover drop-layout composition and ref-callback replacement/cleanup. The layout
option and wrapper prop types moved to the adjacent `types.ts` while retaining
their existing package exports.

The shared browser ref owner now rolls back its layout registration if a caller's
ref throws, releases late cleanup from a reentrant replacement, and attempts both
registration and caller cleanup if either fails. The corresponding failure tests
initially exposed a retained registration and a lost cleanup. Shell and input
refs also guard against reentrant replacement. The old browser registration helper
was removed; its existing registry tests now construct the same browser identities
directly, retaining their original assertions. Identity comparisons in the new
tests use reference equality because distinct opaque identities have no enumerable
fields and Jest's structural equality treats them as equal.

The internal React surface context now carries an opaque surface identity instead
of an element. Existing selection, text-input, drag, and slash fixtures provide
that identity; their behavioral assertions remain unchanged. Portal fixtures
also supply the private browser portal host, preserving their existing remount,
nested-slot, stale-registration, and command assertions. Surface portals reject
a host that does not match the current surface identity. The public mounting ref
continues to receive the native element at the React mounting boundary.

The private Page virtualization registry now matches views by opaque surface
identity instead of constructing a second browser region. Existing registration,
replacement, observation, rollback, and destruction assertions use that identity.
The former synthetic-region invalidation test now checks the equivalent lifetime
contract directly: the view is no longer available when its observation cleanup
runs. New coverage checks foreign identities and detached Roots.
The first full Page run exposed three fixtures still supplying region objects:
selection restoration could not find the view, missing-endpoint detection returned
false, and the demo registry lookup returned undefined. Those fixtures and the
React navigation fixture now supply the same identity as the mounted Root; their
original selection, navigation, and cleanup assertions remain unchanged.
The generic Root identity was initially typed as `object`, so TypeScript did not
reject an obsolete region passed as an identity. Root and region identity methods
now return `RegionIdentity`, and the virtualization registry requires that type.
Custom Root implementations returning an identity must create a `RegionIdentity`;
the existing constructor is now a runtime export for that purpose. The identity
remains independent of attachment lifetime. A compile-time test rejects native
elements and region capabilities as virtualization identities. The React selection
fixture now constructs identities instead of using plain objects; its lifecycle
assertions remain unchanged. Its first run exposed that the constructor was only
exported as a type, which is why the runtime export is required.

Root region capture, region focus, and editable-text capture now require a
`RegionIdentity` rather than an arbitrary object. Page layout input, drop
registration, and React focus/overlay contracts carry that identity through to
those operations. Consumers must obtain one from their mounting callback, a Root
region, or a custom Root implementation. Existing focus and drop behavior remains
covered; the detached-focus test now supplies an unknown `RegionIdentity` instead
of an untyped object. The drop-ref adapter accepts a DOM element or a
`RegionIdentity` and throws for other ref values. Its cross-window lookalike test
now uses a real identity with a `nodeType` property, retaining the original brand
check, and a separate test covers rejection of an invalid ref value.

Page focus observation now borrows `observeInput` from the attached Root instead
of creating a separate browser listener owner. A custom Root used for Page must
implement the existing Root input-observation contract for `focusin` and
`focusout`. Existing native focus, nested-boundary, attachment rollback, and
cleanup assertions remain unchanged; new tests exercise delivery, detachment,
setup rollback, and cleanup failures with a non-browser Root.
An additional replacement test initially delivered a retained old callback to
the new attachment; callbacks now check the exact attachment before notifying.

Page's general input dispatcher now acquires a caller-owned input observer from
the attached Root rather than constructing a browser listener transport. Custom
Root implementations must implement `createInputObserver` and preserve one
dispatch identity across their observer's listener groups. The observer owns its
registrations until each disposer or `dispose` releases them; Page retains event
registrations across Root replacement. The normalized keyboard test fixture now
declares the required Root method, and the pointer test checks observer creation
at each Root instead of spying on the private browser listener class. Existing
input delivery and remount assertions remain unchanged.

The Bento resize browser adapter moved into the feature's `browser/` folder.
Its tile and lane now use the regions captured by the panel Root, with the same
gesture, handle, and direct-parent lifetime checks. Existing resize tests retain
their assertions and update the adapter import. A new test checks that the exact
Root-captured regions are retained and invalidated when the tile is reparented.
A new serial browser measurement checks the actual pointer-down start of a resize;
the existing measurement continues to cover movement and cancellation.

Bento separators now observe their captured Root region and use Root window
observations for Escape and blur. Pointer capture is requested on the matching
separator target, preserving the previous handle-local capture. The resize test
fixtures now mark their separator targets and supply Root window observations;
their existing capture, rollback, keyboard, and cancellation assertions remain.
New tests cover a late Root, replacement during capture, and a reentrant old-Root
availability check. The last case initially lost the replacement listener; the
binding now checks the exact attachment and revision after ownership callbacks.
Another regression test detached Root during listener setup and initially found
that an earlier subscription remained installed; setup now releases the partial
attachment immediately. A listener-installation failure test also checks rollback
and a subsequent successful attachment.
The full React suite exposed two additional cleanup fixtures without the separator
attribute: neither resize started, so their expected errors were not reached.
Both fixtures now identify their handles; their cleanup assertions are unchanged.

Canvas transform controls now observe keyboard input through their viewport's
Root region. The viewport's borrowed Root contract includes
`focusRegionByIdentity` for restoring focus to a control after a transform.
The existing accessibility fixture supplies a browser Root and attachment check;
its transform, cancellation, and marker assertions are unchanged. Additional
tests cover viewport replacement during a transform and listener setup rollback.

The Edgeless viewport now captures its world region through the supplied Root.
Custom Roots must resolve the mounted world-layer identity through their existing
`captureRegionByIdentity` contract; attachment fails if they cannot. The region
remains bounded to the exact viewport attachment across remounts. Existing drag
admission tests retain their assertions; new tests cover Root capture, replacement
during capture, and failed capture rollback.

Table resize separators now observe their panel Root's captured region and follow
panel availability. Pointer capture targets the separator rather than the Root,
preserving the previous handle-local capture. Existing controller assertions are
unchanged; new input tests cover normalized delivery, Root replacement or
detachment during setup, and rollback after a listener installation failure.
The private table input adapter moved into the feature's `browser/` directory;
its new tests import it from that location.

Page handle click-distance tracking now borrows window observations from its
editor occurrence Root. Standalone handles create and release a temporary Root
for each press. A custom Root supplied to `BlockEditorScope` must implement the
existing `observeWindowInput` operation. Existing handle assertions are unchanged;
new tests cover borrowed Root replacement and partial listener setup rollback.

Root now exposes `observeDocumentInput` for normalized document-phase input.
Custom Roots supplied to an Edgeless viewport must implement it. The default
canvas toolbar borrows the viewport Root when contained by it; an independently
mounted toolbar owns a temporary Root. Existing dismissal assertions remain
unchanged, with additional tests for document propagation, Root replacement,
and partial setup rollback.
The Page normalized-keyboard fixture supplies a no-op document observer to satisfy
the expanded Root contract; its keyboard assertions are unchanged.

`useBlockTextEditing` and `useBlockEditing` now return a callback mounting ref
instead of a readable object ref. Renderers can continue spreading the returned
attributes; callers that read `attributes.ref.current` must use Root capabilities
instead. Editing and deferred caret restoration retain an opaque host identity
rather than an element. The existing focus fixture now supplies that identity,
and the text-binding fixture checks the public ref shape; prior behavior assertions
remain unchanged.
The existing block-hooks browser fixture also now mounts the active panel Root
and provides its context when switching editors. Before the ref change its old
setup already failed because it supplied only the panel context; the fixture's
subscription, remount, input, and composition assertions are preserved.

Visual-label session internals now retain a mounted label identity instead of an
element reference. The private React input adapter converts its current target at
delivery; public label props and existing test assertions are unchanged. New tests
cover foreign labels, detached Roots, and replacement during text capture.

Preset gesture input no longer receives the toolbar's native ref. Its private
browser adapter captures preview creation for the exact panel Root and portal
host. Preview creation can now return undefined when that occurrence ends; the
controller cancels the corresponding gesture and releases its resources. A stale
preview cleanup failure no longer cancels a replacement gesture. Existing preset
assertions remain unchanged; new tests cover Root replacement, mounting rollback,
unavailable preview cancellation, and reentrant replacement.

The Root browser entry point no longer exports `NativeEventListeners`,
`BrowserInputListeners`, `captureTextSelection`, `BrowserInputListenersOptions`,
`NativeEventDefinition`, `NativeEventListener`, or `NativeEventTarget`. Browser
implementation code still uses these privately. External callers should use a
mounted `BrowserInputRoot` and its normalized input or text capabilities. Existing
React and Page fixtures now observe input and capture feedback through Root; their
clipboard, keyboard, drag, and resize assertions are unchanged. Resize fixture
observations remain attached for the gesture lifetime so their captured pointer
capabilities retain the same behavior as before.

### Browser hit capture and test fixtures

`@chulane/rivto-root/browser` no longer exports `captureBrowserInputHit` or
`readBrowserInputHit`. Input consumers capture hits through an occurrence's
`InputDocument` or an input target, inspect their opaque identity, and release
borrowed hits when finished. The browser adapter retains its native hit mapping
internally for document validation and event delivery.

Page drag and pointer tests now capture hits through `InputDocument` and compare
opaque identities instead of recovering native elements. The browser-specific
hit mapping test moved into Root's `__tests__` folder, preserving its connected,
foreign-document, disconnected, and fabricated-hit assertions.

### Virtualization document offset observation

`@chulane/rivto-root/browser` no longer exports the element-taking
`observeDocumentOffsetAndFollowEnd`. A borrowed `InputRegion` now offers that
observation and accepts only an offset callback. The view registers opaque host
and occurrence identities; its matching Root captures the host region and owns
browser access. The view releases geometry and text-owner observations when the
binding or view ends. Geometry setup now waits for that matching Root, so tests
that previously supplied an unattached observer now bind an occurrence first;
setup failure, rollback, replacement, and cleanup assertions remain in place.

### Bento resize placement

The internal Bento input attachment now receives an opaque separator identity
captured at its React mount boundary. Its placement helper accepts the captured
separator region; Root supplies the nearest tile and immediate parent as opaque
regions. Tests that previously passed an element and inspected individual Root
capture calls now pass the identity or region and compare the same tile and lane
identities. Existing reparenting, replacement, pointer, and cleanup assertions
remain. Custom Root region implementations must provide
`captureAncestorWithParent`, which returns regions tied to the captured path.

### Canvas viewport size observation

Canvas viewport sizing now waits until the matching occurrence Root is attached.
A missing or replaced Root no longer permits an independent native size observer
to update the scene. The view captures its viewport region from that Root, and
releases the observation when the attachment changes or the view unmounts.

### Canvas viewport coordinates and hit testing

The viewport captures both its root and world regions from its occurrence Root.
The world-region test now checks the second capture and still verifies exact
identity and replacement invalidation; its failed-world setup fixture explicitly
allows the root capture before failing the world capture. Bounds, hit testing,
and focus use Root capabilities. A removed world plane is now unavailable for
coordinate reads even before its viewport is detached.
`CanvasView`'s borrowed Root must now provide `captureDocument` for viewport hit
testing. Custom Root implementations need to supply that existing Root capability.

### Table boundary portals and resize input

The table's block-boundary portal is now private to its React browser adapter.
It captures its host through the current mounted panel Root and refuses stale,
foreign, or reparented hosts; controls remain available while a panel is mounted
but disabled. Table resize input now accepts an opaque separator identity captured
at the React mounting boundary. Existing input tests pass that identity rather
than an element; their delivery, replacement, and rollback assertions are retained.

### Event Root contracts

Editor and keyboard event callbacks now receive named Root capability types
limited to operations used by their current handlers. The object remains the
exact attachment owned by the panel; event callbacks cannot use its registration
or destruction APIs through these types. Consumers that used other Root
operations must obtain an appropriate capability from their owning boundary.
Existing attachment tests now type captured values by the operations they check.

### Canvas transform browser implementation location

The private Moveable component and its native layer props live in
`components/browser`. The existing component test imports it from that directory;
its server-rendering assertion is unchanged. Public package exports and behavior
are unchanged.

### Canvas attachment consumer contracts

The private canvas layer hook moved into the browser component directory. Default
controls and toolbar dismissal now type their borrowed attachment by the
capabilities they use; they still receive the same attachment object. The existing
viewport API test adds compile-time checks that those contracts do not expose
native layers. Its existing runtime assertion is unchanged, and the public package
API is unchanged.

### Page end portal attachment

The internal Page-end portal now requires the matching mounted Root and validates
its slot before rendering. The existing portal test supplies connected surface
Roots and detaches them during cleanup; its nested-slot and remount assertions are
unchanged. A new assertion checks that a detached Root cannot render the slot on a
subsequent render. The portal's implementation moved into the Page browser adapter;
its trailing-block consumer was updated for the internal path.

### Preset preview frame ownership

The internal preset drag hook now receives its current input Root and surface
identity. Its preview frame uses that occurrence's clock and is cancelled by the
gesture; an unavailable or mismatched Root cannot start the gesture. Existing
preset attachment fixtures now supply and release a connected Root, and their
capture, cancellation, replacement, and cleanup assertions are retained. The
fixture's former numeric animation-frame field is replaced by the borrowed clock.
New tests cover cancellation during scheduling, a late callback after cancellation,
and an accepted callback after Root detachment.

### Edgeless deletion focus scheduling

Keyboard event panels now expose the existing selection-owned deferred-focus
operation to Edgeless deletion. The delayed focus is cancelled when selection,
input, focus ownership, or the mounted occurrence changes; it also checks the
original keyboard registration before focusing. A new test in `__tests__` verifies
the scheduler is used and a replaced registration cannot receive delayed focus.

### Batched block-parent reads

Document and core block managers now expose `getParentIds(ids)`, returning a
read-only map of placed block IDs to their document parents. Missing IDs are
omitted. Edgeless projection borrows that operation for whole-document panels;
subtree panels retain panel-relative parent lookup. The existing empty-selection
adapter fixture now supplies a rejecting implementation for the new dependency;
its assertion is unchanged. New tests cover transaction reads, repeat reads after
moves, duplicate placements, malformed branches, missing card boundaries, and
scoped panels.

### Canvas navigation mounting

`PageCanvasMount.mountBlocks` now receives the originating Root as its second
argument. The canvas source borrows its frame clock and releases temporary card
pins on the next frame or when the source disconnects. Existing navigation tests
in `__tests__` assert that the same Root is passed to the mounting capability.

### Root region creation

The browser entry no longer exports `createBrowserInputRegion`. Capture regions
through the mounted Root's `captureRegionByIdentity` capability instead. Page's
drag, drop, and virtualization tests now use a test Root to capture their regions;
their lifetime callbacks start after capture so they still exercise invalidation
and reentrant changes during the operation under test. Their assertions remain
unchanged.

### Page editor contract location

The internal `editor/block-editor-api.ts` module has been consolidated into
`editor/types.ts`. Page tests importing that internal module now import its owning
types file; their assertions are unchanged. `BlockEditorApi` remains exported from
the Page package entry. Page selection and Root keyboard contracts have also moved
to their owning types files without changing package entry exports.

### Multi-occurrence listener contracts

`BrowserListenerGroup`, `BrowserListenerCapture`, and `BrowserListenerControl`
are now exported from `@chulane/rivto-root` instead of its browser entry. Their
contracts contain normalized data and capabilities, and listener capture now
requires only a Root attachment check. React routing and one Root listener test
import the types from the portable entry; the test assertions are unchanged.
At that stage, `BrowserEventListeners` remained exposed by the browser entry.

`BrowserEventListeners` is now private to Root. `BrowserRoutedEvents` owns listener
group reconciliation, dispatch snapshots, claims, and browser cancellation for
multi-occurrence delivery. Its host supplies Root lookup and panel context; it
does not own those Roots or panel policy. Six React panel test files now use the
routed owner and declare their required listener groups at construction; their
behavioral assertions are unchanged. The low-level `BrowserListenerDispatch`
type is no longer exported from the portable entry.

### Page input delivery ownership

The portable Root entry now exports `InputEvents` and its registration contracts.
It owns input listener groups, occurrence snapshots, claims, and attachment cleanup;
Page retains its scope and predicate checks and its existing public event API.
Page's internal `BlockInputDispatcher` was removed. Three existing Page test files
now exercise the same behavior through `BlockEditorEvents`; their assertions are
unchanged. The dispatcher lifecycle test was renamed to
`block-editor-input-lifecycle.test.ts` and remains in `__tests__`.

### Connector endpoint input

The internal connector interaction context now includes the current panel Root.
Endpoint controls subscribe to normalized Root input and own their pointer capture
until release, cancellation, or attachment cleanup. The existing attachment and
cancellation tests now supply a mounted browser Root and pointer-capture fixture;
their prior assertions remain. The attachment test additionally checks that
replacement releases the original capture.

### SVG region coordinates

`InputRegion` now includes `clientToSvgPoint`, which converts viewport points to
the current local SVG coordinate system without exposing a browser matrix. Custom
Root providers implementing this interface must supply the operation. The
rectangle radius renderer borrows it from its occurrence; its preview and commit
rules are unchanged. New Root tests cover transformed coordinates, non-SVG
regions, and detachment during conversion.

### Rectangle radius input

The rectangle radius handle now observes pointer, keyboard, and focus input through
its panel Root. The Root pointer focus capability accepts SVG targets and limits
matching ancestors to the Root boundary. The radius test's timing probe now waits
until the pointer handler completes, instead of stopping at the canvas plane;
its behavior assertions are unchanged. New tests in `__tests__` cover SVG focus,
boundary rejection, and capture cleanup when the panel Root is replaced.

### Page keyboard and focus cleanup

Page keyboard transport setup now rolls back all earlier registrations on failure.
Disconnection attempts every release and held-state reset once, reporting failures
as an `AggregateError`; failed setup aggregates rollback failures with the setup
error. Failed focus and detach subscription ownership no longer leaves the new
listener registered. New tests in `__tests__` exercise these failure paths; no
existing test assertions were changed.

Root keyboard registration now releases its action identity when cleanup
ownership or inventory notification fails. If ownership was acquired, rollback
also attempts the owner disposer and the direct action release, retaining multiple
failures in an `AggregateError`. Destruction during ownership acquisition prevents
the action from being installed. New tests in `__tests__` cover these paths and
reentrant keymap updates; no existing keyboard assertions were changed.
The runtime rechecks its resource owner's active state after acquiring cleanup;
an owner check may therefore run more than once during registration.

Held-key notifications now attempt every observer and report observer failures in
an `AggregateError`. Reset still clears modifier state if an observer throws, and
observers that remain available receive the cleared state. New tests in
`__tests__` cover reset and modifier reconciliation failures.

### Page input Root contract

`BlockInputEvent.root` now exposes `BlockInputRoot`, the occurrence operations
currently used by Page input consumers. Input observer creation and unrelated
Root capabilities are no longer part of this borrowed event contract. Three
existing input lifecycle tests now retain only their required Root types, and
the normalized keyboard fixture supplies the narrowed Root contract. A React
panel integration test likewise retains only the attachment check it uses.
Their behavioral assertions are unchanged.
The internal drag gesture type now lives in its owning `types.ts`; its retained
Root, the selection gesture Root, and drag-source feedback dependencies are also
narrowed to their actual operations.

### Page rendering Root contract

`BlockEditorController.inputRoot` now exposes the same rendering operations as
`BlockEditorScopeApi.inputRoot`, rather than the complete `InputRoot` interface.
The controller retains its attachment internally for event and selection setup;
consumers needing other operations must receive the appropriate capability from
the attachment owner. The existing input Root contract test was extended to check
this boundary; no behavioral assertions were changed.

### Input dispatcher and Page attachment requirements

`InputEvents` and `InputEventFactory` accept an optional Root type parameter.
Its minimum contract, `InputEventsRoot`, requires only observer creation and an
attachment check. This minimum contract is now the default. Callers whose
event factory needs additional Root operations specify their occurrence type. `PageInputRoot` now
requires the operations used by Page attachment, rendering, selection, and its
input consumers rather than every operation on `InputRoot`. A provider that
already implements `InputRoot` remains suitable for Page.

The Root input dispatcher test now exercises delivery and cleanup through the
minimal contract. The Page contract test checks the capabilities required at
attachment and excludes unrelated clipboard writing. No existing behavioral
assertions were changed.

### Edgeless card height observation

`InputRegion` now provides `readUnconstrainedScrollHeight` for measuring a
region while a captured enclosing region's inline height is temporarily set to
auto. It restores the original declaration and priority, including on failure.
Custom Root providers implementing `InputRegion` must provide this operation.
`observeSize` also accepts options for observing immediate children and for
allowing an unavailable browser observer; its existing default remains unchanged.
The existing Root size-observer test adds coverage for these options without
changing earlier assertions. New tests in `__tests__` cover measurement, style
restoration, invalid regions, card growth, shrinkage, and surface remount.

Card height observation also rejects stale setup when the panel replaces its Root
during resize-observer installation. The replacement retains its observer and the
older setup releases only its own resources. Tests in `__tests__` cover ordinary
replacement and replacement during setup; existing assertions were not changed.

### Edgeless preview style reads

`InputRegion.readInlineStyle` reads a CSS declaration without exposing its
browser element and discards a read if the region becomes stale. Custom Root
providers implementing `InputRegion` must provide this operation. The public
`useEdgelessElementStyle` hook now reads locked preview values through its
mounted panel Root. Without a matching Root, it uses the supplied element
geometry rather than reading a detached host's inline styles. New Root and React
tests in `__tests__` cover style reads, detachment, and preview preservation.
The hook's `ref` is now a React callback ref rather than a mutable HTML-element
ref. Consumers that need to retain the mounted occurrence's identity can use its
new `identity` ref, which contains an opaque `RegionIdentity` instead of an
element. The built-in card and creation preview were updated for this API change.

Connector endpoint mounting now stores opaque region identities rather than
button-element refs. The hook is internal; its consumers still receive React
mounting refs and normalized pointer input. A new test in `__tests__` exercises
both endpoints and cleanup on deselection; existing test assertions are unchanged.

### Panel removal and notification failures

Panel removal now attempts routing notification, deactivation, and applicable
selection and focus cleanup even if an earlier cleanup fails. A single failure
is rethrown; multiple failures are reported in an `AggregateError`. Root-change
notification also attempts later subscribers after a listener throws, reporting
one failure directly or aggregating multiple failures. This applies during
registration and rollback as well as removal. New tests in `__tests__` cover
failure isolation, rollback notifications, and a replacement registered during
failed removal; existing test assertions were not changed.

### Panel routing contracts

Active and default panel Root lookup now exposes only `isAttached`, the operation
used by current consumers to check an occurrence. Event routing supplies its
factory with the panel and Root operations needed to build and deliver an event;
it no longer types that borrowed route as a full panel and browser Root. Listener
reconciliation receives attachment checks rather than the full Root interface.
The actual objects and their identities are unchanged. New type-contract tests
in `__tests__` cover these boundaries; existing behavioral assertions are unchanged.

### Captured panel input registration

`EditorEvent` and `KeyboardEditorEvent` now include an `inputRegistration`
capability for the exact panel routing lifetime. Its `isCurrent()` check becomes
false when that registration is removed or replaced, even if its mounted Root
remains attached. It can also verify that a supplied input Root belongs to that
registration. Consumers constructing event values directly must supply it.
`runWithViewportPreserved` now requires the registration captured by the input;
indent and outdent pass the keyboard event's registration. Direct event and
viewport test fixtures supply the new capability without changing their existing
behavioral assertions. New `__tests__` cases cover disable/re-enable, stale
viewport work, and restoration of an earlier registration after failed staging.

Deferred list-shortcut conversion and its scheduled caret focus now require the
input's captured registration to remain current. A stale input no longer changes
the block or focuses a replacement occurrence even when the mounted Root itself
remains attached. New tests in `__tests__` cover both deferred conversion and
focus; existing list-shortcut assertions were not changed.

Keyboard block behaviors now receive the captured `inputRegistration` in their
context. Caret scheduling and structural predecessor focus accept it alongside
the input Root and stop when that registration expires, even if the Root remains
attached. Direct UI calls may omit it and continue to use the mounted Root's
lifetime. New cases in `__tests__` cover stale caret and structural focus; existing
behavioral assertions were not changed.

Page drag adapters and receiving occurrences now require the input registration
that owns their Root. Expired sources and destinations cannot resolve or commit a
drop, and disabling routing synchronously releases the drag extension and notifies
foreign sources. Existing drag fixtures now pass a registration capability; their
behavioral assertions are unchanged. New cases and the real handle-drag timing
fixture are in `__tests__`.

Slash sessions and todo prompt candidates now retain the input registration that
created them. Deferred input, slash command execution and focus restoration, and
todo conversion are cancelled when that registration expires even if the Root
stays attached. Todo decoration cleanup still revalidates the same host under a
replacement registration. New regression cases were added to existing suites in
`__tests__` to limit Jest's per-suite memory use; existing behavioral assertions
were not changed.

Edgeless transform controls and pointer gestures now retain their exact input
registration through preparation, preview, commit, and cleanup. A stale cleanup
cannot cancel a replacement that reuses the same Root and control handle. The
controller's internal `beginControls`, `registerControls`, and `finishControls`
contracts now use a routing lifetime; existing direct controller test fixtures
supply it without changing their assertions. New tests in `__tests__` cover
reentrant focus and cleanup, stale commits, and replacement controls.

`ReactPanelApi.inputRegistration` exposes the current routing lifetime while a
panel accepts input. Availability subscribers are notified when that lifetime
changes, including when the mounted Root stays the same. Edgeless marquee and
transform controls capture the lifetime and stop using it after replacement.
Existing controller and adapter test fixtures now pass the registration required
by their constructors; their behavioral assertions are unchanged. New tests in
`__tests__` cover publication and stale controls and marquee input.

Undo and redo, page and canvas deletion, keyboard block movement, and clipboard
cut and paste now check the initiating input registration before restoring focus
or selection. They also stop follow-up work when synchronous editor operations
replace that registration. New regression tests are in `__tests__`; existing
behavioral assertions were not changed.

Bullet threading now captures the panel input registration at mount. The internal
mount and observation fixtures supply that registration, and mount fixtures
provide the panel availability subscription. Expiry removes the SVG and stops
pending measurements even when a replacement uses the same mounted Root. The
new lifecycle cases live in the extension's existing `__tests__` directory.

PanelRegistry now borrows the Root created by ReactPanel. Disabling input and
registering it again leaves this Root attached. Code that needs to reject input
from an earlier registration must capture its `inputRegistration` alongside the
Root and call `isCurrent(root)`. Only unmount or panel destruction ends the
mounted Root's lifetime. EditorPortal now requires the registration that owns its
content. Slash menu passes the registration captured when its session began.

Panel, event routing, transform control, portal, and drag receiver fixtures now
assert registration expiry and mounted Root identity independently. Rollback
tests capture the staged registration through the existing receiver callback.
The structural focus fixture detaches the shared Root on the first attachment
check so later checks observe its real detached state.

Removed PanelRegistry.getInputRoot. Its only callers were tests from the period
when registration created a second browser Root. Routing tests now compare
delivery against the mounted Root they supplied. Rollback and removal tests use
the registry's existing listener set to check membership independently of Root
identity. The standalone Page demo uses its mounted region to set and release
the focus marker through the existing view contract.

EdgelessToolButton now accepts presentation fields and an optional zero-argument
`onActivate` callback. Replace `onClick` with `onActivate` for zoom, snapping,
selection and property commands. Native button event props and element refs
are no longer part of this component's public contract. The properties panel
still uses its internal collapsible trigger for keyboard and pointer activation.

BrowserInputRoot now takes a mounted HTMLElement. A panel, view, or extension
that already has a Root borrows that instance. To limit a region to a shorter
registration, pass its lifetime check to captureRegionByIdentity. Detaching
the mounted Root invalidates its regions even when their registration remains
current. A callback that detaches its own mount still makes isAttached return
false on that same call.

The Page hover fixture now passes the mounted Root through its scope. Browser
ownership tests exercise a registration-bound region, synchronous detachment,
and unrelated Roots. Ancestor-depth fixtures applied only to the removed nested
constructor. The panel registration tests continue to cover expiry, re-enable,
replacement, rollback, and cleanup on the same mount.

Panel registration now delivers only the registration token to its receiver.
The panel already owns the mounted Root. Its inputRoot accessor returns that
Root while the token is current, including after successful rollback, and
returns undefined if another panel takes over the same element. Direct
registry fixtures receive the token as the first callback parameter.

Embedding refresh uses the typed Root dispatcher for each rendered reference.
The body owns its subscription and releases it on cleanup. EmbeddingProps keeps
its public package exports and now lives in the embedding's types.ts.

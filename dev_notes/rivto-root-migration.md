# Shared browser interaction in rivto-root

## Goal

Replace rivto-keyboard and rivto-events with rivto-root, a shared runtime used by React, Page, and Edgeless. Extensions register typed events and keyboard actions using normalized data and capabilities; they do not receive native events or HTML elements.

rivto-root owns shared registration, dispatch, keyboard state, and browser attachment. React, Page, and Edgeless retain their document policy and editor-specific behavior.

The migration also covers the browser capabilities that input consumers need:
focus, text selection, composition, pointer gestures, geometry, and clipboard
access. Audit each capability before moving code: shared browser mechanics belong
in the root only when existing consumers need the same contract; document and
surface behavior remains with its current owner.

## Acceptance review

| Ownership question | Implementation and evidence |
| --- | --- |
| Who creates and destroys a mounted Root? | [ReactPanel](../packages/react-rivto-editor/src/panels/react-panel.ts) takes the host ref and detaches the Root. The [standalone Page view](../packages/rivto-page/src/presentation/components/block-editor/use-block-editor-root.ts) and [canvas viewport](../packages/rivto-edgeless/src/browser/canvas-viewport.ts) borrow a host Root when supplied and release the Roots they create. |
| What happens when a panel is disabled or replaced on the same element? | The [panel registry](../packages/react-rivto-editor/src/panels/panel-registry.ts) owns the routing registration. Deferred input retains its exact registration. The [boundary tests](../packages/react-rivto-editor/src/panels/__tests__/panel-root-contract.test.ts) check that lookup, listener delivery, and registration omit teardown. The [lifetime tests](../packages/react-rivto-editor/src/panels/__tests__/panel-current-input-registration.test.ts) exercise replacement. |
| Where does input become editor behavior? | Root owns [event dispatch](../packages/rivto-root/src/events/) and [keyboard state](../packages/rivto-root/src/keyboard/). React chooses the receiving panel, [Page](../packages/rivto-page/src/editor/events/) chooses the block occurrence, and [Edgeless](../packages/rivto-edgeless/src/browser/canvas-events.ts) owns canvas groups. Each has a typed custom-event test under its owning module. [Registration audit](react-root-event-migration-audit.md) |
| Which operations need the browser? | [Root browser adapters](../packages/rivto-root/src/browser/) capture selection endpoints, text hosts, clipboard access, pointer ownership, and geometry. Page owns structural selection and navigation. Canvas owns transforms and its [Moveable adapter](../packages/rivto-edgeless/src/browser/canvas-drag-input.ts). The visual label captures double-click at the component so a child can stop bubbling before editing begins. |
| What does an extension receive? | The [extension interface](../packages/react-rivto-editor/src/editor/types.ts) exposes event and keyboard registration with normalized values. Panel mounting and editor destruction belong to lifecycle owners. Root has separate portable and browser package entries. [Consumer changes and replacements](rivto-root-breaking-changes.md) |

The workspace build, type checks, core test command, and lint passed. Lint reported 640 warnings. The affected unit suites passed 431 Root, 611 Page, 141 Edgeless, and 949 React tests. The published React declaration accepts a borrowed routing interface for panel registration, and Root's portable entry compiles with only the ES2022 library. All new and moved migration tests in the working tree are in `__tests__` directories.

A follow-up declaration check found that extensions could supply the panel owner's internal third argument to both event and keyboard registration. The extension now borrows the two-argument contracts. Both negative assertions failed on the former declarations and pass on the revised declarations. The built React JavaScript matched the preceding build byte for byte.

The final host run passed **224 Chromium and Firefox cases with 12 workers** across composition, selection, structured selection, clipboard, navigation, history, and Moveable. The standalone demos passed 106 Page and 80 Edgeless cases. Panel and embedding results, including the Firefox serial retry and signaling-dependent cases, are recorded in [the mounting milestone](#mounted-root-construction-and-embedding-refresh).

Performance varies by interaction. The matched production runs in that milestone cover normal and large documents. The earlier large Kanban insertion comparison found a repeatable synchronous cost from restoring the caret before paint. Large Page modal close also incurs document-wide style and layout work. These findings limit any migration-wide performance claim.

The implementation sections below retain earlier observations and open questions in the order they were recorded.

## Root object and lifecycle

- Expose one root object per mounted editor occurrence. Page, Edgeless, and React
  consumers use its capabilities instead of passing an HTML element through
  ordinary editor interfaces.
- The browser mounting boundary may accept an `HTMLElement`, for example from a
  React ref passed to `root.attach(element)`. The browser implementation retains
  that element; event and keyboard callbacks receive normalized values and
  capabilities, not native events, elements, nodes, ranges, or browser selections.
- The root owns attachment, browser input delivery, and cleanup for its occurrence.
  Registrations and state must have documented lifetimes across detach, remount,
  and destruction. A stale disposer must not detach a newer attachment; failed
  setup and cleanup must retain the existing rollback and error behavior.
- Nested editors and multiple panels have independent roots. Preserve occurrence
  ownership, routing, focus boundaries, and the distinction between mounted
  surfaces and document mode.
- Expose only capabilities with current consumers, such as input registration,
  keyboard state, focus, or selection and pointer operations. Each consumer
  depends on the smallest interface it uses; it does not acquire root attachment or
  destruction authority merely by receiving that interface. The lifecycle owner
  retains the concrete root without duplicate references or forwarding wrappers.
- The root does not own the document's authoritative selection, Page selection
  policy, canvas behavior, or document mutations. Its browser implementation
  supplies operations to those existing owners.

## Using the implemented API

A React host creates one document editor. Each mounted panel owns its own
`inputRoot`. Extensions installed on the document use `api.events` and
`api.keyboard` across its panels. A component that already has a panel can
register with `panel.events` or `panel.keyboard` to scope delivery and cleanup
to that occurrence.

For example, a host that finishes saving a document can notify an installed
extension through the declared event map:

```ts
const editor = createReactEditor<DocumentEvents>({ editor: core });
const uninstall = editor.extensions.install({
  id: "save-feedback",
  setup(api) {
    api.events.observe({ kind: "custom", id: "save-feedback", type: "document-saved" }, (event) => {
      showSavedMessage(event.documentId);
    });
  },
});

editor.events.publish("document-saved", { documentId });
uninstall();
```

Here `DocumentEvents` declares a `"document-saved"` payload with a string
`documentId`. The host owns publishing. Uninstalling removes the observer even
if several panels still display the document. The same ownership rules are
exercised in the [React custom-event test](../packages/react-rivto-editor/src/editor/__tests__/react-custom-events.test.ts).

## Proposed editor interface

The following is a design sketch, not an implemented API. The final contracts and
operations must be derived from actual consumers during the migration. An editor
exposes one root object per occurrence; extensions borrow narrow interaction
interfaces, while the host owns attachment and destruction.

```ts
interface RootEvents<Events extends object> {
  register<K extends keyof Events>(
    definition: EventDefinition<K>,
    handler: (event: Events[K]) => "handled" | "continue" | void,
  ): () => void;

  observe<K extends keyof Events>(
    definition: EventDefinition<K>,
    observer: (event: Events[K]) => void,
  ): () => void;
}

interface EditorRoot<Events extends object> {
  readonly events: RootEvents<Events>;
  readonly keyboard: KeyboardApi;
  readonly focus: FocusApi;
}
```

The editor retains surface-specific behavior alongside the root. For example,
an extension can register a semantic keyboard action and route normalized pointer
input to Page selection:

```ts
const selectionExtension = {
  setup(editor: BlockEditorApi) {
    editor.root.keyboard.register(
      { id: "selection.toggle", keys: ["Control", "Meta"] },
      () => false,
    );

    editor.root.events.register(
      {
        id: "selection.pointer-down",
        type: "pointerdown",
        target: "root",
        priority: 20,
      },
      (input) => {
        if (input.button !== 0) {
          return "continue";
        }

        const handled = editor.selection.startFromPointer({
          x: input.clientX,
          y: input.clientY,
        });
        if (!handled) {
          return "continue";
        }

        input.preventDefault();
        return "handled";
      },
    );
  },
};
```

`pointerdown` selects a typed pointer input containing coordinates, button and
modifier state, and synchronous cancellation capabilities. It does not expose a
native event or element. `startFromPointer` illustrates Page-owned behavior; its
name and contract are not a commitment to add that method. Preserve the existing
extension setup ownership of registrations and cleanup.

An editor can extend the built-in event map with typed custom events:

```ts
interface EditorEvents extends BuiltInInputEvents {
  "document-saved": {
    documentId: string;
  };
}

function installSaveFeedback(root: EditorRoot<EditorEvents>) {
  return root.events.observe(
    { id: "save-feedback", type: "document-saved" },
    ({ documentId }) => {
      showSavedMessage(documentId);
    },
  );
}
```

The component that owns and produces a custom event also needs a typed way to
dispatch it. Keep publishing with the producer or lifecycle owner rather than
giving every extension permission to emit every event. Custom-event delivery,
registration lifetime, ordering, and ownership must be specified and tested on
the actual editor API, not only on the generic dispatcher.

The browser host passes the element only at the mounting boundary. For example:

```tsx
function EditorView({ editor }: { editor: EditorController }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }
    return editor.attach(element);
  }, [editor]);

  return <div ref={rootRef}>{/* editor content */}</div>;
}
```

The controller attaches the occurrence's root internally. Extensions receive
`editor.root` without attachment or destruction methods. The root object can
survive detach and remount; each disposer belongs to its specific attachment.
Nested editors and separate panels have their own roots and routing. Document and
Page selection remain on the editor; only browser operations that actual
consumers share belong on the root. Determine that split from the existing
selection, clipboard, pointer, and focus callers before finalizing the interface.

## Selection and related capabilities

- Keep shared document selection and selection commands in editor core. React's
  panel selection retains active-panel and subtree ownership rules; Edgeless
  retains canvas element and mixed-selection behavior.
- Keep block-range rules, text offsets, pointer selection, virtual endpoint
  handling, and Page-specific selection policy in Page. Preserve directed
  anchor/focus, offscreen endpoints, pending restoration, and the existing rules
  for retaining structural selection when native selection disappears.
- Audit Page's DOM selection implementation and React's current bridge together.
  Identify reusable browser mechanics for reading and restoring native selection,
  but keep block identity, model order, virtual mounting, and surface policy with
  their owners. Public operations use stable IDs, offsets, and explicit results;
  browser nodes and ranges remain inside the implementation.
- Design text input, `beforeinput`, IME composition, caret capture, undo, and
  restoration as one flow. Preserve the timing and ownership rules that prevent
  a delayed native selection update from overwriting a newer model selection.
- Audit pointer capture, hit testing, coordinates, scrolling, cancellation, and
  cleanup together. Share only browser mechanics required by actual consumers;
  Page retains block drag and selection policy, and Edgeless retains canvas tools,
  transformations, and gesture policy. Keep Moveable's native event inside its
  browser integration.
- Expose synchronous clipboard read/write capabilities with documented lifetimes
  and missing-data behavior. Format conversion, insertion, permissions, and
  document mutations remain with their existing editor owners.
- Keep shared keyboard matching, keymaps, held keys, and composition policy in
  the root runtime. Page and React retain their own semantic action definitions,
  context rules, and document commands.

## Code readability and contracts

- Write code so a reader can follow each responsibility, data flow, and lifecycle
  without reconstructing behavior across unnecessary layers. Prefer small,
  cohesive classes and methods with explicit ownership and side effects.
- Choose descriptive names for classes, interfaces, methods, variables, and
  parameters based on what they actually represent or do. Use established domain
  vocabulary; avoid vague names, unexplained abbreviations, and names that imply
  guarantees the implementation does not provide.
- Keep abstractions from leaking: consumer interfaces expose the data and
  capabilities they need, not native browser objects, implementation details,
  attachment ownership, or unrelated Page and Edgeless policy. The mounting
  boundary accepting an element is the documented exception. Do not hide leaks
  behind casts, wrappers, forwarding methods, or duplicate references.
- Define meaningful contracts with named interfaces and types. Keep dependencies
  narrow at the consumer, and use concrete implementation types where creation,
  attachment, or destruction is actually owned. Avoid anonymous object contracts
  and speculative interfaces with no current consumer.
- Put named interfaces and type declarations in `types.ts` files in the folder
  that owns the contract. Import them from their owning folder and export only
  contracts intended for consumers. Keep runtime implementations separate from
  those type files.
- Place new and migrated tests in a `__tests__` folder alongside the code or
  feature they exercise. Keep nested test folders organized by responsibility.
- Document public contracts and non-obvious invariants, including capability
  lifetime, cleanup, ordering, and missing-value behavior. Preserve useful
  existing comments and keep documentation aligned with actual behavior.

## Implementation

- The unfinished keyboard slice was reset before this design discussion. Preserve the earlier event extraction and all unrelated workspace changes; do not repeat the reset.
- Create @chulane/rivto-root. Move the keyboard runtime and shared listener-lifetime implementation into it. Update workspace scripts, package exports, dependencies, tests, and consumers; remove the two replaced packages.
- Provide a typed, extensible event API. Built-in names use familiar literals such as pointerdown, keydown, and beforeinput. Consumers can extend the event map with their own names and payloads. Registration returns an idempotent disposer; observers cannot claim events.
- Normalize public payloads. Supply the data consumers need—such as pointer coordinates and modifiers, key/code and composition state, input type/text, and occurrence or block IDs. Expose explicit capabilities for operations such as preventing the browser default and synchronously reading or writing clipboard formats. Capabilities document their lifetime and missing-data behavior.
- Keep native integration inside browser adapters. A mounting method may receive an HTMLElement; event callbacks do not. Clipboard, pointer capture, DOM hit testing, and Moveable integration use private browser-owned code. Moveable receives its required native event internally, through the adapter implementing the relevant operation.
- Move semantic keyboard behavior into the root runtime. Preserve action IDs, keymaps, priorities, held keys, IME policy, shortcut matching, and cleanup. The runtime consumes normalized keyboard values; browser adapters determine the platform’s primary modifier and translate native input.
- Migrate all three consumers. React retains panel routing and multi-root behavior; Page retains occurrence ownership, observers, and its selection rules; Edgeless retains nested-canvas isolation and group-local claims. Preserve each consumer’s existing default-prevention, ordering, and propagation behavior during migration.
- Use a readable package layout. Separate public contracts, event and keyboard implementations, and browser attachment code by responsibility. Keep React-specific lifecycle integration in React unless a shared React API has an actual consumer. Avoid base classes or compatibility wrappers without a present need.
- Design the root lifecycle and narrow consumer interfaces first. Then migrate in
  dependency order: attachment and input delivery; keyboard; selection and text
  input; pointer, geometry, and clipboard integrations; finally remove superseded
  exports and implementations after all real consumers have migrated.
- Audit all public exports, not only event callbacks and the generic dispatcher.
  Include the actual editor registration APIs, Page DOM selection exports, Canvas
  viewport layers, tool gestures, React hooks, and mounting interfaces. Replace
  native-object exposure in ordinary consumer APIs while keeping the element
  accepted by the browser mounting boundary.

## Verification

- Place new and moved tests in a `__tests__` folder near the behavior they cover.
- Audit every React, Page, and Edgeless event and keyboard registration before migration; map each native field or operation to normalized data, an explicit capability, or a private browser adapter.
- Add tests for typed custom events, registration/removal during dispatch, observers, claims, cancellation, clipboard data, IME, keymaps, held-key reset, nested editors, multiple mounted panels, remounts, and cleanup failures.
- Verify published event and keyboard contracts contain no native event or HTML element types. Mounting is the deliberate exception for accepting an HTMLElement.
- Run affected package and host suites, builds, types, and lint. Exercise clipboard, text input, selection, pointer gestures, keyboard navigation, and Moveable in Chromium and Firefox. Follow the repository’s parallel-test, serial-retry, and before/after performance workflow.
- Verify selection in Page and Edgeless, including nested occurrences, mixed
  selection, virtualized endpoints, reversed ranges, focus and caret restoration,
  IME, undo, clipboard, remount, and cancellation. Review dependency interfaces and
  lifecycle ownership separately from behavioral test results.
- Two Page drag-handle threshold failures were historically reproduced on an
  unchanged baseline; the later Page suite passed. Report any current failure
  based on the current run and an appropriate baseline, not that historical result alone.

## Assumptions

- Breaking API changes are allowed; consumers in this workspace migrate together.
- Semantic editor events are added only for operations with real consumers. Document mutations and permissions remain in their owning managers.
- rivto-root is framework-neutral; its browser attachment may accept a DOM root, but registered event callbacks do not expose DOM objects.

# Rivto root migration status

The migration is **not complete**. `rivto-root` replaces the previous keyboard
and events packages and its default entry can be type-checked without DOM types.
The public Page, React host and low-level browser event contracts still expose
native event or element objects.

## Implemented

- Standalone Edgeless default transform admission now uses normalized root
  `mousedown` input and an attachment-bound world-region capability. Moveable’s
  required native start event remains inside the browser-owned drag adapter.
  In the standalone production demo with 10,000 elements, three drag-start
  samples had synchronous medians of 5.1 to 5.7 ms in Chromium and 7 to 9 ms
  in Firefox; two-frame medians were 29.8 to 29.3 ms and 23 to 27 ms. The
  measured ranges overlapped. An initial parallel pointer-cancellation case timed
  out before its pointer event; its serial retry and the final 60-case parallel
  run passed.

- The standalone Edgeless tool layer observes Escape and blur through the shared
  occurrence event runtime. Independent observer groups preserve its existing
  order after canvas input handlers and are not suppressed by handler claims.
  Blur now uses the mounted occurrence’s window, including inside an iframe.
  Tool pointer normalization also uses the viewport’s client-to-world capability;
  unavailable coordinates cancel captured gestures rather than committing them.
  The standalone tool layer now checks the exact attachment snapshot, so an old
  gesture cannot read coordinates from a replacement, even on the same element.
  React’s visual-tool and toolbar-preset gestures now borrow an attachment-bound
  coordinate capability. Unavailable or replaced attachments cancel the gesture
  instead of substituting the canvas origin. Toolbar hit testing and preview
  rendering still use private browser elements.
  Production-demo pointer-move medians at `repeat=200` were 1.3 ms synchronous
  and 16.6 ms over two frames in Chromium, and 2 ms and 17 ms in Firefox. The
  comparison baseline used an older main-demo build that predates the preceding
  standalone canvas adapter update, so it is not an isolated before/after result.

- The root browser adapter now captures and restores directed text selections
  around editable rewrites without returning native selection endpoints to React.
  React content synchronization, prompt decoration, and caret restoration use
  that capability; Page's broader selection and hit-testing migration remains.
- Kanban add-column and add-card controls request deferred focus through the panel
  selection API rather than passing an HTML root. Their requests are scoped to the
  originating input registration and are cancelled by newer selection work.
  Each control borrows only its insertion, selection, and writing-factory operations.
  In the production demo at `repeat=200`, three equivalent Page add-card clicks
  had median synchronous times of 7.9 ms before and 18.2 ms after in Chromium,
  and 18 ms before and 30 ms after in Firefox. The two-frame medians changed from
  76.5 to 51.2 ms and 51 to 45 ms respectively. A repeated after-run showed the
  synchronous increase again. A Chromium profile included browser focus and DOM
  queries. In a temporary ablation, disabling early caret restoration returned
  synchronous medians to 7.9 ms and 19 ms respectively. That hook intentionally
  restores focus before paint, so it was retained; this path is not performance-neutral.

- Page input ownership now uses Root's normalized target boundary check, shared
  with Page's focus observer. Selection feedback captures an attachment-bound
  Root region rather than retaining an element or reading native pointer events.
  Input scope matching retains only the captured scope decisions, not content or
  selection-anchor elements. Drag integration and other browser operations still
  retain native context.
- Page pointer selection borrows the mounted selection owner for text gestures and
  hit testing instead of creating a second DOM selection manager. Text gestures
  captured through that owner become inactive on detach, including same-element
  remounts. Delayed pointer-selection restoration and edge scrolling use Root
  pointer capabilities and separately check the borrowed occurrence. Pointer
  selection no longer reads the private native input context. Drag uses the same
  attachment-bound scrolling capability and passes a normalized target for the
  idle-frame optimization. Drop geometry still retains native event context.

- `EventDispatcher` provides typed event maps, independently disposable
  handlers/observers, priority ordering and delivery snapshots. Page, Canvas,
  and the React host use it while retaining their own routing and claim policy.
- `KeyboardRuntime` consumes copied key values and a host-supplied primary
  modifier. Page and React browser transports supply those values. `HeldKeys`
  stores key labels rather than native event references. Page keyboard action
  callbacks receive normalized data and synchronous cancellation capabilities.
- Page focus observers receive notifications without a native focus event, and
  its selection adapter receives block ancestry rather than a native pointer event.
  Focus transition routing now uses normalized target and related-target ancestry;
  initial focus reconciliation remains inside the browser-owned observer.
- Page input callbacks now receive normalized data, block identity, and explicit
  cancellation capabilities. Page selection and dragging still use browser-only
  context internally. The root listener now supplies the same normalized input
  used by Canvas, so Page's duplicate browser input capture has been removed.
- Page keyboard context and selection movement use normalized input directly.
  Plain pointer entry and toggle selection also query normalized target ancestry;
  the closest-control query preserves the rule for nested controls.
  Text-node targets resolve through their parent element in the attached document
  for both Page scope matching and shared normalized ancestry queries.
  Handle-drag movement and release also use normalized pointer values; the
  browser-only native hit hint remains during movement to preserve drop routing
  and avoid repeated geometric hit tests.
- Canvas registrations and camera admission receive normalized input and
  synchronous target/default-prevention capabilities. `BrowserInputListeners`
  now owns their shared browser attachment and normalization in `rivto-root`;
  `BrowserEvents` owns group-local registration ordering, observation, and claim
  delivery there as well. Canvas re-exports that implementation and retains its
  existing group-local policy. Native event and element objects remain inside
  the shared browser implementation.
- A `CanvasViewport<CustomEvents>` can now register and observe explicitly marked
  custom events through its shared event manager. Its owner can publish typed
  payloads; callbacks share the input registration identity namespace and survive
  viewport detach and remount. Consumers that only register or observe can borrow
  `Pick<CanvasEvents<CustomEvents>, "register" | "observe">`, excluding publish
  and attachment. `BlockEditorController<CustomEvents>` also supports custom
  registration and observation in extension setup, with cleanup captured by the
  extension owner; only its concrete event manager exposes publishing. The React
  editor likewise supports typed custom handlers and observers owned by extension
  setup, with publishing on its concrete event manager. Its custom event API does
  not yet remove the native input exposed by React event and keyboard callbacks.
  `useReactEditor<CustomEvents>` returns a host interface that also permits typed
  custom-event publishing. Extensions continue to receive the borrowed interface
  without publishing. The hook creates and destroys the editor; the host publishes
  only while the returned instance is live. Other inherited lifecycle capabilities
  on the existing React editor interface still need the broader ownership review.
- The shared browser input layer can normalize text/composition input and provide
  synchronous clipboard format access, including absent clipboard data. React's
  clipboard serialization and paste logic consume the shared `ClipboardData`
  contract, while its native event routing and text-input handlers remain to be
  migrated. The root browser adapter now supplies that contract to React's event
  factory as well as root listeners; its temporary native-event capture export must
  disappear when React moves to root-owned normalized delivery.
- React mouse deliveries now carry Root's normalized mouse data and target
  capabilities. The registration-order browser test again distinguishes its
  button from another target without reading a native event. React still invokes
  a temporary browser capture helper until its native transport is replaced.
- React no longer exports selection helpers that require an HTML root. A panel
  exposes selection reads and restoration through its occurrence-bound selection
  interface. Page no longer directly exports `BlockDOMSelection`; the concrete
  controller exposes portable selection operations and its attachment method,
  while extensions receive the narrower interface. Native selection hit testing
  and restoration remain in the private Page browser implementation.
  The Page selection attachment now borrows the mounted Root's lifetime, so
  detaching that Root invalidates reads, focus and retained text gestures even
  before Page attachment cleanup runs.
  Page focus observers now use the same borrowed Root lifetime for initial and
  subsequent focus notifications, including detachment during a notification.
  Page input delivery also checks its exact attachment before each callback and
  after availability predicates; a remount borrowing the same Root cannot
  receive remaining callbacks from the previous attachment's event.
  A Page input predicate that removes its own registration now prevents its
  callback from running, while a replacement waits for the next event snapshot.
- Cross-editor caret navigation now borrows the destination Page occurrence's
  selection capability through its navigation registration. It no longer invokes
  the native Page selection class from React; an unregistered occurrence is not
  focused. The production caret gesture passed in Chromium and Firefox at normal
  size and `repeat=200`, with no material regression in the three-sample medians.
- Structural keyboard navigation and block movement ask the panel to mount the
  selected block and Page to focus and scroll it. Their callbacks no longer pass
  a browser element to the structural selection focus operation.
- Enter dispatch supplies block split behaviors with a snapshot and the exact
  input attachment instead of an HTML root. Backspace outdent also uses this
  context and asks panel selection whether the rendered block is nested. Empty
  block reset uses the same context, and merge and reset obtain adjacent editable
  block IDs from panel selection. Merge uses the same root-free keyboard context;
  panel selection captures its navigation scope for structural predecessor removal
  and skips focus if the originating registration is replaced during the edit.
- Vertical keyboard range extension uses the panel's selection capability for
  displayed ordering and restoration, without passing a browser root to it.
- List shortcut conversion schedules focus through panel selection. Its deferred
  input conversion uses the event's registration-bound `inputRoot`, which
  rejects a replaced root or a remount of the same element.
- React keyboard events provide live target checks for block content and the
  surface root. Creation, deletion, merge, outdent, reset, separator and indent
  bindings use these checks; the legacy browser adapter still retains the native
  event until the event transport and its other consumers are migrated.
- Keyboard callbacks receive a narrowed panel interface without native root access,
  lifecycle ownership, or panel registration methods. History, collapse, selection,
  navigation, and canvas adapters borrow the operations they use from that interface.
- React event delivery captures block and content scope as booleans rather than
  exposing those elements. The event manager retains native events privately only
  during dispatch for claim and cancellation. Event callbacks no longer receive a
  direct HTML root; canvas transforms resolve it privately after checking the input
  registration. `EditorEvent.reactPanel` now exposes a narrowed panel interface
  without native root or lifecycle access, including for its editor and keyboard.
  List shortcut conversion and todo prompt candidates now depend only on their
  required panel operations. Transform controls now retain
  their panel through setup instead of taking it from each event.
- Clipboard copy operations and copy and paste converter contexts borrow a panel interface
  limited to selection and element reads, visible roots, and extension identity.
- Block behavior focus helpers use captured input registrations rather than DOM
  roots. Direct container actions and keyboard editing capture the registration
  before mutation, so a replacement occurrence cannot receive deferred focus.
- Block keyboard and outline behaviors borrow separate panel interfaces limited
  to their document, selection, and behavior operations. They do not receive
  panel lifecycle, event registration, or native root access through those types.
- The root package owns copied text-edit fields and their defaults. React's
  list shortcut and history handlers consume those fields without a native input
  event; slash discovery uses the copied fields but still needs a browser target.
- Caret navigation and Edgeless keyboard movement and deletion inspect copied
  target properties and a live ancestor query, rather than native target objects.
  The current-realm and cross-realm distinctions in their existing policies remain.
- Vertical caret navigation asks the panel selection manager to focus an adjacent
  top-level Page occurrence. Its keyboard callback no longer passes an HTML root
  to the navigation operation; the browser lookup and virtual boundary mounting
  remain in the selection implementation. Keyboard callbacks no longer expose
  the temporary native root; construction receives captured block and content
  scope flags instead of native elements. The panel API still exposes browser objects.
- Caret selection-edge ordering obtains displayed block IDs from the panel's
  selection interface, which checks its Page attachment before reading the
  projection. The former navigation helper no longer resolves the Page from a
  DOM root; its existing document-outline fallback remains available.
- Canvas selection clearing focuses through the keyboard event's attachment-bound
  root capability. Its transform eligibility predicate uses an occurrence-bound
  Edgeless adapter that privately reads the live transform marker, including the
  preparation phase before the canvas transform snapshot becomes active.
- After structural paste, the clipboard extension clears browser selection and
  requests focus through the receiving event's attachment-bound root capability.
  Surface and document clipboard routes use the normalized target capability for
  clipboard eligibility; the shared event infrastructure still retains native context.
- Document clipboard routing now checks occurrence focus through `InputRoot`;
  its extension callback no longer receives an HTML root for that check. The
  capability includes focused descendants and rejects detached registrations.
- Panel-local event and keyboard registrations compare the exact routing input
  capability instead of the mounted element. Reusing an element for a different
  panel no longer delivers local handlers to the displaced owner. Keyboard actions
  recheck registration lifetime after their availability predicate.
- Indent and outdent callbacks no longer pass an HTML root. The panel selection
  owner runs the synchronous structural edit and owns viewport and selection
  restoration for the captured registration, including virtualized scrolling.
  Deferred corrections stop when the occurrence changes or restoration is cancelled.
- React clipboard handlers now use Root's live target and focused-host capability
  and literal copy/cut/paste operations. They no longer inspect the native clipboard
  event; the temporary browser listener transport still receives native values.
- React's Edgeless selection controller consumes normalized pointer values and
  Root target, focus, and propagation capabilities. Its mounted marquee remains
  browser-owned. Transform gesture admission also consumes normalized pointer
  data; its geometry and Moveable integration still require browser-owned objects.
- List shortcut conversion reads the captured content host's current text through
  a capability supplied by Root's browser adapter. Earlier handlers can still
  change that host before the shortcut reads it. Other native context consumers
  remain to be migrated.
- React event delivery checks the originating registration before predicates and
  again before the handler. A disabled or replaced occurrence cannot mutate the
  new occurrence through an older input delivery.
- Slash input receives a captured content capability with text, caret offset and
  copied viewport geometry, and rejects deferred refresh after its registration is
  replaced. Selection-change resolves the current block through panel selection
  without exposing its content element. The session uses its originating Root
  capability for registration, document connectivity, and fallback focus; only
  React portal rendering still needs the native surface. Root now owns the browser
  content capability used for text, caret and geometry reads.
- TODO prompt handling now uses content text and decoration capabilities, a live
  focus-target containment query, and Root document-focus state. Its deferred input and
  candidate conversion reject replaced registrations, including another panel
  showing the same block ID. Root owns the browser content-decoration implementation.
  Candidate cleanup revalidates the
  same content host through the current registration before changing a stale
  candidate; it skips cleanup when no current registration can establish ownership.
- Structural deletion uses a root-free block snapshot context and checks exact
  surface focus through `InputRoot`. Its keyboard callback no longer passes an
  HTML element to deletion or focus operations; other block editing behaviors
  still require their separate root-dependent context. Deletion behaviors borrow
  the existing panel through a narrow interface without `getRoot()`, registration,
  or destruction. Column relocation retains its document-wide access because it
  may need to move surviving children beyond the current panel boundary.
- Block behavior caret restoration now goes through the panel selection capability,
  which resolves and mounts targets inside the attached Page occurrence. The helper
  still receives the original native surface as a temporary identity guard; the
  remaining behavior context needs the shared root lifecycle before that parameter
  can be removed. Keyboard-driven behaviors also receive the originating `InputRoot`
  and reject stale work after a same-element remount. Empty column and TODO storage
  controls now capture the current registration capability and create their insertion
  context without an HTML element. Disabling or replacing the registration invalidates
  captured work even when Page stays mounted and the same element is re-enabled.
- The React multi-occurrence native listener reconciler now lives in the Root
  browser package. It preserves passive and capture groups, shared document/window
  listeners, stable listener identity, and rollback; React supplies its own panel
  lifecycle groups. This is still native dispatch, not the final normalized root
  attachment, and the single-occurrence listener implementation remains separate.
- Keyboard callbacks no longer inherit the DOM event value or expose its native
  event and block/content elements. The Root browser adapter retains native input
  privately for live target checks; callbacks still receive the surface element
  until the remaining root-dependent commands are migrated.
- React event routing now captures key and modifier data once per listener group.
  The keyboard transport and the plain-text paste release handler consume this
  snapshot. Live target checks now borrow a Root browser capability; the React
  keyboard event no longer retains a native keyboard event. The browser capture
  export remains temporary until React consumes normalized root delivery.
- React panel registrations own a shared `InputRoot` for event and keyboard
  deliveries. History and Edgeless deletion borrow it for attachment-safe focus
  and selection clearing; the native surface field and Page's separate root
  attachment remain until their consumers move to the same ownership boundary.
  A registration whose subscriber notification fails invalidates its new root,
  restores the prior registration when possible, and retries notification for
  rollback; both failures are retained if that retry also fails. The prior root
  is inactive while a replacement is staged and becomes current again only if
  the failed replacement rolls back; successful replacement detaches it permanently.
- Page owns the portal into its trailing insertion slot. The trailing-block
  extension no longer receives the surface element: it schedules caret restoration
  through panel selection, which cancels pending work after newer input or selection
  changes. Other React surface and extension consumers still need root migration.
- Edgeless tool normalization and gesture routing now consume copied pointer
  data. Pointer capture and default prevention are capabilities supplied by the
  browser adapter; native pointer events and elements are not passed to the tool
  gesture or normalizer. The React capture hook now registers normalized input
  on the viewport and no longer exposes React pointer handlers.
- Drawing capture geometry subscribes to its owning canvas camera rather than
  reading pan and zoom from the editor's HTML root. The SVG updates locally and
  releases the camera subscription on unmount; the remaining visual-tool and
  editor-root consumers still need their own browser capability migration.
- The borrowed `useCanvasViewport` interface no longer includes native layer
  elements, and the public layer hook is replaced by an attachment boolean.
  The concrete browser viewport exposes only attachment state and notifications;
  layer elements and nearest-canvas input routing remain in its package-private
  browser attachment for portals and Moveable; public `forElement` is removed.
  Toolbar preset previews now obtain the world layer's client-pixel origin from
  the viewport as numeric coordinates rather than receiving the plane element.
  Visual-tool pointer normalization also uses the viewport's client-to-world
  capability and the canvas snapping store instead of reading the HTML root.
  Canvas creation and toolbar placement render snap-guide data through the world
  portal, without reading or mutating the viewport plane. Each canvas owns its
  guides, and unmounting or cancelling removes only that canvas's feedback.
  Toolbar placement still uses the root for hit testing.
  Connector reconnection now passes client-coordinate points to the visual layer,
  which converts them through the same viewport capability. Its React control still
  owns pointer capture. The superseded DOM-based `canvasPoint` helper is removed;
  its coordinate scenario now tests the viewport's live camera conversion.
  React visual content and tool previews use `CanvasWorldPortal`, which owns the
  destination and follows viewport attachment without returning its element.
  Connector transforms now publish detached path and label data to an isolated
  portal renderer. Transform pinning and marquee selection borrow their owning
  canvas directly rather than finding it through a DOM element. The transform
  controller still accesses rendered connector hosts and the editor root for
  transform locks, and those browser interactions remain to move.
  Page navigation now borrows the mounted surface's canvas source directly to
  mount offscreen cards. Surface registration is attachment-scoped, and the
  former global canvas-adapter registry and DOM lookup are removed. The Page
  navigation bridge itself still resolves its occurrence from a DOM element.
  `CanvasTransformControls` also obtains its plane inside the canvas React layer;
  it now resolves mounted transform participants from canvas element IDs within
  that layer. Host adapters no longer provide DOM target lookup or identity
  callbacks, and prepare a drag with participant IDs. Host interaction markers
  are described as data and applied by the canvas to its own controls. A
  synchronous no-argument drag-start capability now keeps the native mouse or
  touch event inside the canvas Moveable integration. It preserves the host's
  event-router admission and claim order. The temporary canvas-owned document
  listeners still need review as part of moving browser attachment to the shared
  root and preserving multi-panel listener ownership.
- Page's before-input and native-selection observers now read portable selection
  from a controller-owned browser selection manager. The controller attaches and
  detaches it with the occurrence and preserves virtualized missing endpoints.
  Pointer selection, drag, and feedback still use the temporary native context.
- Shift-click range selection reads the live selection from that same attached
  manager, instead of supplying a native root to a separate selection reader.
  Pointer hit testing and native range restoration still need browser migration.
- React attaches the Page controller synchronously when `setRoot` registers a
  block-editor occurrence. This preserves immediate selection reads and
  restoration, root replacement, and directed endpoints before view effects run.
  `BlockEditorScope` borrows that attachment, while standalone Page views attach
  and detach their own controller. Edgeless waits for its context root to match
  its viewport ref because the context can temporarily lag during mode changes.
  Lifecycle tests cover both owners, failed setup and cleanup, and stale or replaced
  roots.
- React borrows the panel's existing Page selection converter for reads and
  restoration, and its navigation owner mounts virtual endpoints before Page
  restores them. These operations use the attached occurrence and do not accept
  a native root. The former React helper and its extra converter instances were
  removed. Other Page DOM selection and pointer methods still expose browser
  objects and require the remaining browser capability migration.
- Page extensions and hooks no longer receive `getRoot()` through
  `BlockEditorApi`. The controller now borrows a Root for attachment ownership;
  the mounting view still receives the native element at the React ref boundary.
  The standalone demo's host owns its focus presentation marker instead of
  obtaining the root from an extension API.
- Directed block coverage is built by `BlockSelectionRanges` from visible IDs
  and text lengths. React caret navigation and Page pointer selection no longer
  instantiate a DOM selection helper for that model-only calculation. Browser
  caret measurement and other focus operations still require DOM migration.
- Vertical caret movement now measures through the attached Page browser
  selection capability. Page walks the rendered occurrence, preserving distinct
  shells even when they share a block ID; React's panel selection owner supplies
  its existing synchronous neighboring-block mounting policy. Elements do not
  cross that selection API. Other focus paths still require migration.
- Horizontal caret movement now resolves adjacent positions through that same
  occurrence-owned selection capability. The host supplies the card-boundary
  selector and mounting operation; Page preserves the immediate-neighbor rule,
  including contentless stops and card-local movement.
- Page browser selection can now request caret focus by block ID and UTF-16
  offset without exposing a DOM element. The panel mounts an unmounted shell
  before retrying but leaves existing contentless shells alone. Keyboard caret
  navigation uses this capability; other focus callers still need migration,
  including cross-editor and card-scoped focus.
- Text-selection deletion and block-menu deletion now restore collapsed carets
  through the panel's ID-based focus capability. They still retain the native
  surface root for their separate structural-selection fallback; card-scoped and
  cross-editor focus paths have not yet migrated.
- Separator insertion requests continuation focus by block ID through the panel
  selection scheduler. Newer selection or input and surface teardown cancel the
  pending focus, including when the same DOM root is later reused.
- Empty-space Edgeless card creation also requests focus by the new block ID
  through the panel selection scheduler. The deferred action no longer captures
  a viewport element and is cancelled on newer input, selection or teardown.
- The same card-creation gesture registers normalized `dblclick` input with its
  canvas viewport and converts client coordinates through the viewport. Its
  document controller no longer accepts a React mouse event or reads a native
  target or viewport rectangle for that gesture. The viewport owns attachment;
  the React registration releases its handler on unmount.
- The Edgeless grid spotlight observes normalized pointer entry and movement
  through the canvas viewport. Its movement observation explicitly includes
  nested occurrences; ordinary handlers retain their occurrence boundary. The
  spotlight's browser-owned overlay, origin measurement and paint scheduling
  remain separate from document and canvas policy.
- In a serial Chromium `repeat=200` Page separator benchmark, a reconstructed
  previous implementation had a 26.4 ms median keydown delivery (9 samples,
  range 19.4–32.8 ms), versus 40.3 ms (range 37.7–46.1 ms) with the selection
  scheduler. Two-frame medians were 91.8 ms and 74.9 ms respectively. Direct
  scheduler instrumentation measured at most 0.2 ms. A subsequent Chromium
  trace showed additional style and layout work during a microtask from
  `useRestoreBlockFocus`: the pending callback enables immediate focus
  restoration for a remounted selection anchor. That restoration protects the
  next keystroke while the scheduled frame is pending. The trace identifies the
  extra work but does not establish whether it can safely be avoided; this
  remains an open performance question.
- Page's plain pointer-selection guard reads propagation state through the root's
  normalized pointer capability. Its selection clearing and other gesture paths
  still use Page's temporary browser context and require further migration.
- Page pointer selection can synchronously replace its attached occurrence from
  a selection subscriber during event delivery. A focused regression test covers
  this case: the original handler does not focus the replacement. A trial that
  resolved the surface from the current selection attachment after publishing the
  selection failed that test by focusing the new occurrence. Page input events
  now borrow an attachment-bound root capability for clearing browser selection
  and focusing the surface; detaching invalidates it, including on same-element
  remounts. Plain pointer, toggle, structural click, Shift-range and structural
  drag selection use these capabilities, including delayed restoration. Text
  geometry and native range restoration still use the temporary native context.
- Text drag restoration now checks the originating root's attachment after
  publishing model selection and before delayed restoration. A subscriber can
  replace the occurrence synchronously; stale native endpoints then leave the
  new browser selection untouched. A browser-owned text gesture retains the
  exact native endpoints while the pointer controller works with block IDs and
  UTF-16 offsets. Page's hit-testing and native range implementation still need
  to move behind the occurrence-owned browser capability.
- Plain structural-click selection now uses normalized target ancestry and live
  editability queries, including occurrence boundaries and non-element targets;
  that handler no longer reads Page's temporary native input context.
- Pointer selection's gesture-entry policy also uses normalized ancestry and
  editability, including exact identity for explicitly opted-in controls. Its
  caret hit testing and retained gesture geometry still use native Page context.
- Page's occurrence focus observer now uses normalized root input, including
  nested focus boundaries, remounts and initial focus reconciliation. Its input
  dispatcher still requires native context for selection and gesture consumers.
  The Page focus observer borrows the physical root without claiming input
  routing; its own focus-boundary checks still exclude nested Page occurrences.
  This allows wheel events over embedded Page content to reach the surrounding
  canvas. Owning listeners that share a physical root retain its boundary until
  the last owner detaches. This does not yet provide the planned single root owner.
  A regression in the initial focus migration blocked outer canvas wheel input
  over a nested Page; the borrowing behavior restores that path, including the
  existing fast-trackpad tests in Chromium and Firefox.
  `BrowserEvents` also retains exclusive ownership of its physical root; shared
  low-level listeners do not allow two event runtimes to attach to the same root.
  `NativeEventListeners` and browser platform detection remain in the root
  browser entry for that attachment lifetime. The native listener export remains
  temporary until Page and other remaining consumers migrate.
- The full host behavioral run passed 2,455 cases, skipped 6, and failed 9 with
  12 workers. Three failures passed when retried serially. The four drag-release
  expectation conflicts are documented in the breaking-changes report. The Kanban
  lane horizontal-gap reorder also failed serially in Chromium and Firefox; the
  corresponding columns case passed. Both Kanban failures reproduce against a
  saved earlier production build, which predates the normalized Page drag changes
  but is not an untouched main-branch baseline. In a diagnostic run the test's
  pointer landed 24 CSS pixels inside the scroll host, within its 96-pixel
  auto-scroll band; scrolling moved the intended gap while the pointer travelled.
  A temporary copy placing the gap farther from the edge passed in both browsers.
  At that point the original test remained unchanged; see Remaining work for the
  later fixture correction and current result.

## Canvas deletion performance observation

The root-capability change did not materially change the measured canvas deletion
cost. With the demo's default settings and `repeat=200`, the median synchronous
Delete delivery was about 80 ms in Chromium and 232 ms in Firefox before the
change, versus 79 ms and 236 ms afterward. These measurements use three real
keyboard samples per browser and a production preview.

A separate Chromium CPU profile of one deletion in an unminified diagnostic
build attributed roughly 64 ms of sampled work to `findPath`, Yjs array marker
lookup, and map reads under `EdgelessCanvasAdapter.getElements`. That projection
resolves each card's block parent while the CRDT is transacting; stale paths then
fall back to tree searches. This single profile does not establish Firefox's
internal breakdown. Any optimization must preserve panel-relative roots, missing
boundaries, and duplicate placements rather than assuming every listed root is
valid. The performance issue remains open and is separate from root ownership.

## Historical work list

The implementation milestones below followed this sequence:

1. Finish host, panel and extension contracts: keep attachment and destruction
   with lifecycle owners, and pass borrowed capabilities to consumers. Audit the
   actual construction, extension, embedding and cleanup paths together.
2. Move the remaining Page selection, hit-testing, pointer and drag browser
   mechanics into Root while retaining Page's selection and gesture policy.
3. Move remaining Edgeless input, viewport and Moveable browser integrations
   behind Root capabilities while preserving canvas ownership and local claims.
4. Remove superseded native transports and exports after React, Page and Edgeless
   consumers have migrated; audit the public contracts and package boundaries.
5. Run the plan's complete ownership and acceptance review, affected suites,
   workspace checks, Chromium and Firefox behavior, and matched performance tests.

ReactPanel now creates one mounted Root and PanelRegistry borrows it. Surface
identity survives disable and re-enable. Consumers that retain input across
callbacks must also retain their registration. The remaining audit covers these
consumers and the native-object boundaries in the packages listed above.

### Earlier implementation milestones

Before consolidation, React panels used two Roots.
`ReactPanel.setRoot` creates a mounted `BrowserInputRoot`, and
`PanelRegistry.registerPanel` creates a second `BrowserInputRoot` whose lifetime
represents one enabled routing registration. Disabling routing invalidates the
second object while Page keeps using the mounted Root; re-enabling creates a new
registration identity. Retained events and deferred selection work currently use
that identity and its attachment check to reject stale work.

Consolidating these objects requires moving the registration identity and its
validity checks into the existing routing and deferred-work contracts while Page,
Edgeless, and React borrow the same mounted Root. Simply returning the mounted
Root for each registration would revive old callbacks after re-enabling the panel.
The change must cover failed registration rollback, nested occurrences, disabled
panels, stale callbacks and disposers, pointer ownership, and selection cleanup
before removing the registration-scoped Root.

As a first implementation step, panel event routing now creates a distinct
`PanelInputRegistration` validity capability per registration. Editor and
keyboard events retain that capability; their dispatchers check it before
delivering handlers, and viewport-preserving indent/outdent carries it into
deferred selection work. Its validity depends on the exact registry entry and
the mounted occurrence, so a failed staged registration does not revive stale
work and the restored registration becomes current again. This begins to move
registration lifetime checks away from registration-scoped Root identity; the
second Root and other consumers of its lifetime still remain to be migrated.
The registration can additionally reject a mismatched input Root. Workspace build
and type checks passed; lint passed with 626 warnings. React passed 906 tests,
and the final registration fixture and type check passed after its last test-only
edit. Six Page, Edgeless, and embedded-event behavior cases passed in Chromium
and Firefox with 12 workers. Eight serial Page indent/outdent and numbering cases
passed at normal size and `repeat=200`. Before/after synchronous indent medians
in milliseconds were Chromium 4.6/5.1 normal and 36.7/36.9 large, Firefox 7/8
and 63/58; outdent was Chromium 3.9/4.5 and 36.5/34.1, Firefox 6/6 and 46/46.
Two-frame indent medians were Chromium 26.5/26 and 154.1/158.3, Firefox 27/25
and 122/122; outdent was Chromium 29.7/30.1 and 165.8/154.1, Firefox 28/29 and
95/98. Sample ranges overlapped. Four serial Edgeless typing cases also passed at
both sizes, but they are a general input proxy rather than an indent timing.
Two-frame timings do not establish settled layout. The one-Root migration and
full acceptance audit remain incomplete.

List-shortcut conversion now checks the captured `PanelInputRegistration` before
committing deferred input, before scheduling caret focus, and when that focus runs.
The regression fixture keeps the old Root attachment check true to model the
future shared-Root lifetime; it verifies that an ended registration cannot convert
or focus through its replacement. The same Root object per occurrence is not yet
implemented, and other event consumers still need the registration migration.
Workspace build and type checks passed; lint passed with 626 warnings. React
passed 908 tests. Six list behavior cases passed in Chromium and Firefox. Eight
serial list-shortcut timing cases passed in both browsers, covering Page and
Edgeless at normal size and `repeat=200`. Synchronous medians before/after in
milliseconds were Chromium
Page 1.4/1.3 normal and 3/3 large, Edgeless 3/3.1 and 9.5/9.2; Firefox Page
2/2 and 5/5, Edgeless 2/2 and 16/16. Two-frame medians were Chromium Page
23.6/23.1 and 24.4/28, Edgeless 20.5/21.3 and 23.2/23.1; Firefox Page 18/18
and 26/17, Edgeless 23/23 and 27/29. Sample ranges overlapped; two frames do not
prove settled layout. The complete migration and acceptance audit remain open.

The panel event route now exposes only the receiving panel and Root operations
used by event construction and delivery. Active/default Root lookup exposes only
the attachment check needed by selection, and listener reconciliation receives
the Root attachment check it uses. The panel registry still owns the concrete
registration and its teardown; the returned object identities have not changed.
Creation, registration, routing, selection lookup, listener reconciliation,
replacement, and destruction were reviewed separately from tests. Workspace build
and type checks passed, lint passed with 623 warnings, and React passed 904 tests.
Focused contract, activation, removal, and registration tests also passed.
The registry's emitted JavaScript was unchanged; browser behavior and interaction
timing were not rerun for this type-only contract change.

The generated Page declarations still include broad React HTML attribute types on
presentation components, which also admit native-event callbacks. Review each
component and its consumers before narrowing these contracts; simple attribute
removal could change how hosts compose styling, refs, and interactions.
The Page demo's `DemoBlockWrapper` now marks the nearest wrapper through a Root
region subscription, and a Page test verifies bubbling order through nested
`BlockItem` wrappers. The block handle still spreads editor control attributes.
Preserve each remaining component's interactions through an appropriate normalized
Root registration or narrowly scoped presentation API before changing its types;
do not remove handlers or assertions merely to make declarations narrower.
Visual-label rendered-text reads, insertion, and focus now borrow Root operations;
the private React browser adapter translates paste and other event deliveries.
The browser insertion path remains preferred for its caret and native editing
semantics, while the history extension continues routing keyboard undo to the
collaborative document history.

The Edgeless Moveable start adapter now owns the native event until it forwards
that event to the library. Its React control receives only copied Alt and Shift
values and reads the current Moveable ref after the synchronous modifier update.
Tests retain nested occurrence isolation, reentrant dispatch, touch, rollback,
and cleanup coverage. The adapter remains browser-specific because Moveable's
`dragStart` requires its native input.
Edgeless selection now captures the exact panel Root for each marquee controller
and reads pan markers through that capability. Browser mounting creates the
marquee using a Root-owned rectangle overlay and a captured occurrence region.
Edgeless receives normalized geometry and owns gesture and selection policy. The old controller is rejected after replacement, including replacement
during a marker read; a new controller attaches when the same element is remounted.
The captured Root is also rechecked after focus, which can synchronously replace
the occurrence; stale focus cannot clear selection or start a new marquee.
Three serial marquee samples per browser and size retained the expected selection
and hid the overlay on release. Chromium's normal/large two-frame medians were
16.4/16.1 ms before and 16.5/16.1 ms after; Firefox measured 14/20 ms before and 13/21 ms
after. Synchronous selection medians were at most 0.1 ms in Chromium and 1 ms in
Firefox, whose clock has 1 ms resolution. These measurements do not establish
settled layout or a speedup.

Block text synchronization now borrows an editable capability from the mounted
Root. React translates input and composition deliveries to opaque identities;
the editing controller retains no native event or element. The capability
rejects stale and nested occurrences, and React rebinds it when the editable or
Root is replaced. TODO text and timestamp updates retain their shared transaction
through a synchronous `runTextInput` callback. Tests moved or added for this work
are inside `__tests__` directories.

The Root (357 tests), Page (547 tests), and React (846 tests) suites and workspace
types passed. Chromium and Firefox passed 12 composition and TODO checks. Serial
three-sample before/after selection-before-input tests passed for both modes and
document sizes. Chromium Page two-frame medians were 20.5/18.1 ms normal and
27.1/28.5 ms large; Edgeless was 22.8/21.6 and 18.1/21.3 ms. Firefox Page was
18/15 and 13/16 ms; Edgeless was 25/14 and 24/24 ms. These measurements cover
caret capture before input, not the cost of committing the text edit, and do not
establish a performance improvement.

Page selection now reads the mounted Root's surface and pan markers instead of
borrowing a native element. This also repairs a missing host getter: a Page
embedded in an Edgeless document is identified by its own surface marker.
Selection is rejected if that Root is replaced during a marker read. The focused
test reproduced the previous incorrect result and now passes; the full React
suite passed 848 tests, workspace types and lint passed, and 16 Chromium/Firefox
selection, embedding and panning checks passed. Lint reports 594 warnings.

Matched serial range-selection measurements passed in both browsers for normal
Page and Edgeless documents and large Page documents. Chromium large Page
two-frame medians were 51 ms before and 62.5 ms after; a second after run measured
52.5 ms, with overlapping samples. Synchronous medians were 13.4/12.9 ms.
Firefox large Page two-frame medians were 32/32 ms. The benchmark does not cover
large Edgeless selection and these samples do not establish settled layout or a
speedup.

The Page `BlockDropTarget` and `BlockDropExclude` contracts now expose only drop
configuration and the existing child. Native React attributes and callbacks can
be placed on that child, whose ref, click behavior, and layout remain composed by
the existing Slot. `BlockDropTarget` continues to accept an absent child. Their
types are in the adjacent `types.ts`; the same package exports remain available.
The complete Page suite passed 548 tests, React passed 849, and workspace types,
build, and lint passed. Twenty parallel Chromium/Firefox cases passed for nested
exclusions, control activation, and drop placement in Page and Edgeless.

Three serial before/after samples passed for inside and excluded-control drops in
both browsers at normal and large sizes. Chromium large-document two-frame
medians were 288.1/271.6 ms inside and 260.3/263.1 ms at the control. Firefox
medians were 287/275 ms and 273/270 ms. Normal-document medians were about 30–31
ms. The existing large-document runs contain a long frame; these small samples
do not establish a speedup or settled layout.

Visual-label seeding, rendered-text reads, insertion, and focus now borrow the
mounted occurrence's Root. A private browser adapter translates React event
delivery. Labels retain their last owned draft when the Root detaches before
blur; insertion refuses foreign focus or selection and stops fallback mutations
if ownership changes. An unattached label previously focused itself; the new
regression demonstrated that failure and now verifies late attachment. Tests also
cover disabled panels, Root replacement during focus, listener cleanup, rendered
newlines, native insertion, fallback, and reentrant ownership changes.

The Root suite passed 365 tests and React passed 849; workspace types, build, and
lint passed (lint reported 597 warnings). Eighteen parallel Chromium/Firefox
cases passed for label typing, caret placement, connector newlines, clipboard,
and visual editing. Matched three-sample serial Chromium typing synchronous
medians were 0.2/0.4 ms normal and 0.4/0.5 ms large; Firefox was 0/1 ms for both
sizes at 1 ms clock resolution. Chromium caret two-frame medians were 10.9/11 ms
normal and 17.8/18.4 ms large; Firefox was 30/31 and 29/29 ms. These samples do
not prove a speedup or settled layout; Enter and paste behavior was tested but
their insertion latency was not measured separately. Keyboard undo continues to
use collaborative history, as explained in the breaking-changes record.

Nested editable attributes no longer expose a React pointer event in their public
callback type. The React hook still receives the browser delivery internally and
Root owns selection and pointer tracking. The occurrence-replacement unit test
and eight parallel Chromium/Firefox nested-selection cases passed. Matched serial
before/after runs passed for both modes and both document sizes. Chromium's
normal/large rendered medians were 16.3/16.5 and 18.5/19 ms in Page, and 16.4/16.4
and 16.1/16.1 ms in Edgeless. Firefox's large Page samples varied between 8 and
60 ms; the results do not establish settled layout or a performance improvement.
Transform modifiers now observe normalized keydown, keyup, and blur from the
mounted viewport's event owner. The component borrows observation only and
releases its registrations on unmount. Tests cover the owning iframe, detach and
reattach, cleanup, and failed-registration rollback. On matched serial Shift
toggles during resize, six samples per browser and size verified the expected
aspect ratio. Chromium synchronous medians at normal/large size were 0.6/0.7 ms
before and 0.7/0.75 ms after; Firefox measured 0.5/0 ms and 0/0.5 ms at its 1 ms
clock resolution. Two-frame ranges overlapped. Separate transform-move samples
also remained comparable; none establish settled layout or a speedup.
The old `BlockBehaviorContext` and its test-only factory required an HTML root
but were no longer used by production dispatch. They have been removed; behavior
fixtures use the same Root-free snapshot context as production, and keyboard
behaviors retain their narrow attachment capability.
Moveable's private callbacks, geometry conversion, mounted target lookup, and
control marker writes now reside together in Edgeless's browser boundary. The
React component borrows those operations; the host's transform adapter still
receives only selection policy and normalized preview and completion values.
The standalone 12-worker canvas run initially passed 53 cases and timed out
waiting for a pointer-down in the cancellation test; that case passed alone.
The test now waits for listener installation before dispatching the pointer,
and all 54 cases passed in a subsequent 12-worker run. Three serial standalone
transform-start samples after the move measured 6.2 ms synchronous and 29.1 ms
through two frames in Chromium, and 9 ms and 19 ms in Firefox. The immediately
preceding medians were 6.5/30.4 ms and 8/28 ms; these short samples do not prove
settled layout or a performance change.
Three serial transform-start samples on the standalone 10,000-element canvas
had synchronous medians of 5.8/6.5 ms before/after in Chromium and 8/8 ms in
Firefox; two-frame medians were 29.8/30.4 and 27/28 ms. In separately built
main-demo baselines, three serial transform-move samples at normal/`repeat=200`
had Chromium synchronous medians of 1.1/0.9 ms before and 0.8/0.9 ms after,
and Firefox medians of 1/2 ms before and 1/1 ms after. Two-frame ranges
overlapped at each size. These measurements assert preview or committed movement,
but do not establish settled layout or a speedup.

The virtualized Page view no longer retains an HTML root in its controller.
The browser mounting boundary discovers the host and occurrence, while the
controller owns the region lifetime, geometry cleanup, registration, and model
subscriptions. The region becomes inactive before its registration is released,
including rollback. Replacement, duplicate attachment, setup failure, and
observer/subscription cleanup tests cover the ownership boundary.
The default Edgeless toolbar now borrows Root's normalized document listeners
and a toolbar region for menu dismissal. Root copies the keyboard event's
already-prevented state, preserving Escape cancellation by earlier listeners.
The toolbar owns and releases those listeners while its menu is open; the host's
custom toolbar retains its own presentation and dismissal policy. Standalone
canvas tests cover outside pointer input, Escape, and active-tool behavior.
On the standalone demo's 10,000-element canvas, six serial Escape samples had
Chromium synchronous medians of 0.6 ms before and after and two-frame medians
of 28.7/28.45 ms; Firefox measured 0/0 ms synchronously and 25/26 ms through two
frames. The menu closed in every sample. The standalone demo supplies this large
fixture rather than the main demo's `repeat=200` route; two frames do not prove
that deferred layout has settled.
Page handle click tracking also copies the pointer origin and borrows normalized
window input for the rest of the press. Its owner releases observers at threshold,
release, cancellation, blur, replacement, or unmount. In six serial production
samples per browser and size, sub-threshold pointer movement had synchronous
medians of 0.15/0.2 ms before and 0.2/0.2 ms after in Chromium, and 0/0 ms
before and 0/0.5 ms after in Firefox (1 ms clock resolution). Two-frame samples
were variable; for large Firefox documents their ranges were 0–14 and 1–16 ms.
The active-drag samples retained visible feedback, with large-document synchronous
medians of 2.1/1.4 ms in Chromium and 2.5/2 ms in Firefox. These measurements do
not prove a speedup or settled layout.
Serial production-preview toggle measurements used three samples in each
direction after warmup and verified the tree's windowing state. At `repeat=200`,
Chromium's two-frame median for enabling/disabling windowing was 198.6/1218.8 ms
before, 187.1/1321.7 ms after, and 196.2/1310.2 ms in a repeated after batch.
Firefox's disabling medians were 2214/2215/2194 ms; its enabling samples varied
from 7 to 385 ms. Synchronous key-event medians remained at or below 1 ms, but
exclude deferred React work. The slower Chromium disabling samples remain an
unresolved performance concern: the view attachment effect does not depend on
the windowing toggle, but these samples do not establish the cause or settled
layout. The normal-size disabling medians were 26/26.4/24.9 ms in Chromium and
45/42/44 ms in Firefox.
An additional matched comparison built the pre-change attachment implementation
separately using a temporary build transform and served both builds on dedicated
preview ports. Chromium's large disabling medians were 1344.7 ms before and
1299.4 ms after (ranges 1324.7–1393 and 1272.2–1305.5 ms); Firefox measured
1955 and 2046 ms (ranges 1803–2152 and 1901–2570 ms). Both builds still have
substantial large-document rendering cost, and these small samples do not prove
settled layout or a speedup. A Chromium CPU sample of disabling windowing showed
garbage collection, rendering, geometry reads, and attribute writes among the
largest costs; the minified profile does not identify a specific root cause.
The combined virtualization, embedding, and navigation browser run had 115
passes, four skips, eight failures from the embedding test's obsolete panel API,
and one Firefox large-embedding timeout with 12 workers. After updating the test
to use Root, all 12 affected embedding cases passed both serially and in a new
12-worker run. The original timeout's cause remains unproven.

Extension setup and panel consumer contracts now exclude shared-editor
destruction and panel registration; panel document operations also exclude core
editor destruction. The host and the internal modal mounting path retain the
concrete lifecycle-capable editor. Clipboard and visual command helpers borrow
the narrower operations, and compile-time checks cover the exposed boundaries.
Page's ordinary `BlockEditorApi` no longer exposes the native layout-region
registry or DOM-taking drop registration. Page's internal rendering context
borrows those same controller-owned managers; its layout refs register regions,
while drag extensions and host drag routing borrow only destination resolution.
The mounted view still exposes the native registration path, and the registry,
geometry, and hit testing remain to be migrated into Root.
The virtualized-view lookup is now owned by each Page controller instead of a
global static registry. The mounted view registers its borrowed mounting
capability, Page selection and host navigation borrow lookup only, and stale
cleanup cannot remove a newer registration on the same root. Root now observes
focused and selected text owner IDs without exposing browser events or nodes.
The registry connects that observation whether the view or Root attaches first.
Each view releases its own observation; Root detachment, setup failure, and
destruction also release the affected observations. Page retains its pinning
policy. Selection and navigation now look up the view using their borrowed Root
identity; the mount-time registry now matches Root surface regions without
retaining native element keys. Browser mounting owners create those regions from
the elements they already own.
The browser mounting boundary now delegates document-offset measurement, resize
observation, and end-following scroll to Root's browser implementation. The view
retains the observation disposer and its model pinning policy.
Page's structural pointer hit testing now uses Root point and region capabilities
instead of retaining a native surface or inspecting browser elements. Registered
Page layouts provide opaque region identities, preserving custom rows and body
slots; unregistered shells use bounded Root traversal. A hit is discarded when
its borrowed Root or Page attachment ends during lookup. The registration and
drag layout implementation still owns native elements at the mounting boundary.
Cross-document drop receivers now register against Root identity and temporary
attribute capabilities instead of retaining HTML elements in their registry.
Page drag occurrences capture an occurrence region from that Root with a
registration-lifetime check; native drag hit and layout resolution remain to move.
Root now captures uncaptured pointer hits from normalized targets and owns their
explicit release. Page's input dispatcher uses one normalized listener transport
for every event group and no longer retains a separate native pointer context or
passes an HTML element into its event attachment. The Page geometry adapter still
resolves opaque hits to native elements until its own migration is complete.
Cross-document drag routing now captures a document capability from the source
Root. That capability validates and captures hits and detects occurrence adoption;
the Page router no longer holds an HTML element or performs browser hit testing.
Receiver lookup asks the opaque hit for its closest matching ancestor identity,
and rejects a hit that disconnects during that lookup.
Page's drop target resolver also obtains fallback document hits and captures
feedback anchor and outline regions from Root. It releases only its own hit and
rejects results if the Page attachment or captured document changes. The layout
and geometry traversal still use native elements internally and remain to migrate.
The resolver checks the hit's nearest editor identity through Root before starting
that traversal, including rechecking attachment ownership after the lookup. Its
query-local geometry now contains copied bounds and style tokens instead of live
DOM rectangle or CSS style objects; the browser still supplies those measurements.
Root regions now supply the anchor bounds, scale and computed CSS values, the
registered content bounds, and list direction used by drop geometry. Each query
captures regions under its exact Page attachment and stops if a measurement is
unavailable. Layout-host and occupied-background bounds are also measured through
Root. Background ownership and adjacent-hit checks now use attachment-bound Root
regions, including a bounded ancestor walk that stops when the hit or an already
visited path changes, even inside the same boundary. The
Nested Page boundary registration lookup, local target discovery, and outline
normalization now walk Root regions and use opaque registration identities.
Local discovery no longer unwraps the browser hit or receives a native root.
An owner-bounded background uses its query-local Root region, and registered
child identities are checked for containment in that owner. Layout host
registrations now store opaque identities captured by mounting refs, and Root
captures each host for the current query. The layout registry, ordered item
registrations, and drop declarations initially still retained native elements.
Ordered item and target registrations now also use opaque identities; the drop
resolver and geometry contracts contain no native element types. The Page layout
region registry now stores identities and resolves containment through Root.
Registration replacement and cleanup remain editor-owned.
Each layout registry now owns its identity index independently, including when
two occurrences temporarily register the same element. Drop measurements borrow
that registry instead of consulting the global mounted-region lookup. Native
row-hover lookup has moved to a browser adapter with weak element references;
the hover interaction itself now resides in that browser boundary and uses
Root's temporary attribute ownership for its row marker. Older hover cleanup
cannot erase a newer owner's marker. Pointer and scroll delivery and geometry
traversal originally remained browser-native. Scroll observation now uses the
editor's normalized event dispatcher; frame scheduling and document hit capture
use the originating Root. Detachment cancels pending work, and a new attachment
can observe scroll without recreating the view. Pointer movement and leave now
use Root's normalized browser listener transport; geometry traversal remains in
the browser adapter, but bounds, layout styles and hover markers now use regions
captured from the current editor Root. Detachment during a measurement discards
the result. Root captures the actual delivered target even under pointer
capture, and hover still receives nested occurrence input without adding another
tracked shared-dispatch registration.
Hover's list traversal and registered row/child lookup now use Root regions and
live indexed immediate children, preserving the bounded vertical search. Its
initial hit and registered slot lookup now also use Root regions and the local
layout registry; the native slot traversal has been removed.
The old browser-element lookup and its weak indexes had no production callers
after that change and have also been removed. Mounting refs now register only
opaque identities; the corresponding tests use the registry and Root.
In matched serial hover samples after the list traversal change, Chromium's normal/large
two-frame medians were 7.1/34.55 ms, compared with 7.45/22.65 ms before. A
second post-change batch measured 7.6/22.75 ms; the large ranges overlap the
baseline and do not establish the cause of the first batch's increase. Firefox
measured 7.5/9.5 ms, compared with 8/10.5 ms before, and 12/7.5 ms in the
repeat batch. Synchronous medians stayed at or below 0.1 ms in Chromium and
0.5 ms in Firefox across both batches. These six-sample measurements verify row
markers but do not include all window listeners or prove layout has settled. These
samples precede the hit lookup change and do not measure its effect.
After hit lookup and weak-index removal, a further six-sample production-preview
run measured normal/large two-frame medians of 8.9/28.05 ms in Chromium and
4.5/11.5 ms in Firefox. Synchronous medians were 0.1/0.1 ms in Chromium and
0/0 ms in Firefox (1 ms clock resolution). Chromium's large two-frame range was
23.5–63.3 ms, so these samples do not establish a performance improvement or a
stable regression against the 22.65 ms pre-change median.
In serial production-preview hover checks, six samples per browser and size
retained the expected row marker. Median synchronous capture-to-root-bubble time
was 0.1 → 0.05 ms at normal size and 0.1 → 0.1 ms at `repeat=200` in Chromium;
Firefox reported 0 ms at both sizes before and after (clock resolution 1 ms).
Two-frame medians were 8.4 → 7.45 ms and 25 → 22.65 ms in Chromium, and
9.5 → 8 ms and 8 → 10.5 ms in Firefox. Ranges overlapped; this measurement
does not include earlier window-capture or later window-bubble listeners, and
does not establish settled layout.
After pointer delivery moved, serial production-preview drag-feedback medians
were 159 ms on a normal page and 520 ms at `repeat=200` in Chromium, and 154 ms
and 399 ms in Firefox. The immediately preceding medians were 159/477 ms and
153/386 ms; the new ranges were 158–160 and 514–521 ms in Chromium, and
143–155 and 391–410 ms in Firefox. Two earlier post-change batches using the
shared dispatcher varied more widely, so hover now borrows the untracked browser
listener transport. A Chromium CPU sample of repeated large-document drag moves
attributed the largest named sample count to browser rectangle reads; it does not
establish the cause of the timing difference. Earlier baseline batches also had
wide large-page ranges, and isolated synchronous and settled-layout measurements
remain outstanding.
Serial production-preview drag-feedback medians before and after the scroll
change were 160 → 159 ms on a normal page and 480 → 477 ms at `repeat=200` in
Chromium; Firefox measured 155 → 153 ms and 383 → 386 ms. New ranges were
159–175 and 476–478 ms in Chromium, and 148–155 and 382–394 ms in Firefox.
These samples measure input through two frames, not scroll reconciliation,
isolated synchronous work, or settled layout. Scroll-specific before/after
performance remains to be measured.
After the hover feedback change, serial production-preview drag-feedback medians
were 160 ms on a normal page and 480 ms at `repeat=200` in Chromium, and 155 ms
and 383 ms in Firefox. The preceding medians were 161/516 ms and 154/408 ms;
new ranges were 159–160 and 470–491 ms in Chromium, and 148–155 and 376–414 ms
in Firefox. These input-through-two-frame samples do not isolate synchronous work
or establish when layout has settled.
After the identity-only layout registry change, serial production-preview
drag-feedback medians were 161 ms on a normal page and 516 ms at `repeat=200`
in Chromium, and 154 ms and 408 ms in Firefox. The preceding medians were
160/484 ms and 155/386 ms; new ranges were 160–161 and 413–524 ms in Chromium,
and 144–156 and 397–417 ms in Firefox. The large-page samples vary substantially
and do not isolate synchronous work or establish when layout has settled.
Serial production-preview drag-feedback medians before and after this ownership
change were 160 → 160 ms for a normal page and 481 → 484 ms at `repeat=200` in
Chromium; Firefox measured 154 → 155 ms and 388 → 386 ms. New ranges were
160–160 and 449–561 ms in Chromium, and 138–156 and 379–393 ms in Firefox.
These input-through-two-frame samples do not isolate synchronous work or prove
that layout has settled.
Serial production-preview drag-feedback medians before and after the target
identity change were 160 → 160 ms on a normal page and 485 → 481 ms at
`repeat=200` in Chromium; Firefox measured 155 → 154 ms and 391 → 388 ms.
New ranges were 159–161 and 475–481 ms in Chromium, and 153–156 and 382–411 ms
in Firefox. These input-through-two-frame samples do not isolate synchronous work
or establish when layout has settled.
Serial production-preview drag-feedback medians before and after the layout-host
identity change were 160 → 160 ms for a normal page and 478 → 485 ms at
`repeat=200` in Chromium; Firefox measured 155 → 155 ms and 390 → 391 ms.
New ranges were 158–160 and 455–505 ms in Chromium, and 147–155 and 375–392 ms
in Firefox. These input-through-two-frame samples do not isolate synchronous
work or establish when layout has settled.
Virtual-list index and endpoint metadata, body ownership, and descendant-edge
containment now use attachment-bound Root measurements instead of direct DOM
queries in drop geometry. Indexed ancestors are bounded by the current Page root;
an ancestor path that changes during lookup invalidates the query.
Serial production-preview drag-feedback medians before and after this change were
160 → 160 ms for a normal page and 503 → 478 ms at `repeat=200` in Chromium;
Firefox measured 154 → 155 ms and 384 → 390 ms. New ranges were 159–161 and
474–508 ms in Chromium, and 147–155 and 383–394 ms in Firefox. These samples
measure input through two frames and do not isolate synchronous work or prove
that layout has settled.
When a hit moves during local discovery, the Root walk discards the whole result.
The prior and new serial production-preview drag-feedback medians were 160 →
160 ms on a normal page and 501 → 503 ms at `repeat=200` in Chromium; Firefox
measured 155 → 154 ms and 407 → 384 ms. The new ranges were 160–160 and
434–511 ms in Chromium, and 145–154 and 381–390 ms in Firefox. These samples
cover pointer input through two frames, not isolated synchronous work or settled
layout; they do not establish a performance improvement.
Local child-scope and owner-identity decisions in nested drop geometry now read
through the same attachment-bound Root measurements. The existing registered
layout lookup still retains native elements; this does not complete its migration.
The focused production-preview drag-feedback check passed three serial samples
per browser and document size. Chromium medians were 160 ms at normal size and
501 ms at `repeat=200` (ranges 159–161 and 482–506 ms); Firefox medians were
155 ms and 407 ms (ranges 147–155 and 406–422 ms). The preceding medians were
160/514 ms and 155/409 ms respectively. These pointer-input-through-two-frame
measurements neither isolate synchronous work nor establish settled layout.
Serial Chromium production-preview checks at `repeat=200` measured a 576 ms
median (564–587 ms) for the first post-change batch and 482 ms (477–489 ms) for
a second batch. Earlier samples for the prior build had medians of 578 ms and
490 ms in two batches, so this end-to-end measurement does not establish a
consistent change or isolate synchronous work.
After outline normalization moved, three serial production-preview samples gave
Chromium medians of 160 ms on a normal page and 514 ms at `repeat=200` (ranges
159–160 and 478–529 ms). Firefox medians were 155 ms and 409 ms (ranges 154–168
and 400–410 ms). The large-page ranges overlap earlier batches; these measurements
include input and two frames, not separate synchronous or settled-layout times.
The captured hit region also expires when the originating hit is released, even
if the underlying element remains mounted.
In serial Chromium production-preview drag feedback checks at `repeat=200`, the
three-sample median was 492 ms before this change and 578 ms in the first run
(ranges 419–494 and 567–579 ms). A second post-change run measured a 490 ms
median (489–505 ms). A CPU sample of repeated drag movement attributed the
largest named cost to browser rectangle reads; it did not establish the cause of
the first run's difference. A separate synchronous Root ancestor-walk probe on
the same built demo measured medians of 0.2 ms at 128 levels, 0.5 ms at 256,
and 2.1 ms at 512 (100 samples each). Path validation repeats ancestry checks,
so very deep trees can cost more; this probe does not include full rendering.
After moving the remaining rectangle reads, three serial production-preview drag
samples gave Chromium medians of 159 → 160 ms on a normal page and 468 → 492 ms
at `repeat=200` (ranges 158–160 → 159–160 ms and 420–513 → 419–494 ms).
Firefox medians were 154 → 155 ms and 388 → 406 ms (ranges 150–155 → 154–155 ms
and 379–406 → 376–413 ms). Ranges overlap; these input-through-two-frame samples
do not isolate synchronous work or establish when deferred layout has settled.
Three serial production-preview drag feedback samples before and after Root-backed
measurements gave Chromium medians of 160 → 159 ms on a normal page and 478 → 468 ms
at `repeat=200` (ranges 159–160 → 158–160 ms and 457–485 → 420–513 ms).
Firefox medians were 154 → 154 ms and 387 → 388 ms (ranges 153–155 → 150–155 ms
and 378–397 → 379–406 ms). These input-through-two-frame samples do not isolate
synchronous work or establish when deferred layout has settled.
Three serial production-preview samples before and after this change gave
Chromium drag feedback medians of 159 → 160 ms on a normal page and 449 → 478 ms
at `repeat=200` (ranges 159–160 → 159–160 ms and 429–501 → 457–485 ms).
Firefox medians were 153 → 154 ms and 397 → 387 ms (ranges 153–156 → 153–155 ms
and 389–417 → 378–397 ms). These input-through-two-frame samples do not isolate
synchronous work or establish when deferred layout has settled.
Three serial production-preview drag feedback samples before and after this
change had Chromium medians of 159 → 159 ms on a normal page and 489 → 449 ms
at `repeat=200` (ranges 158–160 → 159–160 ms and 478–503 → 429–501 ms).
Firefox medians were 155 → 153 ms and 384 → 397 ms (ranges 155–156 → 153–156 ms
and 384–410 → 389–417 ms). These input-through-two-frame measurements do not
separate synchronous work or prove that deferred layout has settled.
Serial production-preview drag feedback timings were 160 → 159 ms on a normal
Chromium page and 497 → 489 ms at `repeat=200`; Firefox measured 155 → 155 ms
and 393 → 384 ms. The previous values are single samples; the new medians use
three samples, with ranges 158–160 ms and 478–503 ms in Chromium, 155–156 ms
and 384–410 ms in Firefox. These measure input through two frames rather than
isolating synchronous work or establishing when deferred layout settled.
After the pointer transport change, serial production-preview drag feedback
samples measured Chromium at 159 → 160 ms for a normal page and 492 → 497 ms
at `repeat=200`; Firefox measured 153 → 155 ms and 387 → 393 ms. Each value is
one input-through-two-frames sample, so it does not isolate synchronous cost or
establish when deferred layout has settled.
The drag boundary observes panel input Root replacement through the panel's
existing subscription, so disabling and re-enabling a panel or remounting the
same surface replaces the receiver and releases its previous marker.
Serial production-preview drag feedback checks before and after this lifecycle
change measured Chromium at 160 → 159 ms for a normal page and 476 → 492 ms
at `repeat=200`; Firefox measured 153 → 153 ms and 404 → 387 ms. Each is a
single end-to-end input-through-two-frames sample, not a separate synchronous
measurement or proof that deferred layout settled.
In serial production-preview checks at `repeat=200`, structural-drag synchronous
medians were 0.1 → 0 ms in Chromium and 0 → 0 ms in Firefox; two-frame medians
were 27.3 → 25.8 ms and 11 → 8 ms. Ordinary Firefox pointer selection's
two-frame median was 84 → 98 ms, with overlapping ranges; three further post-change
medians were 100, 86 and 98 ms. The single baseline and two-frame proxy are too
limited to attribute that difference or establish settled rendering time.
Page's hovered structural-selection feedback now holds a temporary region
attribute, so cleanup still releases it after Root detachment and cannot erase
feedback acquired by a newer owner.
Production-preview modifier-selection checks passed in both modes and browsers
at normal size and `repeat=200`. At the larger size, synchronous medians were
1.1 → 1.2 ms (Page) and 2.3 → 2.3 ms (Edgeless) in Chromium, and 2 → 2 ms
and 4 → 4 ms in Firefox. Chromium Page's two-frame median was 22.8 → 31.1 ms,
with overlapping ranges of 20.1–64.2 and 20–67.2 ms; these samples do not
establish settled rendering time.
Panel selection now checks its own navigation attachment without resolving a
native surface; navigation still owns the internal registration needed for
cross-panel discovery and older DOM-based helpers.
Viewport restoration now borrows the initiating panel's navigation and checks
its live attachment before mounting after React commits. Anchor measurement and
selected-region scanning now go through the originating Root, while React keeps
anchor selection policy. Scroll adjustment now uses a Root capability bound to
the captured document. Window wheel delivery now comes from Root as a numeric
delta, and frame timing and cancellable requests now use a Root clock. Settlement lookup
uses Root's opaque surface identity instead of an HTML element. Providers that
omit the optional identity fall back to per-Root settlement ownership.
Deferred selection restoration now borrows the mounted Root's cancellable frame
clock and normalized input observations. Pending work uses Root's opaque surface
identity and is cancelled if its originating occurrence is detached or replaced,
including a remount on the same element. Selection no longer owns native input
listeners or keys this work by an HTML element.
Panel selection also reads rendered nesting through Root and reuses Root's
adjacent text-position lookup for editable neighbors. The old native parent and
adjacent-block walks have been removed. Structural-predecessor editing now
captures its card or panel scope through Root, checks directly owned content,
and clears selection and focuses through borrowed capabilities after the edit.
Cross-editor caret navigation now discovers neighboring top-level occurrences
and reads their edge content through Root. Page retains mounting and focus
policy, and its navigation registry uses opaque surface identity with an
attachment check that rejects a same-element remount.
Selection ownership no longer receives the panel's native root for its
availability check. Slash-menu input and viewport positioning now use the
registration-bound Root; an editor portal boundary owns the native body lookup
and rejects stale registrations or mismatched surface identities.
The public `ReactPanelApi` no longer exposes `getRoot`; the mounting owner keeps
the concrete panel and its internal root lookup. The surface context and panel
snapshot now borrow a narrower panel interface with the Page operations needed
for mounting and nested editor setup. Its editor contract permits panel
registration for that lifecycle but excludes shared editor destruction; the
general `useReactPanel` contract also excludes panel registration. Page's view
compares opaque Root identity when borrowing a host attachment; its controller
exposes `inputRoot` instead of a native-root getter. The view still accepts a
native element at its mounting boundary and Page's lower-level hit-testing and
drag browser implementations require further migration.
The standalone Page drop inspector measures resolved anchors through
`InputRegion.readBounds`, which discards geometry if ownership changes during
measurement. It no longer consumes a native element from a drop result.
After the attachment change, modifier-selection checks passed at normal size and
`repeat=200` in Chromium and Firefox. Large-document synchronous medians were
1.4 → 1.2 ms (Page) and 2.4 → 2.5 ms (Edgeless) in Chromium, and 2 → 2 ms
and 4 → 4 ms in Firefox. These input timings do not measure attachment startup;
two-frame results are a rendering proxy rather than settled-layout evidence.
Edgeless transform admission now reads panning attributes through its routed Root,
and active transform markers are temporary Root-owned attributes. Failed
preparation and cancellation release marker and pin resources independently;
rendered target and connector preview styles now use occurrence-bound region
sessions. The transform controller no longer retains a surface or target HTML
element. The independent canvas control integration still uses native elements
for Moveable measurement and needs further migration.
Region style sessions reserve the properties they update and finish with explicit
styles even after detachment; a replacement session cannot be overwritten by
older cleanup. Temporary attributes likewise preserve newer owners. Nested
occurrence boundaries are excluded when transform participants are captured.
The canvas tool layer now borrows opaque surface identity, attachment-bound
coordinates and focus rather than receiving the native surface or browser
layers. Coordinate results and normalized pointer samples are discarded if
their attachment is replaced during conversion.
In the independent production demo's 10,000-element fixture, three pointer-move
samples measured synchronous medians of 0.2 → 0.3 ms in Chromium and 1 → 1 ms
in Firefox; two-frame medians were 16.4 → 16.4 ms and 17 → 17 ms. This fixture
has no normal-size setting, and the two-frame proxy does not establish when all
rendering has settled.
In serial production-preview checks at `repeat=200`, Chromium connector movement
had a synchronous median of 1.1 → 1.3 ms and a two-frame median of 16.3 →
16.4 ms; three additional runs had synchronous medians of 0.8, 1.2 and 1.2 ms.
Firefox measured 2 → 2 ms and 16 → 16 ms. Shape movement measured 1 → 1 ms
and 16.3 → 16.3 ms in Chromium, and 1 → 2 ms and 15 → 15 ms in Firefox.
These small samples and the two-frame proxy do not prove settled rendering time.
The control adapter captures the input registration instead of an HTML element;
stale callbacks and cleanup cannot start or cancel a replacement occurrence's
gesture, including when the same element is remounted.
After the control registration change, large-document connector previews had
median synchronous times of 1 → 1.1 ms in Chromium and 3 → 2 ms in Firefox;
two-frame medians were 16.4 → 16.3 ms and 15 → 16 ms. Shape movement's
single Firefox rendering sample changed from 13 to 15 ms; three further samples
were 14–16 ms (median 15 ms). The single baseline sample and two-frame proxy
are insufficient to establish whether that difference is a regression.
For large-document transforms, serial production-preview checks in Chromium and
Firefox passed before and after this change. Connector movement's median
synchronous time was 1.8 → 1 ms in Chromium and 3 → 3 ms in Firefox; its
two-frame median was 16.1 → 16.4 ms and 14 → 15 ms respectively. Shape movement
measured 1.3 → 1 ms synchronously and 16.1 → 16.3 ms for rendering in Chromium,
and 2 → 2 ms and 13 → 13 ms in Firefox. These short samples do not establish
settled rendering time.
For large-document slash input, three serial Chromium samples gave Page
synchronous medians of 27.4 → 15.9 ms and two-frame medians of 72.9 → 44.3 ms;
Edgeless measured 6.4 → 7.4 ms and 22 → 20.2 ms. Firefox Page measured
2 → 3 ms and 28 → 39 ms; an isolated repeat measured 1 ms and 30 ms. Firefox
Edgeless measured 7 → 7 ms and 27 → 29 ms. Command execution also passed in
both modes and browsers. These samples are noisy and two frames do not prove
settled layout.


For those input samples, Chromium Page synchronous ranges were 20.2–30.1 →
15.2–16.9 ms and two-frame ranges 68.4–79.1 → 43.9–46.2 ms; Edgeless ranges
were 6.3–9.2 → 6.4–11.5 ms and 21.6–22.5 → 19.4–20.7 ms. Firefox Page
ranges were 2–2 → 3–5 ms and 20–31 → 34–40 ms, with repeat ranges 1–2 ms and
18–35 ms. Firefox Edgeless ranges were 7–8 → 7–8 ms and 27–28 → 28–31 ms.
For large-document cross-editor caret movement, three serial Chromium samples
gave synchronous medians of 28.3 → 26.5 ms and two-frame medians of 71.1 →
50.7 ms. Firefox measured 18 → 21 ms and 44 → 56 ms; an isolated repeat
measured 18 ms and 41 ms. A later isolated comparison using the former native
lookup measured 23 ms and 58 ms in Firefox; after the final attachment-race
fix the migrated path measured 22 ms and 51 ms. Samples are noisy and two
frames do not establish settled layout.
For the separator continuation's large-document Backspace, three serial
Chromium samples gave synchronous medians of 30.1 → 29.7 ms and two-frame
medians of 107.3 → 103 ms. After the final attachment guard, Chromium measured
28.8 ms and 99.3 ms. Firefox measured 20 → 18 ms and 97 → 107 ms; an isolated
repeat measured 19 ms and 93 ms. These samples are noisy and two frames do not
establish settled layout.
For large-document Backspace, three serial Chromium samples gave merge medians
of 32.8 → 31.9 ms synchronous and 152.5 → 144.1 ms after two frames; nested
outdent measured 39.8 → 34.4 ms and 89.8 → 89.1 ms. Firefox merge measured
26 → 23 ms and 123 → 123 ms; nested outdent measured 16 → 16 ms and 78 → 90 ms,
with an isolated repeat of 16 ms and 83 ms. These samples are noisy and two
frames do not establish settled layout.
After migrating selection input observations, three serial large-document indent
samples gave Chromium synchronous medians of 37.7 → 34.4 ms and two-frame medians
of 168.1 → 158.5 ms. Firefox measured 60 → 69 ms and 126 → 151 ms; an isolated
repeat measured 60 ms and 129 ms. Samples are noisy and two frames do not establish
settled layout.
After migrating deferred frames, three serial large-document indent samples
gave Chromium synchronous medians of 38 → 38.6 ms and two-frame medians of
177.7 → 174.8 ms. Firefox measured 60 → 70 ms and 124 → 159 ms; an isolated
repeat measured 62 ms and 124 ms. After adding frame-request failure cleanup,
the same comparison measured 37.7 ms and 168.1 ms in Chromium, and 60 ms and
126 ms in Firefox. These samples are noisy and two frames do not establish
settled layout.
After adding frame cancellation, three serial large-document indent samples
gave Chromium synchronous medians of 40.3 → 38 ms and two-frame medians of
168.6 → 177.7 ms; Firefox measured 71 → 60 ms and 165 → 124 ms. These
samples are noisy and two frames do not establish settled layout.
After replacing the native settlement key, three serial large-document indent
samples gave Chromium synchronous medians of 36.9 → 40.3 ms and two-frame
medians of 173.5 → 168.6 ms; Firefox measured 67 → 71 ms and 162 → 165 ms.
These noisy samples do not establish settled layout.
After moving frame scheduling, three serial large-document indent samples gave
Chromium synchronous medians of 37.2 → 36.9 ms and two-frame medians of
184.2 → 173.5 ms; Firefox measured 71 → 67 ms and 176 → 162 ms. These noisy
samples do not establish settled layout.
After moving wheel observation, three large-document Chromium indent samples
measured synchronous medians of 39 → 37.2 ms and two-frame medians of
163 → 184.2 ms; a repeat measured 41 ms and 184.9 ms. The before and after
ranges overlap, but the higher two-frame results remain unexplained. Firefox
medians were 70 → 71 ms synchronous and 170 → 176 ms after two frames. These
samples do not establish settled layout.
An isolated comparison restored the previous direct wheel listener in a copy
of the same source and compared production builds under the same browser and
fixture. Nine large-document Chromium samples measured synchronous medians of
43.3 → 44.2 ms and two-frame medians of 178 → 183.5 ms; ranges overlapped.
This comparison did not reproduce the earlier timing gap, but does not prove
settled layout or rule out smaller changes.
After moving scroll adjustment, three serial large-document indent samples
measured Chromium synchronous medians of 37.3 → 39 ms and two-frame medians
of 168.4 → 163 ms; Firefox measured 66 → 70 ms and 155 → 170 ms. The samples
are noisy and two frames do not establish settled layout.
After moving region scans, three large-document indent samples measured Chromium
synchronous medians of 37.5 → 37.3 ms and two-frame medians of 161.8 → 168.4 ms.
Firefox measured 63 → 66 ms and 120 → 155 ms; a repeat measured 60 ms and
120 ms. The overlapping repeated measurements are noisy, and two frames do not
establish settled layout.
After moving anchor measurement, three serial large-document indent samples
measured Chromium synchronous medians of 37.9 → 37.5 ms and two-frame medians
of 170.4 → 161.8 ms; Firefox measured 69 → 63 ms and 172 → 120 ms. These
samples are noisy and two frames do not establish settled layout.
Three serial large-document indent samples measured Chromium synchronous
medians of 36 → 37.9 ms and two-frame medians of 164.2 → 170.4 ms; Firefox
measured 74 → 69 ms and 177 → 172 ms respectively. Both browsers retained
selection and hierarchy in the measured indent/outdent scenarios. Two frames
are a rendering proxy and do not establish settled layout.
After that change, three large-Page caret-extension samples measured Chromium
synchronous medians of 38.3 → 41.5 ms and two-frame medians of 65.8 → 64.7 ms;
Firefox synchronous medians were 27 → 27 ms and two-frame medians 84 → 74 ms.
Firefox large Edgeless two-frame median rose from 18 to 31 ms and remained 31 ms
on repeat; an earlier nine-sample baseline ranged 17–33 ms. These noisy
two-frame samples do not establish the cause or prove settled layout.
After isolating the hit test, large-document structural-drag two-frame medians
were 29 → 31.5 ms in Chromium and 7 → 8 ms in Firefox, with synchronous samples
at or below 1 ms. Three samples per run do not establish settled layout.
Three serial large-document structural-drag samples measured Chromium
two-frame medians of 25.6 → 29 ms and Firefox 9 → 7 ms; synchronous samples
were at or below 1 ms. These are rendering proxies, not settled-layout timings.
After region-based registration, three large-Page samples in Firefox measured
23 → 27 ms synchronous and 66 → 84 ms after two frames; a repeat measured
25 ms and 77 ms. The before and after ranges overlap, but the small samples do
not establish a cause or settled layout. Chromium medians were 42.8 → 38.3 ms
synchronous and 63.6 → 65.8 ms after two frames.
After moving that browser work, serial large-Page caret-extension medians were
40.5 → 42.8 ms synchronous and 69.8 → 63.6 ms after two frames in Chromium;
Firefox measured 21 → 23 ms and 63 → 66 ms respectively. These three-sample
measurements are noisy and the two-frame proxy does not prove settled layout.
Parallel browser checks passed 21 of 22 cases; the Chromium normal-size
virtualization-toggle position check passed on its required serial rerun.
For the lookup change, three serial production-demo large Page samples measured
Chromium synchronous medians of 47.3 → 45.3 ms and Firefox 20 → 21 ms; two-frame
medians were 70.2 → 68.5 ms and 64 → 65 ms. Firefox large Edgeless two-frame
medians rose from 20 to 29 ms, with a repeat of 30 ms, while synchronous medians
remained 6 → 7 ms. These small samples do not establish the cause or settled
layout; the rendered timing remains a measurement risk to investigate.
Repeating that Firefox scenario against the retained previous build produced a
27 ms two-frame median over nine samples (17–33 ms). The next build measured
29 ms (18–34 ms), with synchronous medians of 6 ms in both. The overlapping
ranges show substantial variation and do not establish the earlier increase as
a regression; neither measurement proves that layout has settled.
After moving the focus and selection observers, three serial large-Page
caret-extension samples gave Chromium synchronous medians of 43.2 → 48.9 ms
(ranges 40.4–44 → 38–52.2 ms) and Firefox medians of 29 → 19 ms. The
two-frame medians were 64.9 → 69.1 ms and 81 → 63 ms respectively. Both
virtualized-selection scenarios passed in each browser. These samples are noisy
and the two-frame measurement does not establish settled layout.
The existing serial caret-extension comparison ran three samples in Page and
Edgeless at normal size and `repeat=200`, in both browsers. For large Page,
Chromium synchronous extension medians were 38.9 → 39.4 ms and two-frame medians
63.7 → 65.4 ms. Firefox initially measured 22 → 26 ms and 65 → 82 ms; a repeat
of the same scenario measured 21 ms and 63 ms, overlapping the baseline. Two
virtualized-selection scenarios also passed serially before and after in both
browsers. These timings do not establish settled layout.
Serial production-demo between-region drag samples compared three runs per browser
at normal size and `repeat=200`. At the large size, Chromium synchronous medians
were 5.3 → 5.6 ms and rendered medians 267 → 269.1 ms (ranges 259.5–268.3 and
259.5–283.8 ms); Firefox was 13 → 13 ms and 268 → 268 ms (ranges 265–281 and
253–329 ms). The rendered measurement is a proxy, not proof of settled layout.
Panel selection, Edgeless transform and slash presentation still retain browser
objects and remain part of the following milestones.
Page structural-selection focus now clears browser ranges and focuses through the
borrowed Root, rechecking the exact selection attachment between operations.
The Root now also finds the first matching region in that occurrence and scrolls
it into view without returning an element. Other Page selection lookups remain in
the selection migration. A three-sample production-demo Alt+ArrowDown
comparison checked the selected block and two animation frames in both browsers.
At normal size, median Chromium time was 22.5 ms before and 22.3 ms after, and
Firefox was 31 ms before and 30 ms after. At `repeat=200`, Chromium was 63 ms
before and 62.9 ms after; Firefox was 52 ms before and 61 ms after, then 53 ms
on a three-sample repeat (range 52–65 ms). The timing is a rendering proxy, not
settled-layout or synchronous-command timing; the latter was not measured.
For the subsequent scroll migration, a separate three-sample comparison timed
selection publication and structural focus, including their synchronous subscribers,
and the two-frame result. At `repeat=200`, Chromium medians were 16.5 → 15 ms
synchronously and 64.8 → 65.8 ms for two frames; Firefox was 32 → 27 ms and
69 → 51 ms. Normal-size medians were 1.4 → 1.4 ms and 23.8 → 21.8 ms in
Chromium, and 4 → 2 ms and 31 → 29 ms in Firefox. These timings do not include
all keyboard-command work or prove settled layout. A separate real-input check
moved the selected block beyond the initial viewport and confirmed it was visible
after scrolling in both browsers with `repeat=200`.
Page's text-caret focus now asks Root to locate the first owned shell, distinguish
missing shell from missing content, focus the directly owned host, and restore the
caret. The Page attachment supplies its currentness check because it can end while
its borrowed Root is still active. Other Page selection reads and range operations
still retain browser objects. A three-sample production-demo block-selection-to-caret
comparison verified a collapsed caret at offset zero. At `repeat=200`, Chromium
medians were 8.9 → 8.8 ms in focus and 63.2 → 57.2 ms after two frames; Firefox
was 17 → 15 ms and 49 → 48 ms. At normal size, Chromium was 0.7 → 0.8 ms and
23.9 → 24.6 ms, and Firefox was 2 → 2 ms and 26 → 24 ms. Focus timing excludes
the rest of the keyboard command; two frames do not establish settled layout.
Page now reads directed browser text endpoints through Root, then builds the
model-backed selection using its existing ordering and text-length policy. Root
excludes nested occurrences and returns no native nodes. A three-sample
production-demo Shift+Right comparison checked a
one-character native selection at normal size and `repeat=200` in both browsers.
Two-frame medians at the large size were 21.1 → 26.1 ms in Chromium (ranges
17.9–25.2 and 21.3–28.8 ms) and 16 → 21 ms in Firefox (ranges 5–17 and 7–21 ms).
These overlapping samples are noisy and do not establish a regression or settled
layout. The browser read timing was near timer resolution and does not measure the
whole keyboard command; the cross-block browser tests separately check model behavior.
Page selection restoration now resolves its model endpoints using Root's rendered
text lengths, then asks Root to resolve native points, focus, and restore the
directed range. Page retains virtualized mounting policy and supplies an attachment
check because its lifetime can end before its borrowed Root. A three-sample production-demo Tab comparison
at `repeat=200` verified the moved block, model focus, collapsed caret, and actual
restoration. Chromium medians were 10.1 → 11.5 ms in restoration and 166.1 →
177 ms after two frames (ranges 161.7–192.4 and 167.2–182.3 ms); Firefox was
14 → 12 ms and 166 → 136 ms (ranges 145–213 and 125–172 ms). Normal-size
restoration medians were 0.9 → 1 ms in Chromium and 1 → 1 ms in Firefox. These
small samples do not establish a performance trend; restoration timing excludes
the rest of the command and two frames do not establish settled layout.
Root now also owns pointer text-selection hit testing and retains the exact live
anchor and moving endpoints for the gesture. Page maps owner identities to block
IDs and supplies virtualized mounting and attachment checks; the gesture no longer
carries native selection points in Page. A three-sample production-demo Shift+Alt text drag checked
native text and three-block model coverage at normal size and `repeat=200`. At the
large size, two-frame medians were 55.5 → 33.9 ms in Chromium and 9 → 10 ms in
Firefox. At normal size they were 15.2 → 15.3 ms and 15 → 16 ms respectively.
These samples are a rendering proxy, not settled layout; synchronous gesture cost
was not measured. A separate virtualized Page-window selection passed in both
browsers. Page still owns other browser selection and geometry operations.
Horizontal neighboring-content lookup and vertical visual-line caret measurement
now run inside Root. Page supplies the occurrence and mounting checks, maps owner
identities back to block IDs, and retains its navigation policy. The behavior
still distinguishes duplicate rendered owners, skips contentless owners for
vertical movement, and stops at them for horizontal movement. A serial production
demo comparison used three warm ArrowUp/ArrowDown samples per scenario in both
Page and Edgeless, at normal size and `repeat=200`. For Page at `repeat=200`,
Chromium median synchronous extension time was 39.9 → 38.8 ms and two-frame
time was 60.6 → 69.3 ms (ranges 57.3–72.2 and 60.3–70.1 ms); Firefox was
28 → 19 ms and 78 → 62 ms. Edgeless large-document synchronous extension
medians were 5.8 → 5.6 ms in Chromium and 6 → 6 ms in Firefox. The samples do
not prove settled layout; other Page hit testing and geometry remain to migrate.
Cross-document Page receiving occurrences now focus through their attachment-bound
Root region instead of retaining an element. Placement checks reject an occurrence
replaced on the same surface before it reads geometry. The Page drop registry,
hit resolution and pointer-move transport still retain browser objects.
Page drag routing now borrows the source occurrence's existing Root region.
It rejects an occurrence that is replaced, disconnected or moved to another
document, and checks again after hit testing and host callbacks before using a
result. This removes the per-move region allocation; native hit testing remains
in Page and still needs migration. Focused tests cover reentrant invalidation
and keep the number of source ownership checks bounded as mounted content grows.
Page's drag preview now captures a document-attribute capability from its Root.
Marker cleanup inspects the original document after an occurrence moves or detaches,
and preserves the marker while another preview remains or removal fails. Root now
owns the inert text overlay and its browser element; Page supplies bounded preview
text, indentation and presentation classes. Root also owns the insertion-line
element; Page supplies the line geometry and visual styling. Drag resolution also stops after a target, permission, or preview callback
cancels the gesture, preventing it from recreating feedback after teardown.
The line keeps its existing CSS class, inline thickness, orientation and viewport
geometry. It rejects inactive or reparented occurrences, and Page clears the
target marker if ownership is lost during a marker write. Pointer-down no longer
captures a native Page context; the remaining pointer-move context retains only its
hit target. The unused receiver-owned feedback and `BlockDropReceiver.update()`
were removed: the source gesture owns visible local and foreign feedback.
The Root, Page and React suites passed 222, 499 and 765 tests; workspace build and
types passed, and lint reported no errors and 563 warnings. The focused Chromium
and Firefox interaction suite passed 94 cases. Matched serial local-drag checks
used three gestures per browser and size. At `repeat=200`, synchronous medians
before/after were 5.8/6 ms in Chromium and 11/12 ms in Firefox; rendered medians
were 273.9/277 ms (ranges 270.3–279.6/273.6–280.3) and 253/263 ms
(249–263/263–280). A serial Firefox repeat measured a 247 ms rendered median
with a 238–265 ms range. These checks do not establish settled layout or isolate
cross-document routing costs.
The overlay is bound to the original Root and document, refuses stale writes and
redirected nodes, and remains removable after detachment or partial failure. It
can retry after temporary ownership loss; Page marks the document only after the
overlay is mounted and removes it if the marker cannot be set. Root's public
overlay API exposes plain text data and operations, not browser elements.
The full Root, Page and React suites passed 211, 494 and 765 tests. After moving
the Page preview policy out of the browser folder, its 56 focused tests and 13
focused overlay tests passed; build, type checks, lint and 78 focused Chromium and
Firefox drag cases passed. Lint reported 563 warnings and no errors. Matched
serial production-preview drag checks used three gestures per browser and size.
At `repeat=200`, synchronous before/after medians were 5.6/5.8 ms in Chromium
and 12/11 ms in Firefox. Reported rendered medians were 277.1/273.9 ms (ranges
268.4–280.1/270.3–279.6) and 263/253 ms (256–269/249–263). These local drag
measurements do not establish settled layout or isolate cross-document moves.
If a presentation write triggers cancellation, cleanup runs again for resources
acquired after the first cleanup. Preview and document-marker cleanup both run
even when either fails. Error cleanup is bound to the failing gesture, so a
replacement started during a callback is not canceled by the old failure.
After these changes, 194 Root, 491 Page and 765 React tests passed, as did 78
focused Chromium and Firefox drag cases; the workspace build and type checks
passed, and lint reported no errors and 563 warnings. A
matched production-preview comparison used three serial gestures per browser and
size, with the prior marker behavior restored in an isolated Page source copy.
At `repeat=200`, synchronous medians before/after were 5.3/5.5 ms in Chromium
and 13/13 ms in Firefox. Reported rendered medians were 273.2/277.9 ms (ranges
259.2–277.5/269.7–278.2) and 280/263 ms (262–281/254–269), respectively.
These measurements exercise a local drag and do not establish settled layout or
measure the cross-document marker move itself.
The Page and React suites passed 482 and 765 tests, respectively; the workspace
build, type checks and 78 focused Chromium and Firefox drag cases passed.
Serial production-preview between-block drag checks
passed in Chromium and Firefox at normal size and `repeat=200`. At `repeat=200`,
before/after synchronous times were 5.5/5.7 ms in Chromium and 12/12 ms in
Firefox; reported rendered times were 273.3/270.6 ms and 250/239 ms respectively.
Each measurement covers one gesture and does not establish performance neutrality
or isolate cross-document routing.
Drag completion now checks source connectivity and receiver document ownership
through its borrowed Root. The browser adapter no longer constructs a source
region on every foreign-target resolution or retains the mounting element itself;
its preview and feedback still need that element internally. Root and Page suites
passed 191 and 482 tests, the workspace build and types passed, and 78 focused
Chromium/Firefox drag cases passed. Matched serial normal and `repeat=200` drag
checks passed in both browsers. For the large case, synchronous before/after
times were 5.7/5.2 ms in Chromium and 12/12 ms in Firefox; rendered times were
270.6/270.3 and 239/264 ms. Two additional Firefox runs measured 252 and 263 ms
rendered. The baseline is one gesture, so the difference cannot establish a
regression or performance neutrality. These local drag checks do not isolate
foreign-target validation.
For a matched follow-up, the demo was built with an isolated Page source copy
restoring the prior source-region and connectivity checks, then with the current
code. Three serial Firefox `repeat=200` gestures passed in each build. Before and
after synchronous medians were 13 and 11 ms (ranges 11–14 and 11–15); rendered
medians were 255 and 255 ms (ranges 249–280 and 251–261). This local-drag
measurement does not isolate foreign-target validation or establish that deferred
layout has settled. The temporary source copy and configuration were removed.
Page initial-focus reconciliation now borrows a Root capability that checks the
active focus and nested occurrence boundary inside Root. It checks exact Root
identity and discards a result if focus or attachment changes during lookup.
Page's focus and normalized input listeners now attach through that same Root;
detaching it immediately invalidates captured input regions. The separate native
pointer-move transport still receives the mounted element, and other pointer and
selection browser operations have not yet migrated.
Root listener ownership checks now also reject stale delivery after reentrant
remounts and snapshot shared nested owners during inspection. Setup rollback
still attempts native cleanup, including when a borrowed Root detaches during
installation. The Root and Page suites passed 188 and 474 tests, React passed 764,
and 30 focused browser cases passed across Chromium and Firefox. The workspace
build, type checks and focused lint passed. A later focused Root test also verifies
that an unsupported provider is rejected.
Root attachment checks now reject a self or ancestor detachment performed inside
an owner callback, and stop before evaluating a child owner if its chain has
already detached. Owner checks run once in ancestor-first order; an attachment
flag walk is needed only when a callback causes a detachment. Focused tests cover
reentrant detachments, an unrelated detachment, and chains of 2 and 40 owners.
The Root, Page and React suites passed 200, 491 and 765 tests; build, types and
lint passed with 563 warnings, along with 42 Chromium/Firefox behavior cases.
Matched serial focus, slash-input and canvas-pan checks passed at normal size and
`repeat=200` in both browsers. Large Page focus rendered medians before/after were
38.9/39.3 ms in Chromium and 78/79 ms in Firefox; slash-input Page medians were
40.4/36.8 ms and 22/25 ms, and canvas-pan medians were 16.4/16.3 ms and 16/16 ms.
Large Edgeless slash input was 20.7/21.6 ms in Chromium; a serial repeat measured
20.6 ms with a 20.3–22.7 ms range. Each median uses three samples; these timings
do not establish when deferred layout settles.
Matched serial production-preview checks passed for Page focus and slash input
in Page and Edgeless, in both browsers at normal size and `repeat=200`. For large
slash-input cases, synchronous medians before/after were 11.2/11.3 ms in Chromium
Page, 6.7/7.2 ms in Chromium Edgeless, 2/2 ms in Firefox Page and 8/7 ms in
Firefox Edgeless. Two-frame medians were 32.6/33.7, 22.6/21, 22/21 and 26/29 ms
respectively. Firefox Edgeless ranges overlapped at 24–29 and 28–34 ms. Large
Page focus synchronous medians were 0.7/0.7 ms in Chromium and 2/1 ms in Firefox;
two-frame medians were 41.8/39.3 and 77/79 ms. These three-sample timings are
not proof of performance neutrality or settled asynchronous layout.
After this change, 178 Root tests, 473 Page tests, 30 focused React tests and 32
Chromium/Firefox browser cases passed, along with workspace build and type checks.
Matched serial production-preview focus checks passed at normal size and
`repeat=200` in both browsers. Large-document synchronous medians before/after
were 0.8/1.5 ms in Chromium Page, 1/2 ms in Firefox Page, 19.9/21.8 ms in
Chromium Edgeless, and 40/42 ms in Firefox Edgeless. Two-frame medians were
35.4/44.8, 79/79, 22.6/24.7 and 46/48 ms respectively. Chromium Page's
before/after ranges were 34.5–42.9 and 36–68.1 ms; a serial repeat measured
38.5–47.6 ms with a 39.2 ms median. These three-sample results do not establish
performance neutrality or measure initial attachment itself.
The Root suite passed 175 tests, React passed 764, workspace build and type checks
passed, and 78 focused Chromium and Firefox cross-document and drag cases passed.
One serial production-preview between-block drag at each size passed in each
browser. At `repeat=200`, synchronous pointer delivery before/after was 5/5 ms
in Chromium and 12/12 ms in Firefox; reported rendered time was 253.3/264.9 ms
and 264/281 ms respectively. Each is one gesture measurement, not a distribution
or an isolated measurement of the cross-document receiver's focus operation.
The extension-contract change passed the workspace build and type checks, 763
React tests, 130 core tests, and lint with 561 warnings. After a missing preview
server caused 72 connection-refused failures, the same 72 browser cases passed
serially and with 12 workers in Chromium and Firefox. Serial production-preview
slash input passed at normal size and `repeat=200` in both modes and browsers.
For the large Page case in Firefox, the two-frame median was 26 ms before and
32 ms after (ranges 26–27 and 27–34); a serial repeat measured 29 ms (25–30).
The corresponding synchronous medians were 2, 1 and 2 ms. The other large-case
before/after synchronous medians were 10.2/10.6 ms in Chromium Page, 7.8/6.3 ms
in Chromium Edgeless, and 7/7 ms in Firefox Edgeless. These three-sample runs
overlap or vary with scheduling and do not establish unchanged performance.

Before the shared pointer-dispatch change, the workspace unit and static checks
were rerun. `pnpm test` passed all six packages it covers (492 tests); the
separate Page, Edgeless and React suites passed 470, 99 and 751 tests respectively.
`pnpm check-types` and `pnpm build` passed. `pnpm lint` completed with no errors
and 563 warnings.
The subsequent production-demo browser run used 12 workers across Chromium and
Firefox: 2,904 passed, 42 were skipped, and six failed. The failures were the
Chromium large Kanban auto-scroll case and three large structural performance
cases, plus Firefox's collapsed TODO summary and large journal embedding cases.
All six exact cases passed in separate one-worker retries (four Chromium, two
Firefox). Those full-suite results predate the shared pointer-dispatch change and
do not establish the remaining ownership requirements.

The original Kanban horizontal-gap browser test failed in Chromium and Firefox
on the dispatcher baseline as well as after the root ownership change. Its
pointer is 24 CSS pixels from the scroll container's edge; during the gesture,
auto-scroll moved the target lane 34 pixels and the release hit a lane body.
In a diagnostic run, disabling horizontal scrolling after positioning the same
fixture kept the lane still and the original gesture reordered it correctly.
The unchanged test was rerun serially against the current production preview;
Chromium and Firefox both placed `source` after `second`. Its fixture now positions
the intended gap outside the auto-scroll band, preserving the same reorder and undo
assertions. Both Kanban and Columns cases pass in both browsers. A separate
Kanban browser test verifies horizontal edge scrolling and that Escape stops it
without moving the lane. Standalone Page drag and selection edge-scroll tests also
pass in both browsers. Drop retargeting during edge scroll remains to be reviewed.

The current full host browser run completed with 2,859 passed, 42 skipped, and
13 failed using 12 workers. A serial retry passed the Chromium timing and Kanban
auto-scroll cases and the Firefox embedding case. Two outdated test contracts
were then corrected: registration ordering uses normalized surface scope, and
drag release asserts the established no-navigation-after-drag behavior. Both
corrected tests pass in Chromium and Firefox. The Firefox only-child outdent
test also failed intermittently: its target was at y=320 in a 360-pixel viewport,
inside the auto-scroll band. In a failing probe, scrolling moved the parent's
bottom edge from y=322 to y=313 before release at y=320, changing the hit region.
The fixture now positions the same edge away from the band; its line and hierarchy
assertions are unchanged. Three repeated runs pass in each browser.

### Occurrence attachment and panel registration

Page attachment and React panel registration have different lifetimes.
`ReactPanel.setRoot` attaches Page to a block-editor surface even when the panel
is disabled or its document is not yet available. `setEnabled(false)` removes the
React panel registration but leaves Page attached; re-enabling registers it again
and creates a new registration-bound capability. Standalone Page views attach
their own controller. React now owns one mounted `BrowserInputRoot` per panel and
Page borrows it; each registry capability is bounded by that mounted root and its
own registration. Standalone Page creates and releases its own root.

The shared occurrence root must account for both the mounted surface lifetime and
the shorter React routing-registration lifetime. It must preserve the fact that a
capability captured by an earlier React event cannot act after its registration is
removed, including when the same element is registered again. Moving ownership
also has to retain Page's initial-focus reconciliation, its rollback on observer
failure, and the registry's replacement rollback. Do not infer that a panel being
disabled means its Page controller has been detached.

Before replacing either owner, cover attachment before document availability,
disable/re-enable on the same element, standalone Page attachment, nested
occurrences, failed setup and cleanup, and stale disposers. Verify which object
owns each attachment and which callbacks borrow its capabilities; passing two
independently created roots to the same occurrence does not meet the one-root
requirement.

React's `ReactPanel` creates the mounted root and releases it after Page and
routing cleanup. `BlockEditorController.attach` creates a root for standalone Page
or borrows the host's root; `PanelRegistry.registerPanel` creates a separately
invalidated registration capability bounded by its owner. Direct standalone
dispatcher now borrows the root even when used directly. Re-enabling routing must not
reactivate capabilities captured by an earlier registration.
When a mounted nested panel unregisters, the registry now asks its mounted Root
for focus and the nearest enclosing panel identity, then focuses the registered
parent through that parent's Root. Registrations now require a mounted Root, so
the former browser-element fallback is removed. The parent lookup rejects a
detached occurrence, and parent focus is skipped if its registration is stale.
In matched serial production-preview checks at normal size and `repeat=200`,
Page focus and Edgeless card creation passed in Chromium and Firefox. For the
large document, Page focus synchronous medians before/after were 1/0.9 ms in
Chromium (ranges 0.8–7.3/0.8–7.9) and 2/3 ms in Firefox (2–13/1–14); the
two-frame medians were 46.5/53.4 ms (43.6–49.4/40.7–56) and 97/78 ms
(34–108/31–86). Edgeless synchronous medians were 22.8/22.2 ms in Chromium
(20.8–24.5/20.8–24.1) and 45/42 ms in Firefox (39–49/39–52); two-frame
medians were 26.3/25.8 ms (24–29/23.7–27.3) and 52/49 ms (45–55/46–60).
These three-sample measurements cover focus and creation, not nested teardown.
The `panel-registration-lifecycle` test covers disable and re-enable on the same
element, including Page remaining attached and the old registration becoming stale.
The shared-input-root test also covers the mounted and registration capability
lifetimes. Existing Page attachment tests cover setup and cleanup failure; broader
coverage of loading and nested occurrences remains necessary.

1. Move Page's DOM selection, geometry, pointer capture and gesture integration
   behind browser-owned capabilities and migrate its attachment to root-owned
   normalized delivery without the temporary native-listener contract. Remove
   the private native event context; preserve nested editor and remount rules.
   Page's private drag context no longer retains the native event; it retains
   the original element target for synchronous hit testing until that geometry
   integration moves behind browser-owned capabilities. Its private browser
   context is released after each synchronous delivery, including failures.
   Pointer-down uses normalized input and its attached Root capability.
   Pointer-move still captures its
   native target for drag hit testing; unrelated Page input never receives that
   private browser context.
   Drag source feedback captures an input region instead of carrying the source
   block element through that context. Its temporary marker is restored even
   after detachment; group source markers now use root-owned region lookup and
   attribute capabilities. Drop feedback and target resolution still use Page-owned
   DOM geometry. Root now creates and moves the inert text overlay and controls
   document cursor-marker cleanup; Page retains the preview policy and borrowed
   capabilities instead of the preview element. The gesture's browser adapter
   borrows Root-owned line and text overlays without retaining the source element.
   Page's pointer-move bridge still captures the native hit; Root checks pointer capture.
   Native target routing and receiving-scope geometry still need migration.
   Root now checks whether the pointer's original element is connected and
   uncaptured; Page uses that normalized target capability before capturing its
   temporary browser hit. Page still retains the target for geometry and routing.
   Private geometry candidates now have their own type, separate from the
   public resolved target. Its hierarchy outline is now an attachment-bound
   input region rather than an element, and feedback restores its prior marker.
   Its anchor is also an attachment-bound input region; Root compares regions
   for foreign receiver containment, and feedback restores its prior marker.
   Receiving scopes now carry a bounded region rather than a root element;
   registration takes the mounted root separately, and the React occurrence's
   root, host panel and browser geometry dependencies are private. Native
   receiving resolution now runs through the internal occurrence class rather
   than a method on the scope. Hit routing passes an opaque Page-owned hit,
   while the browser implementation retains its element privately.
   The receiving registry now validates a scope directly by registration
   identity and connectivity. React's commit and focus checks no longer read
   the scope's root; browser containment compares bounded regions. The registry
   also rejects an old root when the same receiver has been registered elsewhere,
   even if its previous disposer has not yet run. The registry
   resolves an already captured hit without receiving the source element or
   performing its own hit test, and no longer exposes element-based lookup.
   Gap metadata no longer carries neighboring DOM registrations; its public
   value contains only the gap kind and axis; a between destination carries IDs.
   A production-demo root-gap gesture showed no material change in synchronous
   handling or two-frame timing in either browser. At `repeat=200`, median
   two-frame timing remained about 216 ms in Chromium and 177 ms in Firefox;
   this existing scaling cost needs profiling before any performance change.
   The remaining target path spans `BlockDragBrowser.uncapturedHit`,
   `BlockDragController`, `BlockDragRouter`, `DropSurfaceRegistry`, and the
   React `PageBlockDrag` foreign receiver. The public drag, drop-target and foreign
   resolver contracts now pass an opaque hit instead of an element. Root's
   browser implementation owns its native identity and shares it through the receiver.
   `PageBlockDrag.attach` now receives only the current Root and geometry resolver;
   the React mounting boundary checks that Root against its mounted element before
   creating the drag attachment. The boundary rejects a mismatched surface before
   registering either a receiver marker or the pointer extension.
   In six serial production-preview samples per browser and size, normal/large
   drag-move synchronous medians were 1.65/1.9 ms before and 1.25/1.9 ms after
   in Chromium, and 1/2 ms before and after in Firefox. Two-frame medians were
   16/32.6 ms before and 16/31.5 ms after in Chromium, and 16/15.5 ms before and
   15.5/15 ms after in Firefox. Each move retained drop feedback. These measurements
   include the observed event path and two frames, but do not prove settled layout.
   Move the remaining hit testing and receiving-occurrence lookup behind the
   generic Root boundary, rather than replacing the event target with coordinates
   alone. During pointer movement an uncaptured connected
   target can identify the receiving surface; captured movement, scroll, and
   release instead resolve current geometry. Keep the receiving registration
   identity through commit so a detached or replaced occurrence cannot accept
   the move or receive focus. Preserve nested-surface routing and the single
   browser hit test shared by local and foreign resolution.
   Local drop completion focuses through the
   captured occurrence capability; a gesture canceled during commit cannot focus
   a replacement source or receiver. Foreign focus is delegated to the receiving
   scope, which checks its exact registry identity and browser connectivity; its
   browser implementation still owns the receiver element for geometry and focus.
   Collapse selection repair now clears browser selection and focuses through the
   captured panel Root. A synchronous panel replacement invalidates that capability
   before it can alter the replacement selection or focus the previous element.
   In the production demo, three-sample median collapse/selection timings at
   `repeat=200` were 15.1 ms synchronous and 93.9 ms through two frames before,
   versus 14.4 ms and 90.4 ms after in Chromium; Firefox was 13 ms and 48 ms
   before, versus 13 ms and 45 ms after. This includes the existing large-document
   rendering cost and does not establish when all deferred layout settles.
   Block-handle Delete and Cut now use the captured panel Root for focus and
   recheck it after selection publication and deletion. Cut also retains the
   registration across the asynchronous clipboard write. A replacement stops
   later deletion or caret work instead of targeting a replacement panel.
   Edgeless selection-clear and tool-reset shortcuts now read the live transform
   marker through their captured Root, rechecking its registration after the read
   instead of obtaining the panel's HTML element.
   The guard still depends on a presentation attribute; replace that dependency
   when transform preparation has an equally early semantic lifecycle state.
   `transform-keyboard-lifecycle.test.ts` exercises an actual resize preparation:
   the keyboard guard is already closed inside the synchronous focus callback,
   remains closed during the gesture, and opens again after cancellation. A
   replacement must preserve that ordering, including callbacks invoked by focus,
   rather than relying only on the later canvas transform snapshot.
   Both Root and region attribute reads recheck ownership after the browser read,
   discarding a value if that read synchronously replaces the attachment.
   Region ancestor reads also discard the value when its target no longer has
   the same matching ancestor inside the region. Standalone canvas transform
   admission consumes this capability and cannot start from the stale ID.
   In three production-demo samples at `repeat=200`, menu Delete's synchronous
   median was 16 ms before and 15.5 ms after in Chromium, and 30 ms before and
   33 ms after in Firefox. Two-frame medians were 73.7 and 70.3 ms in Chromium,
   and 54 and 55 ms in Firefox. The large-document Firefox cost predates this
   change and needs profiling before any performance fix is selected.
   Page resolves block identity and content/selection-anchor scopes through
   normalized root-bounded target queries instead of walking native targets.
   Its event value also derives exact root targeting from normalized input; only
   the separate synchronous browser adapter receives native event identities.
2. Complete React's event transport migration. `EditorEvent` and
   `KeyboardEditorEvent` no longer expose native event or element fields, but
   the event manager, panel routing and browser factory still use native input.
   Preserve clipboard data, input text/composition, selection and Moveable drag
   start through synchronous capabilities and private browser code.
   See [the React event migration audit](./react-root-event-migration-audit.md)
   for current consumers and multi-panel listener constraints.
3. Replace the currently exported `NativeEventListeners` browser contract with
   root-owned browser attachment and normalized delivery. Mounting may accept an
   element; registration callbacks and event payloads must not expose elements or
   native events. Preserve host multi-panel routing and passive listener groups.
   The unused public `captureMouseEvent` export has been removed; its browser
   implementation remains internal for Root's auto-scroll tests. The pointer
   capture helper was also removed after its test consumers switched to normalized
   listener delivery; the detached-gesture test detaches a real listener.
   Clipboard data capture is internal to Root as well; its external test now
   exercises normalized copy and paste delivery.
   Clipboard target capture is also internal; React's target tests now exercise
   normalized delivery with real element ancestry and document focus.
   Clipboard input captures its delivery target without retaining the native
   event, while target ancestry and document focus remain live for routing.
   Keyboard target capture is internal too. Its React tests obtain live target
   queries through normalized input, including cross-realm and ancestry cases.
   A keyboard input now retains its delivery's target rather than the native
   event; live queries still observe changes to that target's properties and ancestry.
   Root `BrowserEvents` now snapshots registrations across listener groups for
   each native dispatch, including synchronous redispatch of the same event object.
   Capture boundaries provide opaque dispatch identities without exposing the
   event to handlers. Page now uses the shared normalized listener for input other
   than pointer move, preserving its cross-group claims and observers.
   Pointer move still uses the native bridge for Page drag context; both
   transports borrow the same mounted occurrence root and must be cleaned up.
   Pointer-down no longer needs the browser context: drag activation borrows Root
   capabilities for the insertion line, preview text and document marker. Removing
   the remaining pointer-move context still requires migrating hit resolution;
   do not replace it with a second element-bearing facade.
   The dependency starts at `BlockDragController.start`: `BlockDragBrowser`
   creates preview and drop feedback attached to the source occurrence, and borrows pointer targets for
   synchronous routing. `BlockDragPreview` borrows Root's text overlay and document
   marker. Further migration must retain preview/marker cleanup after partial setup,
   preserve the source attachment identity on remount, and let the hit travel
   through the router, target resolver and foreign surface registry without a
   second hit test. Page should continue to choose the drag presentation and
   marker policy; Root should provide only the generic browser capabilities needed
   to realize them. `block-drag-preview-occurrences.test.ts` now verifies that
   one occurrence cannot clear the document marker while another preview remains,
   and that a failed preview removal leaves the marker in place.
   A Page regression now checks that redispatching one pointer event after
   replacing a capture registration with a bubble registration uses the current
   handler. Preserve this when the pointer-move bridge is removed.
   Root's normalized listener attachment now accepts an optional passive mode,
   defaulting to non-passive; passive and non-passive groups can retain a common
   dispatch identity. `BrowserEvents` preserves separate group claims and the
   shared registration snapshot across passive modes. React's multi-panel
   transport still needs to consume these capabilities.
4. Complete typed built-in event maps and ensure custom event maps can be used by
   the actual editor APIs, not only the generic dispatcher. Review remaining
   Edgeless browser tool/normalizer contracts for native event exposure.
   Normalized pointer input now owns root pointer capture and supplies an
   identity-aware release capability. Edgeless pan, marquee and tool capture
   layers use it; other native-pointer consumers still need migration. The React
   panel event factory also supplies normalized `lostpointercapture` input,
   matching Root's built-in event map. The Root-owned multi-panel transport
   receives native browser events internally, but no longer passes them to its
   consumer callback.
   Root keyboard input now includes the live keyboard target queries used by
   React, and the React event factory captures those queries through the same
   normalized input. Non-browser providers may omit the target capability. The
   underlying multi-panel listener keeps native browser events inside Root.
   Root's temporary multi-panel listener now captures all supported browser input
   after React selects the receiving occurrence. The panel factory consumes that
   normalized value for keyboard, pointer, mouse, clipboard and text data rather
   than importing individual native capture helpers. React's event manager no
   longer receives the native event even as an unused callback argument. The
   normalizer accepts the selected attachment-bound Root rather than an element
   and separate attachment callback. Root keeps the element lookup private and
   discards input if the registration becomes stale during normalization. The
   listener now supplies an opaque surface identity for routing rather than the
   element. The panel registry returns its existing borrowed registration to the
   event factory; the factory reads surface mode through that registration's Root
   and no longer receives an element. Listener reconciliation now receives the
   registered Roots and resolves their mounting elements only inside the Root
   browser adapter. It rejects detached or unsupported Roots before changing
   connections, and retains the native listener when a registration is replaced
   on the same surface. Panel mounting still uses an element at its browser
   attachment boundary.
   Retained surface, document and window listeners now also check that their
   target has an attached Root before delivery. Roots are indexed by native
   target, so a document event does not scan unrelated documents; the composed
   path keeps a separate surface index for nested dispatch identity. Both indexes
   are restored if listener reconciliation fails. A moved surface no longer
   authorizes delivery from its old document before reconciliation. Focused tests
   cover stale roots, shared documents, cross-document moves, reentrant disconnect,
   and bounded lookup with 2 and 40 documents.
   A matched serial production-preview run passed twelve slash-input and
   Edgeless pan cases in Chromium and Firefox at normal size and `repeat=200`.
   Large-document slash two-frame medians before/after were 30.1/35.9 ms in
   Chromium Page, 21.7/19.9 ms in Chromium Edgeless, 19/28 ms in Firefox Page,
   and 24/27 ms in Firefox Edgeless. Firefox Page ranges overlapped (19–27 and
   20–31 ms); a focused rerun had a 21 ms median and an 18–24 ms range. Pan
   rendered medians were 16.1/16.1 ms in Chromium and 15/15 ms in Firefox.
   Each median uses three samples; the Firefox variation does not establish a cause.
   A matched serial production-preview run passed twelve slash-input and
   Edgeless pan cases in Chromium and Firefox at normal size and `repeat=200`.
   Large-document slash two-frame medians before/after were 35.7/36.7 ms in
   Chromium Page, 22.3/22.2 ms in Chromium Edgeless, 26/21 ms in Firefox Page,
   and 24/24 ms in Firefox Edgeless. Pan rendered medians were 16.2/16.3 ms in
   Chromium and 16/17 ms in Firefox. Each median uses three samples.
   A further matched serial run passed twelve slash-input and Edgeless pan cases
   in Chromium and Firefox at normal size and `repeat=200`. Large-document slash
   two-frame medians before/after were 36.1/34.8 ms in Chromium Page, 22.3/22.1
   ms in Chromium Edgeless, 20/28 ms in Firefox Page, and 25/25 ms in Firefox
   Edgeless. Firefox Page ranges overlapped (19–26 and 19–28 ms). Pan rendered
   medians were 16.3/16.2 ms in Chromium and 16/16 ms in Firefox. Each median
   uses three samples.
   A matched serial production-preview run passed twelve slash-input and
   Edgeless pan cases in Chromium and Firefox at normal size and `repeat=200`.
   Large-document slash two-frame medians before/after were 29.9/30 ms in
   Chromium Page, 22.5/22.6 ms in Chromium Edgeless, 26/20 ms in Firefox Page,
   and 23/25 ms in Firefox Edgeless. Pan rendered medians were 16.2/16.3 ms in
   Chromium and 17/17 ms in Firefox. Each median uses three samples.
   A matched production-preview run passed twelve serial slash-input and
   Edgeless pan cases in Chromium and Firefox at normal size and `repeat=200`.
   Large-document slash two-frame medians before/after were 35.8/33.4 ms in
   Chromium Page, 21.5/21.5 ms in Chromium Edgeless, 25/24 ms in Firefox Page,
   and 26/24 ms in Firefox Edgeless. Pan rendered medians remained near one
   frame (16.2/16.3 ms in Chromium and 16/16 ms in Firefox). Each is based on
   three samples and does not establish fully settled layout.
   Focus transitions now provide a browser-free query for whether the live related
   target is inside the captured target ancestor. React uses it for block focus-out
   policy without retaining the native focus event or block element.
   The transition target is captured per delivery, so redispatching one focus event
   cannot redirect an earlier input's ancestor query; its related target remains
   live as required by existing focus-transition behavior.
   Before-input delivery also captures a Root-owned text reader for the original
   content host. List shortcut policy reads its live text without constructing a
   browser-element closure in the React event factory.
   Text input captures the event target at delivery, so redispatching a native
   event cannot make an earlier normalized input read a different host; the
   text-reader capability no longer retains the native event.
   React captures root, block and content scope from normalized target queries.
   Root distinguishes element targets from text nodes so the existing React scope
   behavior remains unchanged. Root now captures completed-input content hosts and
   finds rendered hosts through the occurrence capability. React supplies selectors
   and reads generic ancestor attributes; its event manager and event factory no
   longer receive the native event or a surface element during event delivery.
   Root's browser listener receives native events internally, while panel
   registration now uses the mounted Root at the attachment boundary.
   Event capture and selection lookup produce comparable identities for the same
   content host; replacing the host produces a different identity.
   Reparenting the same host preserves its identity, but the old occurrence's
   block lookup must stop resolving it. Its captured text reader still reads the
   original host, so deferred consumers cannot use host identity alone as an
   attachment check. `content-host-reparenting.test.ts` records this behavior.
   React supplies block selectors and keeps block ownership policy. Root captures
   text, caret, geometry and decoration operations without an exported element-taking
   helper. Deferred consumers still check the originating registration before using
   captured host operations. A text input cannot capture a new host after its
   listener attachment is detached or remounted; occurrence lookup rechecks its
   own registration after browser queries. Root tests cover stale lookup, host
   replacement and reparenting, nested panel exclusion, bounded ancestor reads,
   and redispatched input identity. Lookup also rejects an owner moved into a
   nested panel during its attribute read. A host captured with an occurrence
   boundary selector rejects ownership reads after it moves to a nested panel,
   including a move during the attribute read. TODO and slash input recheck
   ownership before deferred use; text and identity reads remain live, so
   consumers must still use the registration and ownership checks.
   The focused production-demo checks passed 96 Chromium and Firefox cases; all
   16 serial TODO-prompt and slash-input measurements passed at normal size and
   `repeat=200` in Page and Edgeless. The earlier matched TODO-prompt run and the
   current run had comparable medians; the earlier slash run is historical rather
   than an immediate baseline.
   Pending contentless restoration now captures its exact panel registration and
   asks Root to focus and clear browser selection. It checks connectivity and
   registration identity before focus and again before clearing, including when
   focus synchronously replaces the occurrence. Text and contentless restoration
   both reject a stale captured registration. Tests cover the resulting focus,
   selection clearing, replacement before the microtask and replacement during
   focus. A matched serial separator-creation benchmark passed eight production
   preview cases in Chromium and Firefox at normal size and `repeat=200`; it
   exercises the surrounding command and continuation focus, not the contentless
   pending-restoration branch directly. In Firefox Edgeless at `repeat=200`, the
   two-frame median was 60 ms before and 77 ms after; a focused serial rerun was
   61 ms (range 59–78 ms), so the difference remains noisy rather than proven.
   Pending text-caret restoration now captures the actually focused host through
   the originating Root instead of passing an element to an exported helper.
   Capture rejects nested occurrences and stale registrations; restoration also
   checks live focus, attachment and occurrence ownership. The renderer still
   performs its existing focus operation, and content synchronization still uses
   an element-taking selection helper, so this is not the end of the DOM migration.
   A matched serial production-preview block-split run passed eight Chromium and
   Firefox cases at normal size and `repeat=200`. At `repeat=200`, before/after
   synchronous medians were 37/35 ms in Chromium Page, 87.5/88.1 ms in Chromium
   Edgeless, 11/11 ms in Firefox Page, and 237/233 ms in Firefox Edgeless; the
   corresponding two-frame medians were 117/111.4, 91.4/91.6, 72/75, and 268/266
   ms. Each value is the median of three samples, not a settled-layout guarantee.
   After the nested-occurrence guard, a fresh before/after production-preview run
   passed all 16 serial TODO and slash cases in Chromium and Firefox at both sizes.
   For `repeat=200`, TODO input synchronous medians before/after were 2.3/2.3 ms
   in Chromium Page, 3.8/3.9 ms in Chromium Edgeless, 2/1 ms in Firefox Page,
   and 6/6 ms in Firefox Edgeless. Slash two-frame medians were 35.6/35.6,
   23.5/23.1, 19/20, and 24/29 ms respectively; the Firefox Edgeless sample
   ranges overlapped (23–36 and 23–35 ms). These are three-sample measurements,
   not guarantees about fully settled asynchronous layout.
   Ordinary panel routing now compares the closest marked ancestor with opaque
   Root capabilities, including foreign and nested panels. Selection-change
   routing now receives the browser selection anchor as a normalized target too.
   Public active/default panel lookups now return their attachment-bound Roots
   rather than HTML elements. Selection compares the exact registration and
   retains the mounted-but-unregistered and synchronous-removal distinctions:
   a remembered active panel cannot hand ownership to the default during cleanup.
   The surface-type helper now reads an attachment-bound Root and rejects stale
   registrations; its no-argument lookup retains the mounted Root during panel
   teardown. Panel registration receives the mounted Root and indexes registrations
   by opaque surface identity. The registry no longer stores HTML elements for
   routing or parent-focus restoration. The panel still accepts an element at its
   browser mounting boundary, and consumer interfaces still need ownership review.
   Matched serial production-preview slash-input runs passed in Page and Edgeless
   in Chromium and Firefox, at normal size and `repeat=200`. Large-document
   synchronous medians before/after were 15.8/10.2 ms in Chromium Page
   (ranges 12.8–16.7/10–14), 6.1/7.8 ms in Chromium Edgeless (6–9.5/6.5–8.6),
   2/2 ms in Firefox Page (1–2/1–2), and 7/7 ms in Firefox Edgeless (6–12/6–8).
   Two-frame medians were 43.5/32.3 ms (39.3–50.8/30.3–36.7), 21.8/22.3 ms
   (20.9–23.7/22.2–24.8), 21/26 ms (20–36/26–27), and 25/25 ms (24–31/22–28),
   respectively. These are three-sample measurements, not a guarantee of settled
   layout or proof of unchanged performance in every routing workload.
   Surface-mode fallback also checks attachment after identity and mode reads, so
   reentrant replacement cannot make a stale Root report its successor's mode.
   A separate serial production-preview comparison of that guard passed Page
   structural paste in Chromium and Firefox at both sizes. At `repeat=200`,
   synchronous medians before/after were 23.1/26.5 ms (ranges 20.6–26.6 and
   21–27.1) in Chromium and 12/11 ms (12–12 and 11–12) in Firefox. Two-frame
   medians were 99.9/99.8 ms (96.5–102.4 and 99–103.6) and 63/61 ms (62–66
   and 61–64), respectively. These are three-sample Page measurements; the
   ordinary marked surface does not exercise the unrecognized-marker fallback.
   A serial structural-paste comparison passed in Chromium and Firefox at normal
   size and `repeat=200`. Large-document synchronous medians before/after were
   19.8/23.1 ms in Chromium and 13/12 ms in Firefox; two-frame medians were
   89.1/99.9 ms and 82/63 ms respectively. These three-sample Page measurements
   do not establish performance neutrality or cover Edgeless performance.
   A matched serial horizontal-caret run passed eight production-preview cases
   in Chromium and Firefox at normal size and `repeat=200`. For the large Page
   case, Chromium synchronous medians were 16.8 ms before and 20.4 ms after;
   two-frame medians were 39.5 and 45.3 ms. A serial repeat was higher again
   (24.7 ms synchronous, 57.7 ms over two frames), so performance neutrality is
   not established. A Chromium CPU sample was dominated by minified production
   functions; direct instrumentation recorded ten active-Root lookups per move
   below the timer's resolution in total. On the same warm page, eight interleaved
   samples using the ordinary lookup and a diagnostic cached lookup had overlapping
   ranges, so that probe did not establish the lookup as the cause. This command
   needs further profiling if the observed increase persists under a controlled load.
   Root now owns the document-level pointer owner and continuation snapshot;
   React routing receives input names, opaque identities and narrow capabilities.
   A focused Root probe previously showed that dispatching the same `pointermove`
   event during two successive gestures returned the first gesture's owner in the
   second gesture. Root now starts the internally event-keyed snapshot once per
   native dispatch through shared, reference-counted capture boundaries. Window
   boundaries cover connected delivery; tree and occurrence boundaries cover
   disconnected and late-attached roots. The snapshot also retains an absent
   owner, so a new gesture cannot alter later listeners in the same delivery.
   `pointer-owner-redispatch.test.ts` compares opaque identities by reference and
   covers redispatch, nested occurrences, replacement during capture, and moved
   roots. `nested-pointer-ownership.test.ts` covers separate listener owners.
   The production-demo browser regression covers the reused event across two
   Page occurrences in Chromium and Firefox.
   The shared boundary has its own cleanup regression, including a failed native
   removal: the stale listener is disabled even when the browser retains it.
   After this change, focused Chromium and Firefox browser coverage passed 36
   cases. Serial production-demo structural-drag checks passed at normal size
   and `repeat=200`; two-frame medians were 15.4/22.4 ms in Chromium and 15/7 ms
   in Firefox. The earlier comparison run measured 15.6/22.9 ms and 15/13 ms
   respectively; these samples do not establish deferred-layout completion.
   Serial Edgeless pointer-pan checks also passed at normal size and `repeat=200`:
   median rendered times were 16.3/16.3 ms in Chromium and 17/16 ms in Firefox.
   No matching pre-change pointer-pan measurement was captured for this slice.
   A nested-delivery test also covers a new gesture starting between two window
   listeners for an earlier pointer-up. Both earlier listeners must see the old
   owner, and a subsequent delivery must see the new owner. Clearing every cached
   snapshot on pointer-down would break that requirement.
   Each claim has its own gesture identity, so an old pointer-up cannot clear a
   newer gesture, including one started on the same occurrence. An existing
   delivery keeps its owner through synchronous registration replacement.
   Root's multi-panel listener now gives React an opaque identity per dispatch,
   shared across window, document and surface groups. The previously failing
   `event-redispatch.test.ts` now passes, including a separate regression for
   changed groups and non-cancelable handled events. An unused event type now
   releases its identity boundaries immediately when no dispatch is active. If
   its last registration is removed during dispatch, those boundaries remain
   until the next listener reconciliation or detachment so later phases keep the
   same identity; that remaining lifetime needs review in the full Root transport.
   Browser-default status and cancellation now come from Root's synchronous
   delivery capability; React's event manager no longer retains native events for
   that purpose. The browser listener receives native events internally; its
   panel attachment boundary still needs migration. Completed-input
   content capture now belongs to Root.
   A registry index maps opaque element identities to current panel roots. These
   identities compare DOM surfaces but do not prove attachment; routing checks the
   selected registration separately. The routing cost regression bounds ancestor
   queries for both 2 and 40 panels, including the previously linear lookup.
   The earlier nearest-ancestor/root comparison remains available for its existing
   Root test; production routing now uses the identity index. Review that temporary
   API during final compatibility and test cleanup.
   The shared tool hook registers viewport input instead of exposing React pointer handlers.
   Connector reconnection uses attachment-bound coordinate conversion; a gesture
   retains its original interaction and cannot commit using a replacement canvas
   or an invented origin when that attachment is unavailable.
   Toolbar preset release now performs attachment-bound viewport hit testing
   through a browser-free capability, including host control exclusions. The
   placement hook receives copied pointer data, capture and preview capabilities;
   its React event adapter and browser preview host remain private. Its captured
   gesture retains a release capability instead of the toolbar button; another
   pointer cannot replace an active gesture. Active movement, release and
   cancellation use temporary Root window observations; toolbar pointer-down
   uses Root observation and an attachment-bound target capture capability.
   Pointer-click suppression also uses Root input; keyboard clicks remain eligible
   for the shared toolbar's ordinary activation.
   Page no longer exports its `BlockAutoScroll` alias or `BlockScrollPoint` type;
   gesture consumers use the Root pointer capability to create scroll sessions.
   Root's browser entry no longer exports the auto-scroll implementation; its
   direct behavior tests now live beside the owning Root browser code. Its
   browser session also no longer accepts native element hints. It implements
   the existing normalized `PointerAutoScroll` contract directly; Page and
   selection callers already used that contract.
   A dedicated preset controller now owns gesture state and cleanup, while the
   React hook only supplies current attachment, subscriptions and presentation.
   Toolbar registrations no longer expose React pointer bindings or preset event
   callbacks; their only existing customization is retained as button class metadata.
   The shared Edgeless toolbar also no longer offers `getButtonProps` native
   pointer bindings. Its renderer reads the existing class from registration
   metadata and retains activation internally; preset interactions use Root.
   Custom toolbar buttons now receive semantic activation, tool identity and
   menu state instead of native React event handlers. The built-in buttons adapt
   those values to browser attributes and events at the presentation boundary.
   `CanvasViewProps` no longer inherits native HTML event props for the viewport
   or world layer; presentation markers and the mounting ref remain available.
   Bento resize cancellation borrows normalized window key and blur registrations
   from the separator's Root listener for the active gesture. The gesture owns their cleanup and restores
   its preview and pointer capture if listener attachment fails. Listener, marker,
   style and capture cleanup are attempted independently when one fails. The
   mounted separators now use Root pointer and keyboard input, including normalized
   lost-pointer-capture delivery, rather than forwarding React native events. Bento
   capture and release now use Root's attachment and capture identity checks. The
   controller borrows feedback without retaining the separator element. Each
   separator currently attaches a non-owning Root listener to its handle; fold these
   listeners into the shared occurrence routing when that transport supports the
   same capture and cleanup semantics.
   The expanded board mounts its own panel. Its separator stops arrow-key
   propagation before the panel's keyboard handlers, and pointer capture belongs
   to the separator rather than the panel root. Shared routing must preserve both
   behaviors, route an active gesture to the originating panel, and avoid adding
   one event-dispatch registration per rendered tile. The focused browser checks
   in `e2e/__tests__/bento-keyboard-resize.spec.ts` cover keyboard resizing and
   propagation in expanded Page and Edgeless panels.
5. Re-run the full API/ownership review and the applicable browser and performance
   checks after the final behavior change. Green tests for the completed slices do
   not validate the unfinished public API migration.

The superseded listener-lifetime review remains historical context in
[native-listener-lifetime-review.md](./native-listener-lifetime-review.md).
Intentional API changes are recorded in
[rivto-root-breaking-changes.md](./rivto-root-breaking-changes.md).

## Browser behavior baseline

The current production demo was exercised in Chromium and Firefox with 12
workers, excluding files named `*performance.spec.ts` so dedicated timing runs
remain serial. The run finished with 2,512 passed, 7 skipped and 3 failed:

- Chromium: Kanban auto-scroll in block mode with `repeat=200` timed out waiting
  for the horizontal scroll position to return to its start.
- Firefox: the default journal embedding with `repeat=200` timed out waiting for
  its Page surface to become visible.
- Firefox: cross-editor journal caret navigation timed out waiting for the
  previous day's editor content to appear.

Each failed case passed when rerun alone with one worker. These retries do not
prove the reason for the parallel failures. Dedicated performance files and the
remaining Root migration acceptance review are still outstanding.

The marquee rectangle now belongs to Root, and Edgeless consumes a narrow
rectangle and region contract without importing Root into its headless entry.
The panel supplies its exact occurrence; stale capture or overlay ownership
cannot publish selection. Chromium and Firefox passed 20 selected interaction
checks. Three serial two-frame marquee samples gave normal/large medians of
16.5/16.2 ms before and 16.4/16.1 ms after in Chromium, and 12/18 ms before
and 14/19 ms after in Firefox. These samples do not establish a speedup or
settled layout timing.

Eraser target feedback now uses occurrence-owned regions and temporary attributes.
It excludes nested editor occurrences and restores prior markers on remount or
cleanup. The existing drawing scenario checks feedback before deletion in Chromium
and Firefox; a new serial test checks the same behavior with normal and large
documents. Three two-frame samples per size gave Chromium medians of 16.4/16.3 ms
before and 16.4/16.5 ms after, and Firefox medians of 17/16 ms before and 16/16 ms
after. This measures a rendering proxy, not settled layout or synchronous command
duration, and does not establish a speedup.

Context-menu input is normalized by Root and routed through panel events, so the
edgeless tool no longer owns native context-menu and secondary-pointer listeners.
The handler keeps default cancellation and releases both registrations, including
rollback when the second registration fails. Root and panel tests cover input
normalization and cleanup; browser tests cover tool reset and editor controls.
Three serial two-frame samples for secondary input gave Chromium normal/large
medians of 23.9/23.1 ms before and 24/22.8 ms after, and Firefox medians of
31/30 ms before and 30/30 ms after. This is a rendering proxy, not a measurement
of synchronous command duration or settled layout, and does not establish a speedup.

Visual tool state markers now belong to the exact attached Root and restore any
prior values on cleanup. Replacement, detachment during setup, and rollback are
covered by focused tests. Chromium and Firefox passed the drawing and secondary
input scenarios. Three serial secondary-input two-frame samples gave normal/large
medians of 24/22.8 ms before and 24.3/23.5 ms after in Chromium, and 30/30 ms
before and 31/30 ms after in Firefox. This proxy does not measure synchronous
command duration or settled layout, and does not establish a speedup.

Property preview commits now observe normalized capture-phase pointer presses
through the occurrence Root. Window observation ends after detachment or document
movement and remains removable; the property panel no longer passes a native
reference for outside-click detection. Chromium and Firefox passed the existing
property scenarios. Three normal/large synchronous element-update medians were
1.1/2.9 ms before and 1.2/2.5 ms after in Chromium, and 1/5 ms before and 1/5 ms
after in Firefox. Corresponding two-frame medians were 30.2/28.9 ms before and
30.3/27.7 ms after in Chromium, and 31/31 ms before and 30/29 ms after in Firefox.
These samples do not establish a speedup or settled layout timing.

Visual-label point-to-caret placement now belongs to a captured Root region. It
rejects stale occurrences, and an unavailable or synchronously replaced Root
retains the requested point until a current occurrence can accept it. Chromium
and Firefox passed the existing shape, connector, and text-label scenarios.
Three serial two-frame samples for normal/large labels had Chromium medians of
10.6/18.2 ms before and 11.1/18 ms after, and Firefox medians of 29/29 ms before
and 30/31 ms after. The measured browser selection call was at most 0.1 ms; these
samples do not measure the full focus operation or establish a speedup.

The grid spotlight now borrows occurrence-bound bounds observation, frame timing,
and overlay styles. Root owns the resize and scroll listeners, and stale frames
cannot paint a replacement occurrence. Chromium and Firefox passed 22 selected
grid, nested-pointer, wheel, and pan cases. Three serial normal/large pointer
samples had Chromium two-frame medians of 16.3/16.1 ms before and 16.2/15.9 ms
after, and Firefox medians of 16/16 ms before and 16/16 ms after. Synchronous
pointer-dispatch medians were 0.3/0.3 ms before and 0.2/0.3 ms after in Chromium,
and 1/1 ms before and after in Firefox. These samples do not establish a speedup or settled layout timing.

The edgeless surface controller now binds pan admission and marker ownership to
the exact Root. Old occurrence callbacks cannot alter a replacement, and marker
cleanup restores prior values. Both browsers passed 12 selected pan, spotlight,
and tool-cancellation cases. Three serial normal/large pointer-pan samples had
Chromium two-frame medians of 16.4/16.1 ms before and 16.3/16.4 ms after, and
Firefox medians of 16/15 ms before and 17/17 ms after. Synchronous dispatch
medians were at most 0.1 ms in Chromium and below Firefox's 1 ms clock resolution.
These samples do not establish a speedup or settled layout timing.

Nested editable drag selection now lives in Root, including hit testing, focus,
window pointer tracking, and cleanup on occurrence replacement. The React hook
still adapts a local React pointer callback and retains its existing attributes;
that presentation boundary remains for the broader native API audit. A fenced
code CSS selector was corrected after the unchanged baseline showed zero-height
code in Firefox Edgeless. The new serial Page/Edgeless selection tests passed in
both browsers at normal and large sizes after that fix, before and after the Root
migration. Chromium Page synchronous medians were 0.3/10.2 ms before and
0.5/9.5 ms after; Edgeless medians were 0.4/0.6 ms before and 0.6/0.6 ms after.
Firefox Page synchronous medians were 1/0 ms before and 0/1 ms after; Edgeless
medians were 1/2 ms before and after. Large Firefox Page two-frame samples were
14–57 ms before and 18–60 ms after, so these runs do not establish a speedup or
settled layout timing. The CSS-corrected build is the baseline for this comparison.

The visual-label public props no longer inherit native HTML events or arbitrary
HTML attributes; its only workspace consumer uses the remaining named props.
Internal browser input and text manipulation still need the remaining audit.
Ten selected label editing, newline, clipboard, and caret cases passed across
Chromium and Firefox. Three serial normal/large caret two-frame medians were
11.1/18 ms before and 10.9/17.7 ms after in Chromium, and 30/31 ms before and
31/29 ms after in Firefox. The browser selection call remained below the measured
clock resolution; these samples do not establish a speedup.

Panel input names now come from Root's normalized input map instead of browser
DOM event maps. The existing touch-start consumer is represented without exposing
a native event; custom event registration remains separate. Root and focused
React event/transform suites passed, and the Chromium touch-transform scenario
passed (the existing Firefox case is skipped because its fixture uses CDP).
This change affects declarations and event-name typing only, so interaction
timing was not applicable.

React keyboard contracts are consolidated in their owning types.ts file, with
registration, inventory, override, and callback contracts documented. Focused
keyboard and keymap tests and the React package build passed. This is a type and
documentation relocation with no runtime change, so interaction timing was not
applicable.

TODO storage menus now borrow normalized window input from the current Root.
Outside presses use capture so another menu can open in the same gesture; Escape
uses bubble so a keyboard sort can consume it first. Availability is subscribed
only while open, and replacement releases the old observations. The Root window
observer now accepts the input name and propagation phase; property previews keep
their existing capture behavior. Root, React, and focused Page tests, workspace
types, and eight Chromium/Firefox behavior cases passed. Eight serial performance
cases also passed before and after at normal size and `repeat=200`; Edgeless uses
the same inserted storage fixture at each size because the default storage is
virtualized outside the viewport in large documents. Three-sample synchronous
medians before/after were 1/0.8 and 2.1/2.3 ms in Chromium Page, 0.8/0.9 and
0.8/0.8 ms in Chromium Edgeless, 2/1 and 4/3 ms in Firefox Page, and 1/2 and
2/2 ms in Firefox Edgeless. Two-frame medians remained within 1.1 ms in these
samples; they do not establish a speedup or settled layout.

Clipboard menu actions now write through the invoking occurrence's Root. The
browser implementation uses that document's window for asynchronous writes and
its document for the copy-command fallback, releasing the fallback listener even
on failure. Root tests cover iframe ownership, formats, cleanup, denial, and
detachment; React tests retain the delayed-cut replacement check. The existing
clipboard integration tests now mount a Root and live in `__tests__`. Full Root
and React suites, focused Page tests, workspace types, and Chromium/Firefox copy
embedding and cut-with-undo behavior passed. Four serial normal/large copy-menu
measurements with a deterministic clipboard writer passed before and after. Of
three measured samples, Chromium synchronous medians were 0.4/0.4 ms and
0.6/0.7 ms before/after; Firefox medians were 1/1 ms and 2/1 ms. These measure
menu input to clipboard invocation, not permission prompts or rendering, and do
not establish a performance improvement.

Clipboard HTML converters now receive detached element and text data rather than
native DOM elements. Root owns detached HTML parsing and clipboard-envelope
attribute lookup; React retains converter order, list interpretation, and Page
versus Edgeless policy. The Root parser is a browser utility because programmatic
clipboard conversion also runs without a mounted occurrence. Built-in shape and
demo Counter converters use the new attributes, and the clipboard converter guide
describes the contract. Focused tests cover browser-independent tree data, nested
lists, ignored content, empty converter results, and Page output restrictions.
The Root and React suites, workspace type check, and eight selected Chromium and
Firefox behavior cases passed. Eight serial HTML-paste cases passed before and
after at normal size and `repeat=200`. Three-sample synchronous medians were
2/2.5 and 11/11.2 ms in Chromium Page, 3/2.6 and 79.6/77.7 ms in Chromium
Edgeless, 3/4 and 14/14 ms in Firefox Page, and 5/5 and 236/237 ms in Firefox
Edgeless. Large Firefox Page two-frame samples overlapped despite a median change
from 66 to 77 ms; the runs do not establish a regression or improvement. The
large Edgeless timings are an existing scaling cost, not a claim about parsing
alone. These samples verify the pasted custom block and do not prove settled layout.

Moveable's control markers, accessibility attributes, and native keyboard
listener now live together in the Edgeless browser adapter. The React effect
borrows the current library controller and releases the adapter on replacement;
the host marker callback still runs after canvas markers are installed. All 107
Edgeless tests, workspace types, and four selected Chromium/Firefox keyboard
behavior cases passed. Four serial normal/large keyboard-resize cases passed
before and after. Three-sample synchronous medians were 12.4/12.2 and 19.5/20.9
ms in Chromium, and 12/11 and 19/16 ms in Firefox. Two-frame medians were
28.1/28.2 and 25.3/25.5 ms in Chromium, and 24/24 and 37/34 ms in Firefox.
These samples verify committed resizing and do not establish a speedup.

Page's attachment no longer retains the native root element for virtualization.
It captures the root region from the already borrowed occurrence and rolls back
if that occurrence ends during capture. All 541 Page tests, workspace types,
and six Chromium/Firefox Page and Edgeless selection/focus cases passed. Four
serial Page-focus cases passed before and after at normal and large sizes.
Three-sample synchronous medians were 0.3/0.3 and 0.7/0.7 ms in Chromium, and
1/1 and 2/2 ms in Firefox. Two-frame medians were 30/28.9 and 38.1/35.1 ms in
Chromium, and 30/30 and 79/72 ms in Firefox. Focus timing does not measure the
entire mounting operation and these runs do not establish a speedup. Page's
subsequent Root-only attachment change is recorded separately below.

`BlockEditorController.attach` now borrows a `PageInputRoot`; it no longer
receives an HTML element, creates a Root, or detaches its host's Root. The React
panel supplies the occurrence it owns, and standalone `BlockEditorScope` creates
and releases a Root at its mount boundary. Setup failure rolls back the created
Root, and cleanup offers both Page and Root resources even if one fails. Page
attachment fixtures now create test-owned Roots; three edited test files moved
into `__tests__`. All 541 Page and 821 React tests, workspace types, and ten
Chromium/Firefox lifecycle, nested-editor, Edgeless, and focus cases passed.
Four serial Page-focus cases passed before and after at normal and large sizes.
Three-sample synchronous medians were 0.3/0.5 and 0.7/0.9 ms in Chromium, and
1/0 and 2/1 ms in Firefox; two-frame medians were 28.9/29.7 and 35.1/39.4 ms in
Chromium, and 30/28 and 72/78 ms in Firefox. These samples cover focus after
mount, not the complete attachment cost, and do not establish a speedup.

Row hover now observes normalized Page input instead of attaching its own native
listeners. Its opaque occurrence identity keeps nested and replacement checks
local. The new `including-nested` input scope lets the hover observer clear an
outer row on entry to a nested editor; ordinary root registrations remain local.
The full 542-test Page suite, workspace types, and 20 selected Chromium/Firefox
hover and nested-editor cases passed. Eight serial normal/large Page and Edgeless
hover cases also passed before and after. Three-sample synchronous medians were
0.2/0.3 and 0.4/0.3 ms in Chromium Page, 0.3/0.2 and 0.3/0.3 ms in Chromium
Edgeless, 1/0 and 1/1 ms in Firefox Page, and 0/1 and 1/1 ms in Firefox
Edgeless. Two-frame measurements varied across samples; they do not establish a
speedup or settled layout.

Markdown link callbacks now expose the block ID, sanitized URL, and synchronous
default-cancellation capability without exposing a React event. The demo and
guides use the new contract. The 821-test React suite, workspace types, and six
Chromium/Firefox ordinary and custom-link cases passed. Eight serial Page/Edgeless
link cases passed before and after at normal and large sizes. Three-sample
synchronous medians were 0.3/0.1 and 0.3/0.3 ms in Chromium Page, 0.3/0.2 and
0.2/0.2 ms in Chromium Edgeless, 1/0 and 1/1 ms in Firefox Page, and 1/1 and
0/0 ms in Firefox Edgeless. All custom activations remained canceled and delegated;
the samples do not establish a speedup or settled layout.

Page navigation now retains a borrowed Root instead of a native surface. Root
owns scroll anchoring suspension and scrolling to a block within the appropriate
panel boundary; the controller keeps only its navigation registration and
overlap count. Replacement during marker reads or suspension setup cannot publish
or restore an old occurrence over a newer one. Root and React suites, workspace
types, and four Chromium/Firefox offscreen-navigation and virtual scroll-position
cases passed. Twelve serial caret and virtualized-card navigation cases passed
before and after at normal and large sizes. Horizontal-caret three-sample
synchronous medians before/after were 1.4/1.4 and 21.2/22 ms in Chromium Page,
1.7/1.7 and 3/2.9 ms in Chromium Edgeless, 2/1 and 7/8 ms in Firefox Page, and
2/2 and 3/4 ms in Firefox Edgeless. Virtualized-card cases had one sample per
size, with synchronous values 8.2/7.7 and 15/17.2 ms in Chromium, and 6/6 and
11/10 ms in Firefox. These measurements do not establish a speedup or settled
layout.

The React panel no longer retains a native surface element. Its lifecycle owner
keeps an opaque identity through synchronous cleanup and owns the mounted Root;
focus restoration, inert state, and mount attributes use Root capabilities. This
preserves same-element reentry without keeping duplicate element and Root fields.
The 321-test Root suite, 824-test React suite, workspace types, and eight
Chromium/Firefox lifecycle, tab, embedded-editor, and focus-switch cases passed.
Twelve serial normal/large nested-selection and Page-focus cases passed before
and after. Three-sample synchronous medians for nested selection were 0.4/0.5 and
9.4/9.7 ms in Chromium Page, 0.5/0.6 and 0.7/0.7 ms in Chromium Edgeless, 0/0
and 1/1 ms in Firefox Page, and 0/1 and 1/2 ms in Firefox Edgeless. Page focus
medians were 0.3/0.2 and 0.8/0.8 ms in Chromium, and 0/1 and 1/3 ms in Firefox;
the large Firefox samples include first-focus outliers. These measurements do not
establish a speedup or settled layout.

Table column resizing now uses normalized pointer and keyboard input and borrows
Root regions and temporary inline-style sessions instead of retaining native
elements. The active gesture owns its cancellation and availability subscriptions;
idle cells do not subscribe. Root's attribute lookup limits results to the current
panel occurrence. The 324-test Root suite, 827-test React suite, workspace types,
and ten Chromium/Firefox resize and table-reordering cases passed. Eight serial
resize cases passed before and after in Page and Edgeless at normal size and
`repeat=200`. Three-sample synchronous medians were 0.2/0.2 and 0.2/0.1 ms in
Chromium Page, 0.3/0.2 and 0.4/0.3 ms in Chromium Edgeless, 0/0 and 0/1 ms in
Firefox Page, and 1/1 and 0/1 ms in Firefox Edgeless. The two-frame start timing
was one sample per case; these measurements do not establish a speedup or measure
the complete table mount.

Bento resizing now captures its tile and sibling lane as regions belonging to the
current panel occurrence. The gesture holds temporary style and marker sessions
and cancels when the panel Root is replaced; the controller no longer retains an
HTML element. Root exposes the untransformed layout width used to freeze sibling
slots. The 325-test Root suite, 830-test React suite, workspace types, and ten
Chromium/Firefox resize, keyboard, Escape, and lost-capture cases passed. The
initial parallel browser run and its serial rerun exposed an incorrect assumption
about the handle's wrapper; the corrected fixture and subsequent browser run pass.
Four serial resize and cancellation cases passed before and after at normal size
and `repeat=200`. Three-sample synchronous resize medians before/after were
0.2/0.2 and 0.2/0.2 ms in Chromium, and 0/0 and 0/1 ms in Firefox. Cancellation
medians were 0/0.1 and 0/0.1 ms in Chromium, and 0/0 and 1/0 ms in Firefox.
These measurements do not establish a speedup and do not measure pointer-down
setup or the cost of a Bento with many sibling tiles.

`BlockEditorScope` now borrows an occurrence Root rather than accepting a native
element or owning attachment. The standalone `BlockEditor` creates and releases a
Root when no host attachment exists; panel-backed views retain the panel's Root.
Scope contracts exclude attachment, and matching uses occurrence identity because
the event-routing registration is a separate borrowed capability. The full
545-test Page and 831-test React suites, workspace types, and 46 Chromium/Firefox
hover and handle cases passed. An initial serial hover run exposed the incorrect
assumption that those two capabilities had the same object identity; a focused
regression test and the corrected browser runs cover that distinction. Eight
serial hover cases passed before and after at normal size and `repeat=200`.
Three-sample synchronous medians before/after were 0.2/0.3 and 0.3/0.3 ms in
Chromium Page, 0.3/0.3 and 0.3/0.3 ms in Chromium Edgeless, 0/1 and 1/0 ms in
Firefox Page, and 1/1 and 1/1 ms in Firefox Edgeless. The samples do not measure
complete mounting or establish a speedup.

Edgeless transform controls now observe panel availability directly instead of
reading the native-root context merely to trigger a render. A regression test
changes the registration on a still-mounted surface and verifies controls update
on disable and re-enable; the test fails with the earlier implementation.
The React suite, workspace types, and twelve Chromium/Firefox transform and
keyboard-resize cases passed. Four serial normal/large keyboard-resize cases
passed before and after. Three-sample synchronous medians before/after were
14.4/13.1 and 22.2/22.1 ms in Chromium, and 12/11 and 16/16 ms in Firefox.
The measurements verify resize behavior and do not establish a speedup.

Bullet-threading anchors now receive a block's region capabilities and return an
opaque region identity rather than browser elements. The current routed Root
resolves the anchor and rejects regions outside the block or occurrence. Root's
size observation owns browser resize listeners without exposing their elements;
thread traversal and observation now live in the extension's `browser/` directory.
Tests cover foreign anchors, detachment during a resolver callback, size-observer
cleanup, and unavailable browser support. The 328-test Root and 833-test React
suites, workspace types, and eight Chromium/Firefox threading scenarios passed.
Four serial focus cases passed before and after at normal size and `repeat=200`.
Three-sample synchronous focus medians before/after were 1.1/1.1 and 10.6/10.5 ms
in Chromium, and 1/1 and 3/3 ms in Firefox. Two-frame medians were 25.4/27.4 and
60.6/60.7 ms in Chromium, and 19/19 and 32/32 ms in Firefox. The timing test checks
that a thread remains present; it does not establish settled layout or a speedup.
Threading now also borrows structure, focus, scroll, resize, and frame
notifications from Root. `InputRegion.observeStructure` reports subtree child
changes, and normalized window input includes `resize`; both stop delivery after
detachment. The 330-test Root and 833-test React suites, workspace types, and
eight Chromium/Firefox threading cases passed. Four serial focus cases passed
before and after at normal size and `repeat=200`. Three-sample synchronous medians
were 1.1/1.6 and 10.5/11.4 ms in Chromium, and 1/1 and 3/3 ms in Firefox; two-frame
medians were 27.4/25.4 and 60.7/61.3 ms in Chromium, and 19/20 and 32/29 ms in
Firefox. These samples do not establish a speedup or settled layout.

Thread path construction now receives focused and ancestor regions instead of
browser elements. Root captures focus without entering nested occurrences and
visits top-level matching regions in document order, stopping when the caller has
enough information. The initial implementation constructed and walked a region
for every rendered block: its large-document two-frame medians rose from 61.3 to
83 ms in Chromium and 29 to 61 ms in Firefox. The bounded Root visit restored the
final medians to 60.6 and 30 ms respectively. Normal-size two-frame medians were
25.4/25.9 ms in Chromium and 20/21 ms in Firefox; three-sample synchronous focus
medians were 1.6/1.1 and 11.4/11.3 ms in Chromium, and 1/2 and 3/4 ms in Firefox.
The final 337-test Root and 833-test React suites, workspace types, eight browser
threading cases, and four serial focus cases passed. Focus changes during anchor
resolution invalidate the captured ancestry before it can update the path. These
measurements do not establish a speedup or settled layout.

Root now owns the body-hosted SVG path overlay, including creation, measurement,
updates, and cleanup after detachment. The threading extension no longer retains
native surface or SVG references; it borrows only occurrence, region, frame, and
overlay capabilities. Tests cover failed setup, detachment, and replacement on
the same element. The 340-test Root and 835-test React suites, workspace types,
eight Chromium/Firefox threading cases, and four serial focus cases passed.
Three-sample synchronous focus medians before/after were 1.1/1 and 11.3/11.2 ms
in Chromium, and 2/2 and 4/4 ms in Firefox. Two-frame medians were 25.9/26 and
60.6/60.3 ms in Chromium, and 21/21 and 30/32 ms in Firefox. These samples do not
measure complete overlay mounting or establish a speedup or settled layout.

Canvas event attachment now borrows a browser-backed Root instead of receiving an
HTML element. A panel-backed CanvasView waits for and shares the panel's mounted
Root; a standalone viewport creates and releases its own. Input delivery and
coordinate operations become inactive when that Root detaches. A later occurrence
can use the same element before stale cleanup runs, and the old cleanup cannot
withdraw its event or viewport ownership. The 343-test Root, 112-test Edgeless,
and 835-test React suites, workspace types, and ten Chromium/Firefox pan and camera
cases passed. Four serial normal/large pan cases passed before and after.
Three-sample synchronous medians were 0.1/0.1 and 0.1/0 ms in Chromium and 0/0
for both Firefox sizes. Two-frame medians were 16.2/16.1 and 16.1/16.3 ms in
Chromium, and 16/17 and 16/16 ms in Firefox. These samples do not measure the full
viewport mount or establish a speedup.

Canvas input now borrows the viewport Root for frame scheduling and attachment
checks. Pointer and wheel frames accepted before detachment no longer publish
camera changes afterward; the controller releases its clock and scheduled frames
without detaching the host Root. Its overlay, focus lookup, and viewport geometry
still use browser objects and remain to be migrated. The Root is passed from the
viewport attachment to the controller; standalone views use their viewport-owned
Root. Direct controller setup rejects a Root belonging to another viewport.
The full Edgeless (115 tests) and React (835 tests) suites and workspace type
checks passed. Ten Chromium/Firefox behavior checks passed at normal and
large sizes. In serial production-preview pointer-pan samples, synchronous
before/after medians were 0.1/0 ms and 0/0.1 ms in Chromium and 0/0 ms at both
Firefox sizes. Two-frame medians were 16.1/16.4 ms and 16.3/16.2 ms in Chromium,
and 17/16 ms and 16/17 ms in Firefox. These three-sample timings cover pointer
panning, not wheel easing or settled layout, and do not establish a speedup.

Canvas focus lookup and focus requests now use the borrowed Root. Without a
boundary selector, Root focus lookup preserves the canvas's earlier nested-content
behavior; focus requests retain no-scroll by default, and canvas marquee focus
explicitly permits the scrolling its native call previously allowed. The Root
(345 tests), Edgeless (117 tests), and React (835 tests) suites, workspace types,
and 134 Chromium/Firefox Edgeless behavior cases passed. In three serial
production-preview create-and-focus samples, normal/large synchronous medians
before and after were 8.1/7.9 and 22.4/19.7 ms in Chromium, and 13/13 and 39/40
ms in Firefox. Two-frame medians were 18.4/24.9 and 30/22.6 ms in Chromium, and
26/28 and 45/45 ms in Firefox. These samples do not establish settled layout or
a performance improvement; standalone canvas marquee focus is covered by the
unit test, not that demo scenario. The controller still has native marquee and
geometry access to migrate.

Canvas input now reads viewport bounds, computed line height, and client size
through its borrowed Root region. This retains line/page wheel units and rejects
zoom geometry if the occurrence detaches during measurement. The Root (347 tests),
Edgeless (118 tests), and React (835 tests) suites, workspace types, and 28
Chromium/Firefox wheel and camera behavior cases passed. In three serial
production-preview pixel-wheel samples, normal/large synchronous medians before
and after were 1.7/1.9 and 1.7/1.6 ms in Chromium, and 2/2 and 3/2 ms in Firefox.
Two-frame medians were 16.9/16.8 and 16.8/16.8 ms in Chromium, and 32/32 and
31/30 ms in Firefox. These samples do not time line/page-mode input or establish
settled layout. Canvas input still creates and updates its marquee DOM directly.

Canvas input now receives only the scene, normalized event registrar, and borrowed
Root. Root creates its selection rectangle inside the viewport, preserving local
coordinates, clipping, visual style, hiding, and cleanup. The controller no longer
retains an HTML element or manipulates marquee DOM. The event registrar must belong
to the same occurrence as the Root; the viewport attachment enforces its own Root
identity. Root (349 tests), Edgeless (119 tests), React (835 tests), workspace
types, two standalone marquee browser cases, six standalone focus/virtualization
cases, and two main-editor marquee cases passed. A serial comparison used the
independent demo's 10,000-element fixture and a temporary production build
reconstructing the immediately preceding native marquee implementation. For three
samples before/after, synchronous medians were 6.3/6.5 ms in Chromium and 8/9 ms
in Firefox; two-frame medians were 16.7/16.6 and 16/17 ms respectively. The
current source and production build were restored after the baseline build. The
sample does not establish settled layout or a speedup.

Page keyboard events now format shortcuts with the primary modifier captured by
the same keyboard runtime that matches them. They no longer read the browser
platform independently during each event. A regression reproduced the old
mismatch when the platform changed after runtime creation; it now passes. Page
(546 tests), React (835 tests), workspace types, and ten Chromium/Firefox keyboard
and caret cases passed. Three-sample serial caret-extension synchronous medians
before/after at normal/large size were 2.6/3.2 and 39.5/38.5 ms for Chromium Page,
2.4/2.5 and 5.4/5.6 ms for Chromium Edgeless, 2/3 and 27/20 ms for Firefox Page,
and 3/2 and 6/7 ms for Firefox Edgeless. Two-frame medians varied from 21 to
75 ms across these cases; these samples do not establish a speedup or settled
layout.

Virtualized Page selection now asks Root for an occurrence-owned descendant by
exact attribute value instead of constructing a CSS selector in Page. Root uses a
targeted query, excludes nested occurrences, and discards a match that moves during
the ownership check. Root (351 tests), Page (547 tests), React (835 tests),
workspace types, and the Chromium/Firefox virtualized pointer auto-scroll cases
passed. A production benchmark focused the real demo editor, enabled Page
virtualization, and measured three batches of 100 missing-endpoint checks at
normal and `repeat=200` sizes. Before/after Chromium medians were 0.7/0.7 and
0.6/0.6 ms per batch; Firefox medians were 1/1 and 0/1 ms at its 1 ms clock
resolution. The preceding implementation was reconstructed in a temporary build;
the current source and build were restored afterward. Separate real pointer-drag
measurements remained in the same range but did not exercise the missing-endpoint
branch. These isolated checks do not establish settled layout or a speedup.

The unused internal PanelDOM and its barrel export were removed; their panel
boundary and direct-child row tests now exercise Root regions instead. The public
`useEditorRoot` hook returns only the mounting ref. Page drag and Edgeless
selection use an opaque surface identity, and visual chrome obtains its native
portal host inside an internal React rendering boundary. Tests cover public hook
shape, portal removal and replacement, and stale selection and drag attachments.
The React suite (837 tests), workspace types, and 72 Chromium/Firefox Page drag,
marquee, and toolbar cases passed. Three serial normal/large samples before and
after retained the expected gestures. Chromium Page drag two-frame medians were
15.6/15.4 and 25.9/30.1 ms, with overlapping large-sample ranges; Firefox was
15/15 and 12/9 ms. Marquee two-frame medians were 16.4/16.4 and 16/16 ms in
Chromium, and 16/18 and 19/19 ms in Firefox. These samples do not establish
settled layout or a performance improvement.

Deferred block caret restoration now captures the editable's opaque identity at
mount and asks Root to focus that owned region. Root rejects disconnected,
foreign, and nested-occurrence regions and rechecks ownership after focus; the
hook also verifies that the same host is focused before restoring the caret. A
regression confirmed that the preceding implementation focused a foreign editable
once, while the new implementation does not. Another test covers focus moving to
a different host during the request. The Root (354 tests), Page (547 tests), and
React (840 tests) suites, workspace types, and 78 Chromium/Firefox undo and
selection cases passed. Three-sample normal/large undo synchronous medians were
1.1/1.2 and 7.9/7.2 ms in Chromium Page, 1.6/1.8 and 6.3/5.5 ms in Chromium
Edgeless, 1/1 and 7/7 ms in Firefox Page, and 2/1 and 10/9 ms in Firefox Edgeless.
Chromium large Page two-frame medians were 34.9/44.5 ms with overlapping ranges;
two additional after runs had medians of 36.4 and 36.8 ms. The undo interaction
does not isolate deferred renderer mounting and these samples do not establish
settled layout or a speedup.

Page wrapper input now uses `BlockItem.bindInput` and normalized Root region
subscriptions. Region registrations follow Page attachment, preserve capture and
bubble order, and release their browser listeners when the item unmounts. The
demo retains nearest-wrapper marking and restores temporary attributes. Public
`BlockItemProps` no longer includes React native event callbacks; other Page
presentation components and their public refs still require a separate boundary
review. The binding, listener installation, rollback, reentrant attachment, and
nested event behavior have focused tests under `__tests__`.

An isolated standalone Page demo compared the prior React wrapper listener with
Root region subscriptions using three post-warmup samples per browser and size.
For 1,200 wrappers, mount medians were 662/673 ms in Chromium and 966/962 ms in
Firefox (before/after). These measurements include DOM construction and do not
isolate listener cost. Pointer frame timings were variable, and the samples do
not establish a performance improvement. The baseline uses the current Root
package with its new, unused region API, while its Page wrapper uses the previous
React event path.
The complete Root, Page, React, and Edgeless suites passed (370, 559, 849, and
119 tests), as did workspace tests, types, build, and lint (with warnings). The
standalone wrapper behavior passed in both browsers, and 148 main-demo Page,
Edgeless, and event-registration browser cases passed with 12 workers. The
normal/large Page pointer-selection performance checks also passed serially in
both browsers; frame timings varied and do not establish a speedup.

The `BlockEditor` root's public props now exclude native React event callbacks.
Its existing normalized event registry provides capture and bubble observation
across detach and remount, while the mounting ref and presentation attributes
remain. This is a type boundary change; its render path and listener setup are
unchanged. Other presentation primitives and their refs remain to be audited.
`DragHandle` likewise retains its existing normalized open and menu actions while
its public button attributes exclude React event callbacks. At that stage its concrete button ref still reached the host menu; the later
handle binding and focus migration below replaces it. Those initial prop changes
altered declarations only, so interaction timing did not apply to that step.

`BlockRow` and `BlockChildren` now use the existing normalized mounted-region
binding as well. Their public prop types retain styles and accessibility attributes
but exclude React native callbacks; `bindInput` installs a region observer and
returns cleanup. The shared private ref composition retains drop-layout and
forwarded-ref ownership, and nested region tests check capture/bubble order and
remount cleanup. Other presentation primitives and native refs still need review.

For the row/children binding change, serial production-preview mount measurements
used the same standalone demo and three samples after warmup. Normal/1,200-wrapper
mount medians before and after were 3.8/4.3 and 672.5/642.7 ms in Chromium, and
9/8 and 962/992 ms in Firefox. Page pointer selection also passed serially at
normal size and repeat=200 in both browsers; its two-frame results overlapped the
previous samples. Mount timing includes DOM construction and frame timing is not
proof of settled layout or a performance improvement.
The complete Page and React suites passed (564 and 849 tests), along with
workspace types, the Page build and lint. The main demo passed 150 Page, drag,
and Edgeless browser cases across Chromium and Firefox with 12 workers; the
standalone wrapper cases also passed in both browsers. The ownership review traced
region identity through the committed ref, borrowed `observeRegion`, Root
attachment, and cleanup; the callback receives no attachment or destruction
capability. The still-public presentation refs are outside this change.
The newly exposed row/children bindings were also exercised in a dedicated
production-built demo fixture in Chromium and Firefox. It checks the actual
capture/bubble order and delivery after remount. The broader browser cases cover
existing production layouts without an installed binding.
After adding the browser fixture as a separate demo build entry, a final serial
mount run measured normal/1,200-wrapper medians of 4.3/648.9 ms in Chromium and
9/951 ms in Firefox. Firefox's large samples ranged from 943 to 1,175 ms. The
additional entry changes the demo bundle split; fixture loading is outside the
mount timing, but the builds are not byte-identical.

The block handle no longer exposes its button ref. Its mount-scoped
`bindHandle` supplies an opaque identity and a disposer, preserving a way for
hosts to bind a drag sensor or other Root-backed input. The React block menu
captures that identity and the current panel Root before resolving menu targets;
on close it restores focus only if the panel still owns that Root. Root rejects
removed, foreign, nested-occurrence, and detached handles. The menu requests
`preventScroll: false`, preserving its former browser focus behavior; other Root
focus calls still prevent scrolling by default. Focus option getters are read
only while attached, and ownership is checked again before focusing.

The Root, Page, and React suites passed 373, 566, and 851 tests; 42 Chromium and
Firefox Page/Edgeless menu and drag behavior cases passed. Unit tests cover handle
binding replacement/unmount, detached and replaced focus owners, scroll options,
and reentrant detachment. The initial React focus test used the package's Node
environment and failed because it lacked `document`; selecting jsdom fixed the
fixture without changing its assertions.

Serial production-preview measurements included three post-warmup samples per
browser and size. With 60/3,060 Page handles, startup medians before and after
the mount binding were 143/128 and 3,376/3,402 ms in Chromium, and 310/297 and
7,177/7,232 ms in Firefox; ranges overlap. The mount baseline was taken after the
initial ref removal but before the mount binding, and startup includes the whole
demo rather than just handle registration. Menu focus was measured separately in
Page and Edgeless at both sizes against the original ref-based implementation.
A first normal Edgeless run was slightly slower; two additional serial runs in
each browser overlapped the baseline. These samples do not establish a speedup
or settled layout.
Workspace build, types, and lint also passed after this change; lint reported
warnings, including the now 74-line `BlockHandle` component. The ownership
review traced the committed handle binding, captured panel Root, menu callback,
replacement check, and Root focus operation; neither the menu nor its caller owns
Root attachment or destruction. Other presentation refs and browser-facing
contracts remain in scope for the full migration.

Explicit `BlockSlot` inputs now use the shared normalized region binding; the
unbound automatic-slot path adds no listeners or separate binding hooks. An
empty non-start slot installs no binding, and contribution removal releases it.
The slot and owner declarations live in the existing `types.ts`. The public
`BlockView` ref still participates in Radix `asChild` drop-target composition;
its replacement must preserve that host composition and the standalone shell
contract rather than simply removing the ref.

The Page suite passed 568 tests. Chromium and Firefox passed 70 main-demo Page,
container and collapse cases plus 34 standalone Page layout cases, including the
new nested slot binding and its remount. Serial production-preview startup samples
for normal/3,060-handle Page documents had before/after medians of 141/144 and
3,420/3,481 ms in Chromium, and 318/303 and 7,249/7,271 ms in Firefox; the ranges
overlap. This includes full demo startup and cannot isolate slot cost. Page pointer
selection also passed at both sizes in both browsers with similar synchronous
samples. Timing does not establish a speedup or settled layout.
The React suite also passed 851 tests, and Page lint passed with warnings. The
ownership review followed the slot's committed region ref, its narrow
`observeRegion` dependency, listener cleanup, and Root detach/reattach. The
slot owns its binding disposer; the editor retains registration and lifecycle
ownership. No native element is passed to the slot binding.

`BlockView` now exposes a nominal `RegionIdentity` ref and normalized input
binding while preserving standalone rendering. The private mount adapter
translates the shell element to its identity and retains callback-ref cleanup.
Page's shell registry and its `BlockDropTarget asChild` registration receive the
same identity. The drop-target browser adapter also accepts ordinary DOM child
refs, including elements from another or removed window. Tests cover native-ref
rejection, shell and drop registration cleanup, callback-ref replacement, and
nested shell input across remount. Browser fixtures exercised the composed shell
and cross-window conversion in Chromium and Firefox; 212 main-demo Page,
container, and Edgeless behavior cases passed.

Inside-drop production-preview samples were compared at normal size and
repeat=200, with three samples per browser and size. Synchronous medians before
and after were 1.2/1.5 and 6.8/6.9 ms in Chromium, and 1/2 and 16/15 ms in
Firefox. Two additional normal-size runs per browser were taken to investigate
the small difference; their ranges overlapped the original measurements. The
rendered medians were 31/31 and 294/280 ms in Chromium, and 30/31 and 275/279 ms
in Firefox. These are noisy end-to-end samples, not proof of a speedup or settled
layout.

For startup, the large fixture must contain 3,060 handles. One initial after
sample contained only 3,055, exposing that the existing measurement waited for
only 200. The benchmark now waits for the full fixture; the incomplete sample
was excluded and the after run repeated. Normal/large startup medians were
141/148 and 3,420/3,536 ms in Chromium, and 318/311 and 7,249/7,223 ms in
Firefox; ranges overlap. Baseline samples all recorded the full 60/3,060
handles. Startup includes the entire demo and cannot isolate shell identity
cost.

The Root, Page, and React suites passed 373, 579, and 851 tests. Workspace lint
passed with warnings. The ownership review followed browser identity creation,
the shell's ref adapter, its layout registration, Radix ref composition, and
the drop-target registration through unmount. The shell and target borrow only
their registration capabilities; the editor and mounted Root keep lifecycle
ownership. `RegionIdentity` identifies an element independently of attachment,
so consumers must still borrow the current Root for operations. Other Page
primitives still expose native refs and remain in the migration scope.
Final workspace build and type checks passed, including the Page demo type check.
Lint passed with warnings. The remaining migration still includes native refs on
other Page primitives and the broader host, selection, and canvas boundaries.

The subsequent layout-ref migration replaces the native refs on `BlockRow`,
`BlockChildren`, `BlockItem`, and `BlockDropWrapper` with `RegionIdentity`.
Their browser adapters own DOM capture and cleanup; the editor owns the region
registry and consumers borrow their Root for operations. Drop layouts and drop
targets still compose with both Page primitives and ordinary DOM children.
Bento uses its placement ref only to detect mounting, while its resize operations
continue through Root. Other host, selection, and canvas boundaries remain to be
reviewed against the complete migration plan.

The Page and React suites passed 590 and 851 tests, and Chromium and Firefox passed 10 standalone
Page cases and 180 main-demo interaction cases. Serial production-preview
Bento resize, drop, and full 60/3,060-handle mount measurements passed in both
browsers. For normal/large Bento drops, synchronous before/after medians in
milliseconds were 1.6/1.6 and 7/7.7 in Chromium, and 2/2 and 15/15 in Firefox.
For normal/large startup, medians were 148/135 and 3,536/3,548 in Chromium,
and 311/304 and 7,223/7,313 in Firefox. These three-sample end-to-end results
are noisy and do not establish a speedup or isolate this ref change.

The ownership review followed the mounted browser ref through registry
registration, normalized input setup, caller ref delivery, replacement, and
teardown. Reentrant replacement releases stale cleanup, and a failed ref
delivery rolls back registration. The registry and event capabilities remain
borrowed; the editor and Root retain their lifecycle ownership. Passing tests
does not establish that the remaining migration boundaries are complete.
The workspace build and type checks passed; lint passed with 603 warnings.

Edgeless viewport pan and spotlight setup now compare opaque surface identities
instead of carrying a native element through the setup hooks. The viewport and
overlay ref callbacks remain browser mounting boundaries. The panel still creates
and destroys the Root; the two effects borrow that occurrence and release their
own resources when it changes. A new test verifies both disposers on replacement
and unmount. At that point the internal surface context still contained a native
element for portal hosts and mounting; the following change separates that host.

The React suite passed 852 tests and its type check passed. Chromium and Firefox
passed 134 Edgeless interaction cases. For normal/large spotlight pointer input,
three-sample two-frame medians before/after were 16.3/15.9 and 16.1/15.9 ms in
Chromium and 16/16 and 15/15 ms in Firefox; synchronous medians were at most
0.3 ms in Chromium and 1 ms in Firefox. These samples do not prove a speedup or
settled layout.

The React surface context now provides an opaque identity to editor consumers.
Only the private React portal host context retains the native surface for creating
portals. The provider derives both from the same mounted element; portal adapters
reject a host whose identity does not match the current surface. The panel owns
Root attachment and destruction, while the portal host borrows the mounting
element and does not own a Root. Surface, document-body, and Page-end portals
retain their existing React ownership and nested-slot behavior.

In Chromium and Firefox, 279 of 284 parallel browser cases passed and four were
skipped. One large Firefox embedding timed out waiting for the page surface; the
same case passed with one worker. Serial slash-input checks passed in both modes
and document sizes. Large Page synchronous before/after medians were 12.6/15.1 ms
in Chromium (ranges 9.7–15.7/10.1–15.5) and 2/1 ms in Firefox; large Edgeless
medians were 7.8/6.2 and 7/7 ms. Three samples per case are insufficient to claim
a performance improvement or explain the Chromium variation.
The React suite passed 852 tests, workspace types passed, and workspace lint
passed with 605 warnings. The broader Root migration remains incomplete.

The Page virtualization registry now matches a registered view to its mounted
Root using their shared opaque surface identity. The browser mounting adapter no
longer constructs a second region solely for that comparison. The controller
still validates the Root's captured region before binding; the registry owns the
lookup and releases it before observation cleanup. Replacement registrations,
failed setup, detached Roots, foreign surfaces, and reentrant cleanup remain
covered. At that stage identity was typed as `object` in the shared Root contract,
so an obsolete region argument was not rejected at compile time; the affected
Page and React fixtures were updated and their existing assertions retained.

The Page suite passed 591 tests. Chromium and Firefox passed 28 standalone Page
virtualization cases and 140 main-demo virtualization and Edgeless cases. Serial
three-sample caret extension at normal/large size had synchronous before/after
medians of 2.7/3.4 and 41.2/39.2 ms in Chromium, and 2/4 and 22/22 ms in
Firefox. Large two-frame medians were 67.1/69.6 ms in Chromium and 61/62 ms in
Firefox, with overlapping ranges. The virtualized missing-endpoint lookup also
passed for both sizes and browsers, with 100 checks taking approximately 0.5–1 ms
per sample. These measurements do not establish a speedup or settled layout.
The React suite passed 852 tests, workspace type checks passed, and lint passed
with 605 warnings. The remaining Root migration and its full acceptance audit
are still outstanding.

Root and region identity queries now return the existing nominal `RegionIdentity`
type, and virtualization accepts only that type. The identity constructor is a
runtime export so non-browser implementations can create their own stable tokens.
An identity remains independent of attachment lifetime. Compile-time checks reject
native elements and region capabilities where a virtualization identity is needed.
The Root and Page suites passed 373 and 592 tests, and 25 focused React tests
passed. This change alters types and exports; it does not alter editor interaction
logic, so the previous production-preview timings remain the runtime evidence.
The workspace build and type checks passed, and lint passed with 605 warnings.
The built Root package was also checked to export distinct identity tokens.

Root region capture, region focus, and editable-text capture now accept
`RegionIdentity`. Page's retained region listeners, layout and drop registrations,
and React's focus and spotlight callers carry the same identity through those
operations. The drop-ref browser adapter converts an actual DOM element or accepts
a `RegionIdentity`; other ref values are rejected. The attachment still owns the
Root, and each listener, drop registration, and captured region retains its existing
cleanup and ownership checks. Dispatch and gesture identities remain separate.

The Root, Page, and React suites passed 374, 593, and 852 tests. Chromium and
Firefox passed 38 standalone Page cases and 880 main-demo cases. Serial Bento drop
samples at normal/large size had synchronous before/after medians of 1.5/1.3 and
6.7/7.4 ms in Chromium, and 2/2 and 14/15 ms in Firefox. The first large Chromium
sample ranges did not overlap; a further three-sample run measured 6.8–7.6 ms,
median 6.8 ms. These noisy samples do not establish a speedup or settled layout.
The workspace build and type checks passed; lint passed with 605 warnings.
The remaining migration and its full acceptance audit are still outstanding.

Page focus observation now borrows the occurrence Root's normalized `observeInput`
capability instead of constructing a browser listener owner. The focus observer
retains only its two subscription disposers; the controller owns the attachment
and Root lifetime. Setup rolls back an installed listener if the next one fails,
and teardown attempts both cleanups. Delivery checks the exact attachment, so a
late callback from a replaced Root cannot notify its successor. A non-browser
Root test covers delivery, replacement, setup detachment, and cleanup failures.

The Page suite passed 597 tests, and Chromium and Firefox passed 182 panel,
cross-document, and Edgeless behavior cases. Three-sample normal/large Page focus
synchronous medians before/after were 0.2/0.5 and 0.8/0.8 ms in Chromium, and
1/1 and 2/2 ms in Firefox. The ranges overlap; rendered samples include long
frames and do not establish settled layout or a performance improvement. The
general Page input dispatcher still owns a separate browser listener transport;
its migration remains outstanding.
The React suite passed 852 tests, workspace build and types passed, and lint
passed with 605 warnings. The full Root migration and acceptance audit remain open.

The Page input dispatcher now acquires one caller-owned `InputObserver` from its
attached Root. Its listener groups share dispatch identities, preserving the
existing snapshot, priority, claim, capture/bubble, and redispatch behavior. Page
retains logical registrations across remounts and releases the exact observer
and its groups on detachment; the Root owns browser listener construction. The
observer attempts every cleanup, and a replacement during registration cannot be
removed by the stale registration's cleanup. Root-targeted observations include
nested input and Page continues to apply its existing scope rules. Custom Roots
must implement the observer contract; unrelated browser adapters remain in scope.

The Root and Page suites passed 376 and 598 tests, with additional focused Root
coverage after the final type-only contract change. The React suite passed 852
tests. Chromium and Firefox passed 68 standalone Page and 222 main-demo cases.
For large Page slash input, synchronous Chromium medians were 13.2 ms before and
16.6 ms after; two repeat runs measured 14.4 and 13 ms with overlapping ranges.
For large Bento drops, synchronous medians were 7/7.3 ms in Chromium and 14/16 ms
in Firefox; Firefox's normal-size 2/3 ms result returned to 2 ms in a repeat run.
These three-sample measurements are noisy and do not establish a speedup or
settled layout. Workspace build and types passed; lint passed with 605 warnings.
The broader Root migration and full acceptance audit remain outstanding.

Bento resize now retains the tile and lane regions returned by its owning Root
instead of creating a second pair of browser regions. Their borrower lifetime
still checks the exact handle, tile parent, and panel Root; style cleanup remains
owned by the resize gesture. At that stage the native handle listener remained
in the Bento feature's `browser/` folder; its later migration is recorded below.

The focused resize tests passed, and Chromium and Firefox passed 166 Bento,
drop, and Edgeless cases. A new serial pointer-down benchmark compares the
previous and current implementations with three samples at normal and large
sizes. Synchronous medians before/after were 0.4/0.3 and 0.4/0.5 ms in Chromium,
and 0/1 and 1/0 ms in Firefox, with overlapping ranges. Existing movement and
cancellation checks passed in both browsers. These samples do not establish a
speedup or settled layout.
The React suite passed 853 tests, with the subsequent detachment-cleanup test
also passing in the focused suite. Workspace build and types passed; lint passed
with warnings. The browser-owned handle listener still remained at that stage.

Bento separators now observe their Root-captured region, and gesture cancellation
uses the Root's window observations. Pointer capture remains on the separator via
target capture. The mounted handle owns its region subscriptions, the panel owns
the Root, and the resize controller owns gesture cleanup. Tests cover late Root
availability, replacement during capture and availability checks, setup rollback,
Root detachment during setup, and cleanup failures. A reentrant availability test
initially lost the replacement listeners; a separate detachment test exposed an
earlier listener left installed. Both now pass.

Chromium and Firefox passed 166 Bento, nested-drop and Edgeless cases. Matched
serial normal/large resize-start synchronous medians were 0.5/0.4 and 0.6/0.5 ms
in Chromium and 1/1 ms at both sizes in Firefox. Pointer movement and cancellation
samples also passed; the small, overlapping samples do not establish a speedup.

After the final refactor and fixture corrections, the React suite passed 860
tests, workspace types and build passed, and lint passed with 606 warnings.
Chromium and Firefox again passed 166 behavior cases and eight serial resize
checks. The final normal/large resize-start synchronous medians were 0.5/0.4 ms
in Chromium and 1/1 ms in Firefox; the small samples remain inconclusive.
The ownership review traced separator mounting, Root replacement, normalized
delivery, gesture cancellation, and cleanup: the panel owns Root, the binding
owns its subscriptions, and the controller owns gesture state. The remaining
Root migration and full cross-package ownership audit are still outstanding.

Moveable control keyboard input now observes the control box through the current
viewport's Root region. The viewport owns that borrowed Root, the control effect
owns its input subscription and markers, and the transform controller retains
gesture policy. Focus restoration checks the exact viewport attachment after a
transform, so a synchronous replacement cannot focus its old control. Tests cover
replacement and listener setup and cleanup failures.

The Edgeless suite passed 122 tests; workspace build, types, and lint passed
(606 lint warnings). Chromium and Firefox passed 158 Moveable and Edgeless
behavior cases. In matched production-preview serial samples, keyboard resize
synchronous medians before/after were 13.7/12.3 ms at normal size and 20.2/20 ms
with `repeat=200` in Chromium, and 12/12 and 17/18 ms in Firefox. Ranges overlap;
these small samples do not establish a speedup. The timing test dispatches a
synthetic keyboard event in the browser; real keyboard behavior is covered by the
separate browser suite, but matched real-key timing remains unverified.

The Edgeless world region now comes from the occurrence Root rather than a
separately constructed browser region. The viewport permits capture during setup,
then bounds the borrowed region to its exact published attachment. Tests cover
replacement during capture, failed capture rollback, and stale regions after
same-element remount. The Edgeless suite passed 125 tests; workspace build, types,
and lint passed with 606 warnings. Chromium and Firefox passed 158 behavior cases.

For a real connector-attached shape drag, three serial production-preview samples
at normal/large sizes had synchronous start medians before/after of 1.2/1.2 and
1.3/1.2 ms in Chromium, and 1/1 ms at both sizes in Firefox. Two-frame medians
were 3.8/3.8 and 4.9/5.2 ms in Chromium, and 8/10 and 8/8 ms in Firefox.
Ranges overlap; these samples neither establish a speedup nor prove settled layout.
The broader migration and ownership audit remain open.

Table resize separators now capture their input region from the current panel
Root, following panel availability through the mounted view. The separator owns
its listener disposers, the panel owns Root, and the existing controller owns
gesture capture and cancellation. Target pointer capture preserves the previous
separator-local capture. New tests cover input delivery, stale Root rejection,
detachment and replacement during setup, and listener-installation rollback.

The React suite passed 864 tests, including focused checks after the browser
adapter moved; workspace build and types passed, and lint passed with 606 warnings.
Chromium and Firefox passed 22 table-resize and container-pointer cases, plus
eight serial normal/large resize checks in Page and Edgeless. Chromium movement
synchronous samples were 0.2–0.3 ms before and 0.2–0.5 ms after; a repeated
large Edgeless sample measured 0.2–0.4 ms. Firefox measured 0–1 ms in both runs.
The limited samples do not establish a speedup or settled layout. Root migration
and the full ownership audit remain outstanding.

Page handle click-distance tracking now borrows its mounted occurrence Root's
window observations. A handle rendered outside an editor owns a temporary Root
for each press. The handle releases its old observation on Root replacement;
listener setup failure attempts all prior cleanup. The private React pointer-down
adapter remains responsible for starting the press, and the Page controller and
host retain their separate gesture and Root ownership.

Page and React suites passed 600 and 864 tests. Workspace types, build, and lint
passed (606 warnings), and Chromium and Firefox passed 108 handle and pointer-drag
cases. The existing serial 2,000-block Chromium check passed: Page start was
131 ms before and 132–141 ms over three after runs; Edgeless was 128.2 ms before
and 128.9–134.5 ms after. Only one before sample was collected, so the difference
is inconclusive. That benchmark skips Firefox; matched Firefox and normal-size
timing and the migration-wide acceptance audit remain outstanding.

The default Edgeless toolbar now borrows its viewport Root for document-phase
input and captures its toolbar region from that occurrence. A toolbar mounted
outside an occurrence owns a temporary Root for the open menu. The Root document
observer preserves document capture/bubble order, includes outside input, and
stops delivery after detachment or document adoption. Tests cover stopped document
propagation, viewport replacement during setup or tool reset, and rollback.

Root, Edgeless, Page, and React suites passed 380, 129, 600, and 864 tests.
Workspace types, build, and lint passed (606 warnings); both production demos
built. Chromium and Firefox passed 54 standalone canvas and 12 main-demo tool
cases. On the standalone demo's 10,000-element fixture, three warmed real Escape
samples had synchronous medians before/after of 0.6/0.8 ms in Chromium and 0/0 ms
in Firefox; two-frame medians were 25.4/24.4 and 22/23 ms. The small ranges
overlap and do not establish a speedup or settled layout. Synchronous timing ends
at a later document listener and does not include subsequent React work. This fixture does not
provide a matched normal-size sample. The broader migration remains incomplete.

Block text editing now returns a mount callback rather than a readable element
ref. The React mount boundary records an opaque editable identity, which the
editing controller and deferred caret restoration borrow through Root. Existing
root-replacement, editable-replacement, composition, and focus assertions remain.
The public ref change and required fixture updates are recorded separately.

The React suite passed 864 tests; workspace types, build, and lint passed with
606 warnings. The initial 12-worker browser run passed 96 cases and failed the
block-hooks fixture in both browsers. Serial rerun reproduced both failures;
the previous editable-target hook reproduced the same missing-Root-context
failure in Chromium. After the fixture mounted its panel Root and supplied its
context, the two cases passed both serially and with 12 workers. Eight serial
normal/large typing checks passed in Page and Edgeless in both browsers. A
large Page Chromium synchronous median rose from 0.1 to 1.1 ms in one run; a
repeat measured 0.1 ms with overlapping two-frame ranges. These samples do not
establish a speedup or settled layout. The broader Root migration and full
acceptance audit remain outstanding.

Visual-label sessions now keep an opaque mounted identity rather than an element
reference. Text capture and focus borrow the current panel Root; React input
handlers convert their target to an identity only at event delivery. The session
now separates mounting, reconciliation, and availability observation. Tests cover
foreign targets and Root replacement during capture; existing draft, composition,
focus, and Root-lifecycle assertions are retained.

The React suite passed 866 tests, workspace types and build passed, and lint passed
with 604 warnings. Chromium and Firefox passed 20 label and lifecycle behavior
cases plus eight serial normal/large typing and caret checks. Three-sample typing
synchronous medians before/after were 0.4/0.3 and 0.4/0.4 ms in Chromium, and
1/0 and 1/1 ms in Firefox. Caret synchronous samples were at most 0.1 ms in
Chromium and 0 ms at Firefox's clock resolution; two-frame ranges overlapped.
These measurements do not establish a speedup or settled layout. The broader
Root migration and final acceptance audit remain incomplete.

Preset gesture input no longer borrows the toolbar's native ref. A private React
portal adapter captures preview creation against the exact panel Root and surface
identity at pointer-down; stale factories decline to mount, and a preview mounted
during Root replacement or a failing ownership check is removed. The toolbar's
remaining DOM ref is local to Radix popover mounting. If a stale preview cleanup
fails after a replacement gesture begins, cleanup now preserves that newer gesture.
Focused tests reproduced both the leaked preview and replacement cancellation
before their fixes and now cover the corresponding cleanup paths.

The React suite passed 871 tests; workspace build, types, and lint passed with
604 warnings. Chromium and Firefox passed 26 preset behavior cases and eight
serial normal/large start and release checks. Synchronous start medians
before/after were 0.5/0.5 and 0.6/0.4 ms in Chromium, and 1/0 and 1/1 ms in
Firefox. Release medians were 6.4/6.1 and 9.9/10.2 ms in Chromium, and 10/9 and
20/27 ms in Firefox; the small ranges overlap. The samples do not establish a
speedup or settled layout. Root migration and the final acceptance audit remain
outstanding.

The Root browser entry point no longer exports its low-level native listener
classes, their native registration types, or the native text-selection helper.
Those implementations remain private to Root. Existing React and Page fixtures
now obtain normalized input through mounted Roots; resize fixtures keep observers
alive for the captured pointer's gesture lifetime. Their assertions are unchanged.
The shared browser region factory remains exported because Page drag tests still
exercise attachment predicates that need a separate migration.

Root, Page, and React suites passed 381, 600, and 871 tests; the 26 affected
resize and overlay checks passed again after final fixture cleanup. Workspace
types and build passed, lint passed with 604 warnings, and the generated Root
browser declaration no longer exports the removed names. Interaction timing was
not applicable: editor runtime behavior was unchanged by this export and fixture
migration. The multi-panel event transport, remaining browser exports, and full
acceptance audit remain open.

Page virtualization now observes its document offset through a captured Root
region. The view registers opaque occurrence and host identities, and its editor
registry connects both geometry and text-owner observations to the matching Root
regardless of mount order. Unbinding releases both observations; failed text-owner
setup rolls back geometry. Region observation rejects stale ownership, document
adoption, and deferred end-following after detachment. The element-taking browser
export has been removed. The host still discovers the occurrence at the React
mounting boundary; remaining browser-facing APIs and the complete migration need
further review.

The Root suite passed 386 tests before two additional focused lifetime tests;
the Page suite passed 600 tests before one additional focused rollback test. Both
new focused files passed, workspace type checks and package builds passed, and
Root/Page lint passed with 25/46 warnings. The production Page demo passed 20
virtualization behavior cases across Chromium and Firefox with 12 workers, and
the integrated demo passed eight virtualization-toggle cases at normal and large
sizes. Five measured windowed-selection samples per case had before/after
median two-frame times of 30.5/30.6 ms and 30.9/30.5 ms for Chromium normal/large,
and 30/30 ms and 29/30 ms for Firefox. This is a narrow interaction proxy, not
proof of settled layout or a speedup. The integrated demo's serial missing-endpoint
lookup also passed at both sizes and browsers, taking 0.5–0.8 ms in Chromium and
0–1 ms in Firefox per 100 checks. The complete migration acceptance audit remains
outstanding.

Bento resize now converts the separator to an opaque identity at the React mount
boundary. Its input binding retains that identity, and Root captures the nearest
matching tile and its direct parent as regions whose lifetime follows the original
separator and ancestry. Reparenting, selector changes, disconnection, Root
replacement, and reentrant replacement invalidate both regions. The panel still
owns Root, the input binding owns its subscriptions, and the resize controller
owns gesture cancellation and temporary feedback.

The Root suite passed 394 tests and React passed 871; workspace types and Root
and React lint passed (25 and 201 warnings). Chromium and Firefox passed 132
Bento behavior cases with 12 workers. Three-sample production-preview resize-start
synchronous medians before/after were 0.4/0.4 and 0.4/0.5 ms for Chromium
normal/large, and 1/1 ms for Firefox at both sizes. Large Firefox two-frame
samples varied from 7–51 ms before and 8–47 ms after; its median rose from 8 to
45 ms, and a repeat produced 8–48 ms with a 46 ms median. The overlap and small
samples do not resolve whether this is scheduling variability or a rendering
regression; synchronous timing stayed at 1 ms and more controlled profiling is
needed. The remaining Root migration and final acceptance audit are incomplete.
A controlled rebuild of the previous Bento implementation and three further
serial large-Firefox runs produced nine two-frame samples of 7–59 ms (median 8);
the current implementation produced 7–54 ms (median 46). Both distributions
were bimodal, with four and five samples respectively at 46 ms or above. Median
synchronous dispatch stayed at 1 ms in both. The source was restored and the
current demo rebuilt after the comparison. These small samples do not establish
a causal rendering regression or prove its absence; retain this for the final
performance audit.

The canvas view's viewport size now comes from the matching Root region's client
size and size observer instead of a React-owned native ResizeObserver. A view
subscribes to its viewport's attachment store and releases the prior region on
replacement; initial measurement waits for the matching Root. Reentrant Root
replacement or detachment cannot publish stale measurements or retain an observer.
The view still cancels its transform on root unmount, and the viewport/host keeps
Root ownership. Focused tests cover delayed attachment, replacement, stale resize
callbacks, detachment during initial measurement, and failed observer setup.

The Edgeless suite passed 132 tests and React passed 871; workspace build and
types passed, and Edgeless lint passed with 12 warnings. Chromium and Firefox
passed a new standalone browser resize/remount test and 132 integrated Edgeless
cases. Three-sample production-preview pointer-pan rendered medians before/after
were 16.3/16.1 and 15.9/16.5 ms in Chromium normal/large, and 15/16 and 17/16 ms
in Firefox. Synchronous samples were at most 0.1 ms in Chromium and 0 ms at
Firefox clock resolution. These are two-frame proxies and do not establish
settled layout or a speedup. The remaining Root migration and final acceptance
audit remain incomplete.

Canvas viewport coordinates, focus, and topmost-hit checks now borrow the exact
occurrence Root rather than reading browser elements in the viewport controller.
The viewport captures its own and world regions at attachment; size observation
reuses the root region. A document hit is released on every path, including an
invalid exclusion selector. Exclusions still inspect ancestors outside the
viewport, nested hits remain inside each containing viewport, and replacement
or reparenting discards stale results. The host owns Root, the viewport owns
its attachment, and coordinate consumers borrow only attachment-bound operations.
Moveable's private browser integration and other native boundaries remain.

The Edgeless suite passed 135 tests before three additional focused lifetime and
failure checks; the updated focused files passed. React passed 871 tests, workspace
types passed, and Edgeless lint passed with 12 warnings. Chromium and Firefox
passed 56 standalone canvas and 132 integrated Edgeless cases. Twelve serial
normal/large pan and preset-start/release cases passed in both browsers. For
preset release, a controlled baseline changed only the hit implementation back
to its previous native lookup; synchronous before/after medians were 6.3/6.2
and 10.5/10.4 ms in Chromium normal/large, and 11/13 and 19/21 ms in Firefox.
Three-sample ranges overlap and do not establish settled rendering or a speedup.
The complete Root migration and final acceptance audit remain outstanding.

Table boundary controls now render through a private browser portal adapter that
borrows the panel's mounted Root and validates the marker, enclosing block, and
panel ancestry before using its portal host. The table renderers no longer retain
or receive that host. Controls remain available while the panel is mounted but
disabled; Root replacement, foreign surfaces, and marker reparenting invalidate
the old host. The table resize listener receives an opaque separator identity.
The view owns the portal and availability subscription, the panel owns Root,
and the resize controller owns gesture cancellation. An initial React test run
exposed a standalone Page fixture without surface Root context; the adapter was
corrected to observe the panel's mounted Root directly, and the fixture's existing
assertions passed unchanged.

The React suite passed 872 tests, workspace types passed, and React lint passed
with 201 warnings. Chromium and Firefox passed 22 table and container interaction
cases. Eight serial resize checks passed across Page and Edgeless at normal and
large sizes. Three-sample movement synchronous medians before/after were 0.2/0.2
and 0.3/0.2 ms in Chromium Page, 0.2/0.4 and 0.3/0.3 ms in Chromium Edgeless,
1/1 and 1/0 ms in Firefox Page, and 0/1 and 0/1 ms in Firefox Edgeless. These
small samples and Firefox clock resolution do not establish a speedup or settled
layout. The broader Root migration and final acceptance audit remain incomplete.

The Edgeless input hook now receives an opaque viewport identity from the React
mounting boundary. It compares that identity with the current attachment before
borrowing its Root; it no longer receives a native element. The viewport still
owns attachment and cleanup. A focused test in `hooks/__tests__` verifies that a
foreign identity cannot connect input, a matching identity can pan, and input
stops after detachment. This is an internal contract change; the CanvasView mount
ref and public APIs are unchanged.

The Edgeless suite passed 139 tests, its type check and lint passed (12 warnings),
and the production demo build passed. Chromium and Firefox passed 12 pan and mode
lifecycle cases with 12 workers. Serial production trackpad tests passed at normal
and `repeat=200` sizes in both browsers. Before/after synchronous medians were
1.5/1.5 and 1.6/1.6 ms for Chromium and 2/2 and 3/3 ms for Firefox; two-frame
medians were 16.7/16.7 and 17.1/17.1 ms for Chromium and 32/32 ms for Firefox at
both sizes. These are interaction samples, not proof of settled rendering or a
speedup. The wider migration and its acceptance audit remain incomplete.

The canvas Moveable component and the native viewport and world-layer props it
requires now live under `components/browser`. The public controls entry still
exports the same component and its browser-free adapter contract. This is a file
and type relocation: attachment ownership, gesture input, and cleanup are
unchanged. Its existing test was updated only for the internal import location.
The Edgeless suite passed 139 tests; its build and type check passed, and lint
passed with 12 warnings. Interaction timing is not applicable to the relocation.
The remaining Root migration and final acceptance audit are incomplete.

Keyboard block behaviors now carry their captured input registration through
caret placement and structural predecessor focus. This prevents work from a
removed registration from acting after a new registration uses the same mounted
Root. The keyboard dispatch, behavior context, selection helpers, direct UI
callers, registration owner, and deferred focus checks were reviewed together.
Direct UI actions still use the mounted Root lifetime without a keyboard
registration; they require a separate review during the remaining migration.

Workspace build and type checks passed, and lint passed with 626 warnings. The
React suite passed 910 tests; nine focused tests passed after the final added
dispatch case. Ten Page and Edgeless behavior cases passed across Chromium and
Firefox with 12 workers. Twelve serial split and merge timing cases passed at
normal size and `repeat=200`. For split focus, synchronous medians before/after
were Chromium Page 5.5/4.8 ms normal and 36.2/35.4 ms large, Edgeless 8.1/8.6
and 26.8/30.2; Firefox Page 2/2 and 13/12, Edgeless 3/3 and 15/17. Two-frame
medians were Chromium Page 25.6/27.2 and 115/113.7, Edgeless 24/23.8 and
30.6/34.2; Firefox Page 21/25 and 84/95, Edgeless 21/35 and 63/58. The normal
Firefox Edgeless sample did not overlap the baseline, but three isolated repeats
produced frame times of 20–35 ms, overlapping the 20–33 ms baseline. These
measurements do not establish settled layout. The single-Root migration and
complete acceptance audit remain unfinished.

The canvas layer subscription now lives in the browser component directory.
Default controls borrow only world-region lookup and focus, and toolbar dismissal
borrows only the Root input operations and attachment check it uses. Both retain
the same attachment identity and ownership; the portal and Moveable browser
adapter still access native layers where their browser integration requires them.
Compile-time checks protect the narrower consumer contracts. Edgeless tests (139),
types, build, and lint passed; lint reported 12 warnings. Interaction timings are
not applicable to this type and module relocation. The remaining migration and
full acceptance audit are incomplete.

Board modal focus restoration now captures the inline wrapper's opaque identity
and borrows its parent panel's mounted Root to find and focus the toggle. Nested
panel controls are excluded; detachment or Root replacement during lookup stops
the request. The Root call allows scrolling, matching the former browser focus.
The panel retains Root ownership and the modal owns no listener or Root cleanup.
Two new React tests cover nested-panel exclusion, detachment, and reentrant Root
replacement; browser tests under `e2e/__tests__` cover three close-and-focus cycles
in Page and Edgeless at normal and large sizes.

The React suite passed 874 tests after correcting a test fixture that incorrectly
assumed a global Jest object. React type check, lint (202 warnings), and demo build
passed. Chromium and Firefox passed 36 parallel modal cases and eight serial
focus cases. For three serial samples, before/after synchronous medians in ms were
Chromium Page 5.4/5.2 normal and 5.6/5.3 large; Edgeless 5.6/5.0 and 4.8/5.3.
Firefox Page was 11/11 and 10/11; Edgeless 11/9 and 8/13. A repeat of large
Firefox Edgeless produced 8–13 ms (median 10), overlapping the baseline 8–11 ms.
Two-frame medians were Chromium Page 36.9/34.2 and 329/328.9; Edgeless 35.9/32.6
and 33.4/36.6. Firefox Page was 28/34 and 388/373; Edgeless 29/30 and 48/51.
Large Page rendering remains slow in both builds; these small samples do not prove
settled rendering or exclude regressions. The broader migration and acceptance
audit remain incomplete.

A Chromium production-preview trace investigated the large Page modal-close
rendering cost recorded above. The click handler took about 9 ms; after it,
style recalculation visited approximately 55,000 elements (152 ms in one trace),
followed by document-wide layout and paint. Invalidation tracking recorded the
modal library removing `data-scroll-locked` and mutating the body inline style
as the dialog closed. In separate three-sample experiments after two settled
frames, removing body `pointer-events` and forcing layout took 86.6–90.5 ms;
removing `data-scroll-locked` and forcing layout took 160.6–166.5 ms. Each
experiment used a fresh large Page and measured the mutation together with a
forced layout; these numbers are not additive and do not measure full close.
The active modal's library-applied scroll lock sets body overflow and position,
while its body pointer-events setting blocks background interaction. The trace
identifies document-wide modal teardown as a major contributor, not a proven
regression from the Root focus change. A safe optimization still needs to retain
scroll locking, background blocking, nested dialogs, focus trapping, and cleanup;
no modal behavior was removed. The remaining migration, optimization, and full
acceptance audit are incomplete.

The Page-end portal now lives in a browser adapter and checks its surface identity,
current mounted Root, and slot region before passing the native host to React.
Nested Page occurrences remain excluded, and a detached Root cannot render a portal
on the next context render. The panel owns Root; the portal borrows it and React
owns portal cleanup. The existing test now supplies connected mounted Roots without
changing its nested-slot and replacement assertions. A new detached-Root check
failed against the previous implementation and passes with this change.

The React suite passed 875 tests, React type checks and lint passed (203 warnings),
and the production demo build passed. Chromium/Firefox parallel behavior passed
133 cases with four skips; one Firefox large-document embedding setup timed out in
parallel and passed its required serial rerun. Twelve serial trailing-block cases
passed across both browsers and sizes. Three-sample before/after synchronous
medians in ms were Chromium 5.8/5.8 normal and 46.7/46.2 large, Firefox 8/12 and
66/67; ranges overlap (Firefox normal 7–11 before and 8–12 after). Rendered
medians were Chromium 26.4/26.7 and 152.3/145.7, Firefox 21/21 and 113/115.
These small samples do not prove a speedup or exclude a regression. The wider
migration and full acceptance audit remain incomplete.

Edgeless preset drag now captures the matching input Root's frame clock before
acquiring its pointer. The gesture owns and releases the pending frame disposer;
a stale callback checks both the captured clock and viewport before painting. If
scheduling reentrantly cancels the gesture, the returned disposer is still
released. No native window or animation-frame handle crosses this controller.
Existing gesture fixtures now supply a connected Root; three additional focused
checks cover reentrant scheduling, late delivery, and detached input. The panel
owns Root, the gesture owns capture and frame cleanup, and the preview owns its
portal host.

The React suite passed 878 tests, React type checks and lint passed (205 warnings),
and the production demo build passed. Fourteen parallel Chromium/Firefox preset
behavior cases and twelve serial position/commit cases passed. Three-sample
before/after synchronous medians in ms were Chromium 0.4/0.3 normal and 0.6/0.7
large, Firefox 1/1 at both sizes. Two-frame medians were Chromium 16.7/16.7 and
16.9/16.8, Firefox 16/17 and 16/16. These samples do not prove settled layout or
a speedup. The wider Root migration and final acceptance audit remain incomplete.

Edgeless structural deletion now schedules its follow-up focus through the
panel selection manager, which owns the Root-bound frame and its cancellation
subscriptions. The immediate focus remains; the delayed focus is skipped after a
newer selection or input, focus leaving the occurrence, teardown, or keyboard
registration replacement. The keyboard consumer borrows only the existing
selection scheduling operation. A new focused test reproduced the old use of the
global scheduler and verifies that a replaced registration cannot be focused.

The React suite passed 879 tests, React types and lint passed (205 warnings), and
the production demo build passed. Twelve parallel Chromium/Firefox deletion and
undo cases and four serial Edgeless timing cases passed. Three-sample before/after
synchronous medians in ms were Chromium 5.6/5.7 normal and 80.6/81.1 large;
Firefox 3/3 normal and 234/236 large. Two-frame medians were Chromium 21.5/21.2
and 83.9/84.5; Firefox 19/22 and 260/260. Large Edgeless deletion remains slow in
both builds; these samples do not prove settled layout or a speedup. The broader
Root migration and final acceptance audit remain incomplete.

The previously profiled large-Edgeless deletion cost was addressed at the
hierarchy read owner. Document blocks now provide a batch parent lookup: larger
reads during an open transaction traverse the live hierarchy once and update
validated paths; duplicate placements, malformed branches, and smaller batches
retain the existing individual lookup. The canvas adapter uses that batch only
for whole-document panels, reads end boundaries only when starts are missing, and
retains panel-relative lookup for subtree panels. The document manager owns the
hierarchy read; core forwards the operation, and the canvas borrows it without
owning the model or its lifecycle. Tests verify 10 and 200 requested roots each
use one root snapshot, plus repeated reads after a move, duplicate placements,
missing boundaries, and scoped projection behavior.

Workspace build, types, lint (611 warnings), the core test command, and 882 React
tests passed. Twenty-two parallel Chromium/Firefox behavior cases covered Page and
Edgeless deletion, undo, canvas cards, and embedded occurrences. Four serial
Edgeless deletion timings passed with three samples each. Before/after synchronous
medians in ms were Chromium 5.7/5.7 normal and 81.1/19.7 large, Firefox 3/3 normal
and 236/15 large. Two-frame medians were Chromium 21.2/21.1 and 84.5/23.2,
Firefox 22/20 and 260/43. These are production-preview interaction samples, not
proof of settled layout or a general speedup. The wider Root migration and full
acceptance audit remain incomplete.

Canvas pin acquisition now rolls back its own pin scope if visibility notification
fails, retaining both errors if rollback notification also fails. This protects
navigation, selection, focus, and transform callers that cannot receive a disposer
when acquisition throws; unrelated pin scopes remain active. New `__tests__`
coverage reproduced the leaked offscreen card before the fix and verifies rollback,
independent scopes, and aggregated failures.

Edgeless types and lint (12 warnings), its 141 tests, and the production demo build
passed. Eight parallel Chromium/Firefox navigation, selection, and collapse cases
and twelve serial navigation timing cases passed. Three-sample before/after
synchronous medians in ms were Chromium 8/7.5 normal and 19/18.7 large, Firefox
6/6 normal and 11/11 large. Two-frame medians were Chromium 20.3/18.8 and
31.1/30.8, Firefox 20/17 and 42/44. Sample ranges overlapped for the large cases;
these measurements do not establish a general performance change or settled
layout. The remaining Root migration and final acceptance audit are incomplete.

The Root browser entry no longer exports the direct region factory. Page's drag,
drop, and virtualization fixtures now capture regions through a `BrowserInputRoot`
and retain their existing assertions, including controlled lifetime failures. The
factory remains private to Root's browser implementation and its own unit tests.
Root and Page types and package builds passed; their suites passed 394 and 601
tests, and Page lint passed with 46 warnings. The generated browser declaration
contains no direct region factory. Interaction timing does not apply to this export
and fixture change because editor runtime behavior is unchanged. The multi-panel
event transport and final migration audit remain open.

The multi-panel browser listener owner now rejects an older reconciliation when
checking an occurrence synchronously starts another reconciliation or disconnects
the listener set. Previously a disconnect during that check could be overwritten
by the older request, reinstalling listeners. When installation is superseded,
the older listener or pointer boundary lease is released before reconciliation
stops. A released older pointer boundary also cannot erase a replacement from the
shared boundary registry. New Root tests in `__tests__` cover these reentrant
replacement and disconnection cases. Reentrancy during native listener removal
is handled by invalidating the complete retiring set before removing its native
listeners. A reentrant replacement can therefore install its own listeners without
adopting connections still scheduled for removal. Tests cover reconciliation and
disconnection during removal.

Root types, lint (25 warnings), its 400 tests, 883 React tests, and the production
demo build passed. Eight parallel Chromium/Firefox cases covered registration changes,
embedded editing, occurrence selection, and clipboard. Eight serial typing cases
passed in Page and Edgeless at normal size and `repeat=200`. Three-sample
before/after synchronous medians in ms were Chromium Page 0.1/0.1 normal and
1.1/1.3 large, Edgeless 0.6/0.7 and 0.1/0.1; Firefox medians were 0/0 in all
cases. Two-frame medians were Chromium Page 21.8/21.3 and 26.6/28.2, Edgeless
20.5/21.1 and 20.6/22.8; Firefox Page 16/12 and 11/14, Edgeless 14/15 and
28/25. The large Page Chromium ranges overlapped; these small samples do not prove
a general performance change or settled layout. The full migration remains open.

For listener removal, Root types, lint (25 warnings), 401 tests, 69 focused React
event and panel tests, and the demo build passed; an additional Root check covers
both removal entry points. Eight
parallel browser cases passed in Chromium and Firefox. Eight serial Page and
Edgeless typing cases passed at normal size and `repeat=200`. Three-sample
before/after synchronous medians in ms were Chromium Page 0.1/0.2 normal and
1.3/0.1 large, Edgeless 0.7/0.5 and 0.1/0.2; Firefox Page 0/0 and 0/1,
Edgeless 0/0 and 0/0. Two-frame medians were Chromium Page 21.3/20.6 and
28.2/28.5, Edgeless 21.1/22.5 and 22.8/20; Firefox Page 12/16 and 14/11,
Edgeless 15/14 and 25/25. The ranges overlap in each case; the samples do not
prove a general performance change or settled layout.

Root keyboard registration, held-key, and parsed-shortcut declarations now live
in keyboard-owned types files; Page's editor and selection declarations likewise
live with their owning contracts. Page's package entry retains its existing
`BlockEditorApi` and selection type exports, and Root retains `ParsedShortcut`.
The three Page test files that imported the former internal editor API module now
import its types file without changing assertions. The relocation changes no
runtime behavior. Root and Page suites passed 402 and 601 tests, their types,
lint (25 and 46 warnings), and package builds passed, and React type checking
passed. Generated declarations retain the public types. Browser timing is not
applicable to this type-only relocation; the wider migration remains incomplete.

Multi-occurrence listener contracts now live in Root's portable event types.
The browser listener and capture borrow only an attachment check for each Root;
the private browser adapter resolves the associated native element. React's panel
router borrows the normalized capture and pointer-control contracts, while its
event manager still owns creation, reconciliation, and destruction of the browser
listener. The panel registry owns registration-scoped Roots. This review covers
the listener creation, routing, and teardown path, but does not complete the
planned multi-panel transport migration.

Root's 403 tests and 69 focused React event/panel tests passed. Root and React
type checks, lint (25 and 207 warnings), and package builds passed. The default
Root entry also passed its DOM-free type check. Browser timing is not applicable:
this change moves and narrows TypeScript contracts without changing runtime code.

Root's event dispatcher now retains a registration snapshot by opaque dispatch
identity. Root browser events and React's event manager use that shared operation
instead of each owning a separate weak snapshot cache. Unidentified deliveries
still take a fresh snapshot; a new identity isolates reentrant delivery. React
continues to own panel resolution and its cross-group claim policy. A new Root
test in `__tests__` covers shared phases, removals, and independent identities.

Root's 404 tests, Page's 601 tests, 69 focused React event/panel tests, Root and
React types, Root lint (25 warnings), Root build, and the demo build passed. Eight
parallel Chromium/Firefox registration and embedded-editor cases and eight serial
typing cases in both modes and sizes passed. Three-sample before/after synchronous
medians in ms were Chromium Page 0.2/0.2 normal and 0.1/1.3 large, Edgeless
0.5/0.5 and 0.2/2.5; Firefox Page 0/0 and 1/1, Edgeless 0/0 and 0/0. Two-frame
medians were Chromium Page 20.6/22.1 and 28.5/31.7, Edgeless 22.5/23.3 and
20/20.4; Firefox Page 16/14 and 11/12, Edgeless 14/14 and 25/23. Large Chromium
synchronous samples had overlapping ranges (Page 0.1–1.2/0.2–1.4 ms; Edgeless
0.1–2.4/0.2–2.6 ms); these samples do not establish a regression or settled layout.
Two additional serial large Chromium runs passed; six synchronous samples per
mode had medians of 0.6 ms (range 0.1–1.6) for Page and 0.1 ms (range 0–2.9)
for Edgeless, showing the variation in the initial medians.
The rest of the multi-panel transport and final acceptance audit remain open.

Multi-occurrence browser delivery now has a Root-owned `BrowserRoutedEvents`
runtime. Root groups listeners, retains dispatch snapshots, coordinates claims,
applies cancellation policy, rolls back registration, and releases native
listeners. React supplies the current borrowed Roots and panel context, retains
panel filters and extension cleanup, and owns destruction of that one runtime.
The low-level `BrowserEventListeners` is private to Root; six panel test files use
the routed runtime with unchanged assertions. New Root tests cover phase
snapshots, cross-group claims, passive cancellation, registration failure, and
destruction during Root lookup.

Root, Page, and React suites passed 412, 601, and 891 tests. Root and React types,
Root and React lint (27 and 209 warnings), Root package build, and the production
demo build passed. Twenty-six final parallel Chromium/Firefox behavior cases covered
IME, clipboard, selection, registration changes, and embedded occurrences. Twelve
serial cases covered typing in Page and Edgeless and embedded editing at normal
size and `repeat=200`. Three-sample before/after synchronous typing medians in ms
were Chromium Page 0.1/0.1 normal and 1.1/1.3 large, Edgeless 0.5/0.5 and
0.1/2.6; Firefox medians were 0/0 throughout. Large Chromium Edgeless ranges
overlapped (0–2.8/0.1–2.8 ms), and the preceding final-code run measured 0.1 ms.
Two-frame typing medians were Chromium Page 20.7/20.7 and 29.7/32.6, Edgeless
23.3/22.7 and 20.4/20.6; Firefox Page 13/14 and 12/13, Edgeless 15/14 and
24/23. An earlier large Firefox
Edgeless ranges did not overlap (23–25/27–36 ms), so three more isolated runs
were taken: nine samples had a 26 ms median and a 21–33 ms range, overlapping
baseline. Embedded command medians stayed within 0–1 ms in both browsers; its
two-frame medians were Chromium 28.8/29.1 normal and 26.1/26.5 large, Firefox
29/28 and 16/16. A further regression test covers destruction during the final
Root ownership check; it failed before the added guard. These samples do not establish settled layout or a general
performance change. Broader Root migration and final acceptance remain open.

After the final teardown guard and consumer-boundary review, workspace build,
type checks, core tests, and lint passed (617 warnings). The rebuilt Root browser
declarations expose `BrowserRoutedEvents` but not the low-level listener owner.
The routed factory borrows only pointer ownership; Root retains cancellation and
native listener authority. The final React suite passed 891 tests and the final
parallel browser run passed 26 cases; twelve final serial typing and embedding
cases passed in both browsers and sizes. An earlier 28-case browser run and the
Firefox timing repeat remain recorded above as additional evidence.

Panel routing now treats activation as superseded if deactivation or selection
clearing synchronously activates another occurrence or replaces the receiving
registration. The older event is not delivered to the replacement. Three new
tests in `__tests__` cover nested activation at both callback points and target
replacement; the first case failed before the fix. The panel registry retains
activation policy and registration ownership; the Root listener remains a
borrowed input source and does not own panel selection.

React types, lint (208 warnings), all 886 React tests, and the demo build passed.
Eight parallel Chromium/Firefox registration and embedding cases passed. Four
serial embedded-editor timing cases passed against matched production builds at
normal size and `repeat=200`. Five-sample before/after synchronous command medians
in ms were Chromium 0.4/0.4 normal and 0.6/0.5 large, Firefox 0/0 and 1/1;
two-frame command-to-render medians were Chromium 29.4/29.5 and 25.1/26.1,
Firefox 28/28 and 15/17. The corresponding end-to-end keyboard medians were
Chromium 40/42 and 63/61, Firefox 38/35 and 98/83. Ranges overlap in these
samples; they cover embedded editing and lifecycle rather than isolate activation
duration, and do not prove settled layout. The remaining migration and acceptance
audit are incomplete.

Panel removal now releases the old pointer ownership before selection cleanup can
install a replacement and begin another gesture. It clears active state only when
the removed occurrence is still active and no replacement occupies its identity.
Four new `__tests__` cases cover replacement during selection cancellation, Root
notifications, and deactivation, plus a replacement pointer gesture. The three
active-state cases and the pointer case each failed with their prior cleanup order.

React types, lint (210 warnings), all 890 React tests, and the demo build passed.
Eight parallel Chromium/Firefox event and embedding cases and four serial embedded
editing/lifecycle timing cases passed. Five-sample before/after synchronous
command medians in ms were Chromium 0.4/0.3 normal and 0.5/0.5 large, Firefox
0/0 and 1/1; two-frame medians were Chromium 29.5/29.3 and 26.1/25.8, Firefox
28/28 and 17/16. End-to-end keyboard medians were Chromium 42/40 and 61/61,
Firefox 35/38 and 83/83. Ranges overlap; these cases exercise embedded editing
and lifecycle but do not isolate panel removal or prove settled layout. The wider
Root migration and final acceptance audit remain incomplete.

Canvas navigation now borrows the originating Root's frame clock when pinning
offscreen cards. The canvas connection owns pending frame and pin cleanup, and
disconnect releases both even if scheduling reenters or fails. Tests in
`__tests__` cover disconnect, reconnection, stale callbacks, and scheduling
failures; navigation fixtures verify the exact Root passed to the source.

React types, lint (206 warnings), the production demo build, and 883 React tests
passed. Eight parallel Chromium/Firefox navigation, selection, and collapse cases
and twelve serial navigation timing cases passed. Three-sample before/after
synchronous medians in ms were Chromium 7.4/8 normal and 17.2/19 large, Firefox
6/6 normal and 11/11 large. Two-frame medians were Chromium 18.8/20.3 and
24/31.1, Firefox 19/20 and 42/42. These small samples do not establish a general
performance change. The broader Root migration and final acceptance audit remain
incomplete.

Page input delivery now uses Root's portable `InputEvents` for listener grouping,
registration snapshots, claims, and attachment cleanup. Page owns scope and
predicate policy and builds its own event context; its editor event owner creates
the Root runtime, supplies the shared registration store, and releases the input
attachment. The Root runtime borrows only registration cleanup and the store
operations it uses. Its observer and listener resources belong to its attachment.
Three new Root tests in `__tests__` cover snapshot ordering, observers after a
claim, and detachment during delivery or event creation. Existing Page tests now
exercise the owning editor events instead of the removed internal dispatcher.

Workspace build, type checks, lint (617 warnings), core tests, Page's 601 tests, React's 891
tests, and Root's 415 tests passed. Six standalone Page interaction cases and 26
main editor cases passed in Chromium and Firefox with twelve workers. Twelve
serial pointer and typing cases passed in both browsers and document sizes. For
large Firefox pointer selection, the two-frame median was 84 ms before and 97 ms
after; three further isolated runs had a median of 84 ms across nine samples
(36–98 ms). Large Chromium Page typing synchronous median was 0.2 ms before
(three samples) and 1.2 ms after; three further runs had a 1.2 ms median across
nine samples (0.1–1.5 ms). These small, variable samples leave the Chromium
timing difference unresolved and do not establish settled layout or causation.
The wider Root migration and its final acceptance audit remain incomplete.

The Page drag-handle pointer hook and its private native React pointer contract now
live alongside pointer tracking in the drag-and-drop browser adapter. The public
handle props and gesture behavior are unchanged. All 30 focused handle tests and
Page type checks passed; Page lint passed with 45 warnings. This relocation does
not change interaction logic, so additional before/after timing is not applicable.

Before the connector input migration, a production-preview baseline for its
existing reconnect performance test passed in Chromium and Firefox
at normal size and `repeat=200`; raw samples are in
`/tmp/rivto-connector-root-before.log` for the corresponding comparison.
An additional test in `__tests__` now verifies that cancelling after a preview
clears hover feedback and that a later pointer release does not commit. The test
passed against the previous native transport as a preservation check.

Connector endpoints now observe normalized input through their panel Root. Each
gesture retains its original interaction and pointer-capture disposer; releasing,
cancelling, deselecting, or replacing the Root ends that capture. The visual layer
supplies the current Root and retains canvas hit testing and document mutation
policy. The renderer retains its local preview. Existing attachment and cancellation
tests now mount a Root, and replacement additionally verifies capture release.
The React suite passed 892 tests, and twelve parallel Chromium and Firefox connector
behavior cases passed at normal size and `repeat=200`. Four serial reconnect
measurements passed. Three-sample synchronous medians before/after in ms were
Chromium 0.4/0.4 normal and 0.6/0.3 large, Firefox 1/0 normal and 0/0 large.
Synchronous ranges before/after were Chromium 0.4–0.5/0.3–0.6 normal and
0.2–0.7/0.3–0.4 large, Firefox 1–1/0–0 and 0–1/0–1. Two-frame medians were
Chromium 16.5/16.4 and 16.5/16.5, Firefox 16/17 and 16/17. These small samples do not establish a general performance change or
settled layout. The broader Root migration and acceptance review remain open.

Rectangle radius preview now borrows `InputRegion.clientToSvgPoint` to convert
viewport coordinates using the current SVG transform. Root owns the browser
matrix and rejects a result when the captured region becomes unavailable; the
rectangle retains its radius, preview, and commit policy. The renderer still uses
React pointer events and a native mount identity, so its input migration remains
open. Root tests cover rotated and scaled conversion, non-SVG regions, and
detachment during conversion.

Workspace type checks, the Root package build and 417 Root tests, the demo build,
and 892 React tests passed. Root and React lint passed with 28 and 212 warnings.
Four parallel Chromium and Firefox radius scenarios passed at normal size and
`repeat=200`, including rotation, cancellation, undo, and remount. Four serial
production-preview runs passed. Three-sample before/after two-frame medians in ms
were Chromium 16.5/16.5 normal and 16.6/16.5 large, Firefox 17/16 normal and
16/17 large. The existing synchronous measurement stops at the canvas plane,
before the React handler performs the SVG conversion, so it does not isolate
conversion cost. These samples do not prove settled layout or general performance.

The rectangle radius handle now receives normalized pointer, keyboard, focus,
and double-click input through its current panel Root. The rectangle retains the
draft and document update policy; the attachment owns listeners and cancels its
capture on replacement or unmount. Root's pointer focus operation now also accepts
SVG elements and rejects matches outside its boundary. Tests in `__tests__` cover
SVG focus, out-of-bound targets, and capture cleanup on Root replacement.

The Root suite passed 419 tests, React passed 893, and package type checks, the
production demo build, and lint passed (28 Root and 215 React warnings). Four
parallel Chromium and Firefox radius behavior cases and four serial timing cases
passed at normal size and `repeat=200`. The timing probe now measures through
the pointer handler; three-sample synchronous before/after medians in ms were
Chromium 0.4/0.4 normal and 0.4/0.4 large, Firefox 1/0 normal and 1/1 large.
Ranges were Chromium 0.4–0.5/0.4–0.4 and 0.3–0.4/0.3–0.4, Firefox 0–1/0–1
for both sizes. Two-frame medians were Chromium 16.5/16.5 and 16.4/16.5,
Firefox 16/16 and 16/17. These samples do not establish settled layout or a
general performance change. The wider Root migration and final audit remain open.

The rectangle radius renderer now delegates input policy to `RectangleRadiusInput`
and listener lifecycle to an attachment owner. The attachment borrows only Root
availability, region observation, and SVG conversion; the renderer retains its
draft and document operation. The three function-length warnings introduced by
the migration are removed. React types, lint (212 warnings), the demo build, and
all 893 React tests passed. Four parallel browser cases and four serial timing
cases passed in Chromium and Firefox at both sizes. Three-sample synchronous
before/after medians in ms were Chromium 0.4/0.4 normal and 0.4/0.2 large,
Firefox 0/1 normal and 1/0 large; ranges were Chromium 0.4–0.4/0.4–0.4 and
0.3–0.4/0.1–0.3, Firefox 0–1/0–1 and 0–1/0–2. Two-frame medians were
Chromium 16.5/16.5 and 16.5/16.5, Firefox 16/17 and 17/16. These small samples
do not establish settled layout or a general performance change.

Visual label activation now keeps React's native double-click handling inside a
private browser adapter. The visual's editing policy receives only a viewport
point, and the adapter checks that the panel still owns its current input Root.
React remains the delivery mechanism here: moving the listener directly to the
visual's native region would run before a nested React control can stop
propagation. A new test in `__tests__` covers that ordering, detached and replaced
Roots, and disabled editing. Full Root event delivery for this path remains open.

React type checks, lint (212 warnings), the production demo build, and all 894
React tests passed. Ten parallel Chromium and Firefox label and visual-editing
cases and eight serial caret and typing cases passed at normal size and
`repeat=200`. In the large Firefox caret case, two-frame medians were 25 ms before
and 32 ms after; three further runs produced a 26 ms median across nine samples
(25–33 ms). Large Firefox typing two-frame medians were 9 ms before and 19 ms
after; the repeats had an 18 ms median (7–24 ms), overlapping the 8–18 ms
baseline range. These small samples leave the typing timing difference uncertain.
The caret benchmark measures selection placement and rendering, not the complete
double-click handler; these results do not establish settled layout or startup cost.

Page keyboard transport now rolls back partially installed routes and attempts
every route release before resetting held keys. Setup and cleanup failures are
retained together. Page focus and detach observers also remove newly added
listeners when cleanup ownership fails. Root keyboard registration releases its
action identity on ownership or inventory-notification failure, including when
the owner disposer fails, a keymap update reenters, or the runtime is destroyed
during registration. The transport borrows only the held-key operations it uses;
Page owns the tracker and Root owns the semantic registration state.

Before the held-key observer fix, workspace build, type checks, core suites, and lint passed (619 lint
warnings); Root passed 426 tests, Page 608, and React 894. Eight standalone Page
and ten main-editor behavior cases passed in Chromium and Firefox, plus eight
serial caret-before-typing cases at normal size and `repeat=200`. Three-sample
synchronous before/after medians in ms were Chromium Page 0.2/0.1 normal and
1.1/0.1 large, Edgeless 0.5/0.6 and 2.5/0.1; Firefox Page and Edgeless were
0/0 at both sizes. Two-frame medians were Chromium Page 21.1/20.3 and 28.5/28.7,
Edgeless 23.4/22.2 and 20.8/24.7; Firefox Page 17/16 and 15/14, Edgeless 16/15
and 26/27. Ranges overlapped. These timings exercise typing, not registration or
teardown cost, and do not establish settled layout or a general performance change.
The broader migration and its final acceptance audit remain incomplete.

Held-key state notification now attempts every observer even when one throws.
Reset also clears modifiers after a notification failure, then reports the
failures; successful notification ordering remains unchanged. Root tests in
`__tests__` cover reset, modifier reconciliation, and key updates with a failing
observer. The final workspace build, type checks, core tests, and lint passed
(619 warnings); the subsequent complete Root suite passed 429 tests, Page passed
608, and React passed 894. Eight standalone Page and ten main-editor behavior
cases passed in Chromium and Firefox. Eight serial typing cases passed at normal
size and `repeat=200`. Three-sample synchronous before/after medians in ms were
Chromium Page 0.2/0.2 normal and 1.1/0.1 large, Edgeless 0.5/0.4 and 2.5/2.4;
Firefox Page 0/0 and 0/1, Edgeless 0/0 and 0/0. Two-frame medians were Chromium
Page 21.1/19.8 and 28.5/27.2, Edgeless 23.4/22.8 and 20.8/22.3; Firefox Page
17/17 and 15/13, Edgeless 16/13 and 26/25. Ranges overlapped. These timings do
not isolate registration or teardown cost and do not establish settled layout.

Page input events now expose `BlockInputRoot`, containing the Root operations
used by the current selection, drag, and hover paths. Input observer creation and
unrelated Root operations remain with the attachment owner. The event retains the
same Root identity; selection and drag gestures borrow narrower subsets, and the
drag gesture declaration lives in its owning `types.ts`. The creation, event
delivery, gesture retention, hover identity checks, and attachment cleanup paths
were inspected separately from behavioral tests.

The workspace build and type checks passed, as did 609 Page tests and the focused
React panel attachment test. Lint passed with 618 warnings. Comparison of emitted
JavaScript for the affected implementations found no runtime change; the changed
keyboard fixture and retained Root types are documented in the breaking-change
notes. Browser interaction and performance timings were not rerun for this
type-only contract change. The broader migration and acceptance audit remain open.

The Page controller's public `inputRoot` now exposes only the operations used by
the rendering scope. Attachment still borrows the full Root privately for input,
selection, virtualization, and cleanup; the returned object and its identity are
unchanged. The view, hover observer, drop feedback, attachment, and host cleanup
paths were inspected separately from tests. Page's full suite passed 610 tests,
including the contract check in `__tests__`. Workspace build, type checks, and
lint passed (618 warnings). This type-only change does not alter runtime
interaction or performance, so browser and timing checks were not rerun; the
complete migration remains outstanding.

Root's input dispatcher now permits an occurrence contract containing only
observer creation and attachment checks, while preserving the caller's selected
Root type for event context creation. Page uses this to state the capabilities
needed by its event, focus, selection, hit-testing, virtualization, and rendering
paths without requiring unrelated Root operations. Its host still owns the Root;
the input dispatcher owns and releases its observer, and Page releases only its
own attachment. Root and Page contract tests are in `__tests__`.
The workspace build and type checks passed; lint passed with 618 warnings. Root
passed 430 tests, Page passed 611, and the React panel lifecycle suite passed 24.
The dispatcher and Page event implementation emitted identical JavaScript before
and after the type changes. Browser behavior and performance were not rerun for
this type-only change; they remain part of the final migration acceptance audit.

Edgeless card auto-height now captures the card shell and content from its
mounted Root. Root measures scroll height while temporarily releasing the shell's
height and owns the shared content/child resize observer. Page-independent card
policy still chooses the minimum height and schedules history-free model writes.
The card releases measurement and pending writes on Root replacement or unmount;
disabled panels continue using their mounted Root. The attachment, observation,
measurement, queued update, and cleanup boundaries were inspected separately
from tests. Custom Root region providers must implement the added measurement.

Workspace build and type checks passed; lint passed with 620 warnings. Root passed
433 tests and React passed 894. Six card behavior cases passed in Chromium and
Firefox with 12 workers, including growth, shrinkage, and remount. The new
growth/shrinkage test also passed against the previous production build in both
browsers. Four serial trackpad performance cases passed at normal size and
`repeat=200`: Chromium synchronous medians before/after were 1.5/1.5 ms and
1.5/1.6 ms, with two-frame medians 16.8/16.8 and 17.2/17.2 ms; Firefox was
2/2 ms synchronous and 32/32 ms two-frame at both sizes. Ranges overlapped.
Four serial Edgeless typing cases also passed; the preceding production baseline
and current three-sample synchronous medians were Chromium 0.4/0.5 ms normal
and 2.4/2.8 ms large, Firefox 0/0 ms at both sizes. Two-frame medians were
Chromium 22.8/22 and 22.3/25.9 ms, Firefox 13/15 and 25/23 ms. These two-frame
measurements are rendering proxies, not proof of settled layout. The broader
migration and final acceptance audit remain incomplete.

Card height observation now retains a replacement Root's observer when the Root
changes synchronously during observer installation. A regression test first
reproduced the leaked replacement observer and now checks its cleanup; another
test moves the same card regions between Roots, verifies pending height writes,
and rejects callbacks from the old observer. The observation lifetime is kept in
its own module, while the component supplies opaque region identities.
Workspace build and type checks passed; lint passed with 623 warnings. React
passed 896 tests, and six browser behavior cases passed in Chromium and Firefox
with 12 workers. Eight serial production-preview performance cases passed at
normal size and `repeat=200`. Trackpad synchronous medians before/after were
Chromium 1.5/1.5 ms normal and 1.6/1.6 ms large, Firefox 2/2 ms at both sizes;
two-frame medians were Chromium 16.8/16.8 and 17.2/17.1 ms, Firefox 32/33 and
32/32 ms. Typing synchronous medians were Chromium 0.5/0.7 and 2.8/0.1 ms,
Firefox 0/0 ms at both sizes. Typing two-frame medians were Chromium 22/21 and
25.9/25.4 ms, Firefox 15/13 and 23/23 ms. Sample ranges overlapped; two frames
do not prove layout has settled. Full migration and acceptance remain open.

Edgeless geometry rendering now captures a host's opaque region identity in a
React mounting callback. The hook reads live transform preview declarations from
the mounted Root rather than retaining or inspecting the HTML host. Its public
result has a named type and exposes the identity ref for consumers such as card
height observation. When no matching mounted Root exists, it uses model geometry.
The card, visual, group-hit, and creation-preview consumers were inspected along
with Root attachment and stale-region behavior; the ref contract change is
recorded in the breaking-change notes.
Workspace build and type checks passed; lint passed with 623 warnings. Root
passed 433 tests, React passed 897, and 12 production browser cases passed in
Chromium and Firefox with 12 workers, covering rotation, mid-resize rerender,
creation, and card auto-height. Four serial keyboard-resize performance cases
passed at normal size and `repeat=200`. Synchronous medians before/after were
Chromium 13.2/12.8 ms normal and 22.4/23.8 ms large; Firefox 10/11 and 20/20 ms.
Two-frame medians were Chromium 27.6/27.6 and 27.1/28.8 ms, Firefox 22/23 and
35/38 ms. Sample ranges overlapped; two-frame timing does not prove settled layout.
The remaining Root migration and complete acceptance audit are still outstanding.

Connector reconnect controls now capture opaque identities in React mounting
callbacks instead of retaining button elements. Their existing Root input
subscriptions, pointer capture, and cleanup remain attachment-scoped. The
mounting callbacks, listener registration, deselection, cancellation, and Root
replacement paths were inspected separately from tests.

Workspace build and type checks passed; lint passed with 623 warnings. React
passed 898 tests, and four connector highlight/reconnect cases passed in both
browsers at normal size and `repeat=200` using 12 workers. Four serial production
preview reconnect timing cases also passed. Synchronous medians before/after
were Chromium 0.4/0.3 ms normal and 0.4/0.5 ms large, Firefox 0/0 and 1/1 ms.
Two-frame medians were Chromium 16.5/16.5 and 16.6/16.6 ms, Firefox 16/17 and
16/16 ms. Ranges overlapped; two frames do not establish settled layout. The
remaining migration and full acceptance audit are incomplete.

Panel removal now attempts routing notification, deactivation, selection cleanup,
and parent focus restoration even when an earlier cleanup fails. Root-change
notification attempts later subscribers after a failure, including during
registration rollback. Replacement identity checks still protect a panel installed
reentrantly during cleanup. Tests in `__tests__` reproduce a selection-cleanup
failure, cover multiple failures and rollback notification, and verify that a
replacement remains active. Registration ownership, routing notification,
selection cleanup, focus restoration, and destruction were reviewed separately
from the tests.
The workspace build and type checks passed; lint passed with 623 warnings. The
full React suite passed 902 tests before extracting the parent-focus helper; 12
focused lifecycle and focus tests passed after that final refactor. Six event and
embedding behavior cases passed in Chromium and Firefox with 12 workers. Eight
serial Page and Edgeless typing cases passed at normal size and `repeat=200`.
Synchronous medians before/after in milliseconds were Chromium Page 0.1/0.1
normal and 1.2/1.2 large, Edgeless 0.7/0.5 and 2.4/0.1; Firefox Page 0/0 at
both sizes, Edgeless 0/1 at both sizes. Two-frame medians were Chromium Page
21.3/20.6 and 27.9/33.9, Edgeless 22/23 and 19.8/27.1; Firefox Page 16/16 and
13/15, Edgeless 14/15 and 27/26.
One Chromium large Page run had a two-frame median of 33.9 ms versus 27.9 ms
before; three isolated repeats produced nine samples with a 29.9 ms median and
26.5–33.8 ms range, overlapping the baseline's 27–29.8 ms range. The changed
code runs during panel registration/removal rather than normal typing; these
two-frame measurements do not establish settled layout or isolate teardown cost.
The remaining Root migration and final acceptance audit are incomplete.

Undo/redo, selection deletion in Page and Edgeless, keyboard block movement,
and clipboard cut/paste now carry the originating input registration through
post-edit focus and selection work. Reentrant edits that replace a registration
no longer transfer that work to the replacement. The registration owner, event
and keyboard delivery, synchronous document changes, deferred selection, and
clipboard document and surface routes were inspected separately from tests.
New tests in `__tests__` cover the registration lifetime; prior assertions were
not changed.

Workspace build and type checks passed; lint passed with 628 warnings. The React
suite passed 917 tests and 18 Chromium/Firefox behavior cases passed with 12
workers. Sixteen serial production-preview undo and selection-deletion timing
cases passed at normal size and `repeat=200`. Undo synchronous medians
before/after (ms) were Chromium Page 1.4/1.4 normal and 7.6/7.6 large, Edgeless
2/2.2 and 6.5/8; Firefox Page 1/1 and 8/8, Edgeless 2/1 and 10/10. Selection
deletion medians were Chromium Page 1.7/1.7 and 6.5/6.4, Edgeless 3/4.1 and
10.5/8.9; Firefox Page 2/2 and 4/4, Edgeless 3/3 and 15/14. Two-frame timings
were noisier: the first Chromium normal Page undo median was 17.9/31.4 ms with
non-overlapping samples; three isolated repeats yielded 17–31.6 ms and overlapped
the 17.2–18.6 ms baseline. Normal Page deletion frame medians were 28/29.1 ms in
Chromium and 24/25 ms in Firefox, also with non-overlapping three-sample ranges.
Two frames do not prove layout has settled. Clipboard and block-move timing was
not measured separately in this comparison. The registry still creates a second
Root per registration, so the single-Root migration and final acceptance audit
remain incomplete.

The panel now publishes its current input registration separately from its Root,
including to availability subscribers when routing changes without an unmount.
Staging, notification, disable/re-enable, failed registration, and destruction
were checked along with Edgeless marquee and transform-control consumers. Those
consumers capture the registration so old controls cannot start or continue work
on a replacement while its mounted Root stays attached. Existing constructor test
fixtures were updated to supply the required lifetime without changing their
assertions; new tests live in `__tests__`.

Workspace build and type checks passed; lint passed with 631 warnings. The full
React suite passed 923 tests, and ten focused cases passed after the final fixture
and naming changes. Fourteen Chromium/Firefox Edgeless behavior cases passed
with 12 workers. Eight serial production-preview selection-clear and keyboard
resize timing cases passed at normal size and `repeat=200`. Synchronous medians
before/after (ms) were Chromium selection clear 2.1/1.5 normal and 1.9/1.8
large, resize 13.8/13.1 and 30.1/26.6; Firefox selection clear 0/0 and 1/1,
resize 11/12 and 26/21. Corresponding frame or rendered medians were Chromium
26/23 and 21.4/22.9, resize 27/26.6 and 35.4/32.1; Firefox 25/26 and 22/23,
resize 25/22 and 37/37. Sample ranges overlapped. Marquee timing itself was not
measured and frame timing does not establish settled layout. Transform controller
cleanup and gesture internals still rely on registration-owned Root identity;
they need migration before removing the duplicate Root and completing the audit.

Edgeless transform controls and active gestures now capture the routing lifetime,
including delegated pointer admission, focus and marker preparation, preview,
commit, and cleanup. Controls registration uses its own identity so an old cleanup
cannot remove a replacement that reuses the same Root and Moveable handle. Cleanup
captures old preview resources before callbacks can start another gesture, restores
geometry when registration expires, and still attempts resource release if the
registration check throws. Existing direct-controller tests now pass the required
lifetime; their assertions remain unchanged. New tests in `__tests__` cover stale
controls, focus, commit, marker and pin cleanup, and failed validity checks.

Workspace build and type checks passed; lint passed with 636 warnings. The full
React suite passed 930 tests before the final validity-error cleanup guard; 20
focused tests passed after it. Fourteen Chromium/Firefox transform behavior cases
passed with 12 workers. Eight serial production-preview shape and attached-connector
transform timing cases passed at normal size and `repeat=200`. Connector sample
medians before/after (ms) were Chromium synchronous 1.2/1.2 normal and 1/1.1
large, two-frame 16.1/16.2 and 16.4/16.2; Firefox synchronous 2/2 and 2/1,
two-frame 16/16 and 15/15. The shape case collected one sample per size and
browser; its synchronous values were 1.2/1.2 and 1.2/1 ms in Chromium, 2/1 and
1/2 ms in Firefox, with rendered values between 15 and 16.1 ms. These short
samples do not prove settled layout or a general performance improvement. Other
consumers still rely on registration-owned Root identity, and the single-Root
migration and full acceptance audit remain incomplete.

Slash sessions and todo prompt candidates now capture their input registration.
Deferred matching, session execution, focus restoration, and prompt conversion
reject an expired registration even while the mounted Root remains attached.
Todo decoration cleanup may use a replacement registration only after confirming
that it owns the same content host. Input delivery, candidate and menu lifetime,
command transactions, host revalidation, and cleanup were reviewed separately
from the behavioral tests. New regression cases were added to existing suites in
`__tests__`; existing assertions were not changed.

Workspace build and type checks passed. Lint passed with 639 warnings before the
test-suite consolidation, and lint of the consolidated test files passed. The
first default React test run exhausted its 4 GB JavaScript heap; all 934 tests
passed with a 6 GB heap. Consolidating the new cases into the existing suites
then allowed the default command to pass all 934 tests as well. Twelve Page,
Edgeless, and embedded Chromium/Firefox behavior cases passed with 12 workers.
Sixteen serial production-preview slash-input and todo-prompt timing cases passed
at normal size and `repeat=200`. Slash synchronous medians before/after (ms) were
Chromium Page 3.5/2.7 normal and 14.4/11.8 large, Edgeless 3.7/3.7 and 8.7/10.2;
Firefox Page 1/1 and 1/2, Edgeless 2/2 and 12/11. Todo conversion synchronous
medians were Chromium Page 3.3/3.2 and 16.1/21, Edgeless 6.4/6.1 and 10.5/11.1;
Firefox Page 5/5 and 11/12, Edgeless 9/7 and 18/18. Chromium large Page todo
input and conversion frame samples initially did not overlap the baseline; three
isolated repeats produced 18–30.5 ms and 57.6–60.9 ms ranges, overlapping the
18.2–20.1 ms and 57.4–61.4 ms baseline ranges. Firefox normal Edgeless input
frames initially did not overlap either; isolated repeats ranged 10–31 ms,
overlapping the 16–17 ms baseline. Two-frame samples do not establish settled
layout. The registry still creates a second Root, and other interactions and the
full acceptance audit remain incomplete.

Page drag now captures the owning input registration for the source and each
receiving occurrence. Expired sources cannot resolve, preview, move, or publish
selection; expired receivers cannot supply geometry, accept a move, or receive
focus. The Page drag attachment observes availability and synchronously cancels
its extension, unregisters the receiver, and notifies foreign sources when input
routing ends. Registration failure, reentrant validity checks, cleanup errors,
source and target replacement, cross-document commit, and selection publication
were reviewed separately from browser behavior. Existing constructor fixtures now
supply a routing lifetime without changing their assertions. New regression cases
and the handle-drag timing fixture are in `__tests__`.

Workspace build and type checks passed; lint passed with 638 warnings before the
final test-helper cleanup, and the affected files passed targeted lint afterward.
The final React suite passed 943 tests. Eighteen Page, Edgeless, and embedded drag
cases passed in Chromium and Firefox with 12 workers. Eight serial production
preview handle-drag timing cases passed on normal and `repeat=200` documents,
with committed order verified. Synchronous medians before/after (ms) were Chromium
Page 0.6/0.9 normal and 1/0.9 large, Edgeless 0.8/0.7 and 0.8/0.9; Firefox Page
1/2 and 2/2, Edgeless 1/1 and 1/2. Two-frame medians were Chromium Page 16/16.1
and 5.7/6.3, Edgeless 16/15.9 and 15.4/15.4; Firefox Page 16/15 and 16/15,
Edgeless 17/16 and 14/13. The initial Chromium large Page frame range did not
overlap the baseline; three isolated repeats ranged 4.9–27.1 ms, overlapping the
5.3–6 ms baseline. The separate 500-mounted-block Page and Edgeless responsiveness
checks passed before and after in Chromium. These timings do not establish settled
layout. Other input consumers still depend on a registration-owned Root; the
single-Root migration and full acceptance audit remain incomplete.

Bullet threading now releases its Page overlay when the captured input registration
expires. Regression tests cover expiry before a frame, during anchor measurement,
on panel disable, and replacement on the same Root. All 947 React tests and eight
Chromium/Firefox behavior cases passed. Workspace type checks and the demo build
passed. Lint reported 640 warnings and zero errors.

All four production-preview timing cases passed their drawing assertions. On
large documents the median synchronous focus duration increased from 10.6 to
34.6 ms in Chromium and from 4 to 13 ms in Firefox. Two other Playwright jobs
using 12 workers each shared the machine during the after run. An isolated
comparison is still needed to determine whether the change affects focus cost.
The registry still constructs and detaches a second Root for each registration.

The registry now installs ReactPanel's mounted Root directly. The registration
token checks the installed entry before and after checking attachment, so
replacement and rollback can change routing independently of the mount.
Unregistering clears routing and pointer ownership. ReactPanel owns detachment.
The active surface remains readable during synchronous removal notifications.
Captured surface reads, event construction, and the slash portal check their
registration before publishing a result.

All 99 panel tests passed after the change. Focused portal, transform controls,
drag receiver, rollback, event attachment, and structural focus tests also passed.
The single-Root identity regression failed before the registry change and now
passes across disable and re-enable. Full acceptance remains in progress.

After updating the affected consumers and fixtures, the full React suite passed
947 tests. Workspace type checks and the demo build passed. Lint reported 641
warnings and zero errors. Chromium and Firefox passed all 34 panel and focus
cases and eight bullet-threading behavior cases. Four serial production-preview
focus cases passed. Median synchronous times in milliseconds at normal and
large sizes were Chromium 1.7 and 13.6, Firefox 2 and 4. A separate browser
suite ran on the host during this timing run. The large Chromium median still
exceeded the earlier 10.6 ms baseline, so an isolated comparison remains open.

Reviewed the rebuilt declaration entry points for Root, Page, Edgeless and React,
including their shared declaration files. Page's BlockEditor ref, React's
surface and editable-host refs, the Edgeless element-style mounting callback,
and CanvasView's viewport ref accept elements at React mounting boundaries.
CanvasViewport.attach accepts its viewport and plane in the browser adapter.
The Range accepted by Page virtualization comes from TanStack Virtual. The
Selection returned by React selection hooks comes from editor core. These
checks cover the named declarations; they do not establish the ownership of
every operation reachable through the public interfaces.

Removed the obsolete registry lookup for a second input Root. All 103 affected
panel and event tests passed, as did the workspace build and the package suites
for Root (433 tests), Edgeless (141), and Page (611). The standalone Page demo
build initially failed on its focus marker. Using the view's captured region
for the marker restored the production demo build.

The declaration audit also inspected inherited React props. EdgelessToolButton
inherited native button events and refs through ComponentProps. Its public
contract now declares the presentation fields and onActivate callback used by
the toolbar. The private click handler invokes onActivate with zero arguments.
A regression in the component's __tests__ directory covers its type contract
and the arguments delivered by an actual button click.

Both standalone production demos passed their browser suites (106 Page and 80
Edgeless cases). The host integration run passed 198 of 206 cases with 12 workers.
Serial reproduction showed Moveable measured its handles before cancellation
restored target geometry. Cleanup now restores every captured target before
stopping and remeasuring the controls, while retaining the guard against a
replacement gesture reusing the handle. All six cancellation cases across both
browsers and four toolbar/properties cases passed on the rebuilt host preview.

The two large Firefox group-transform scenarios passed separately with one
worker on the final preview. The initial eight-case serial retry spanned a
preview rebuild and returned five failures and three passes. The stable final
preview passed the targeted cancellation, toolbar and large-group reruns.
Workspace build, types, core tests, and all 948 React tests passed. Lint
reported 641 warnings and zero errors.

Twelve serial production-preview timing cases passed in Chromium and Firefox,
covering focus, transform movement, and property commit at normal size and
repeat=200. Large Chromium focus initially had a 14.3 ms synchronous median.
Three isolated repeats gave medians of 10.7, 10.7, and 10.4 ms, with individual
samples of 10.4–11.6 ms against the original 10.5–11.3 ms range. Chromium
performance counters in a separate eight-focus sample showed 6.9–8.7 ms of
style recalculation and 2.3–2.6 ms of layout across each measurement interval.
These intervals include the metric reads and are not additive. The repeated
focus timings overlap the baseline. Large property commit medians were 4.8 ms
in Chromium and 9 ms in Firefox. Historical property timings used a different
build, so attributing those differences requires a matched baseline.

The production registry no longer constructs a child Root. The browser package
still publishes a constructor that accepts another BrowserInputRoot and carries
parent-chain ownership checks. The remaining API audit must resolve that path
and its existing lifetime tests before declaring superseded code removed.

### Mounted Root construction and embedding refresh

BrowserInputRoot accepts a mounted HTMLElement. ReactPanel owns the Root and
exposes it for direct input while its captured registration is current.
Registration staging passes only the token back to its owner. The registry
borrows the mounted Root and cannot detach it. A test on two panels sharing an
element reproduced the displaced panel exposing a stale Root before the fix.
Regions can carry a narrower registration lifetime, and synchronous detachment
inside a lifetime check invalidates the operation. Removed the parent chain and
global detachment counter that previously supported nested Root construction.

Embedding settings now dispatch a typed refresh request within one rendered
reference. The body releases its observer when its effect ends. The same source
editor survives a refresh, unsaved form edits stay local, and the lookup runs
again. Page event and keyboard interfaces now live in their owning types.ts
files. Their package exports and behavior are preserved.

The rebuilt browser declaration accepts only HTMLElement in the constructor.
Workspace build, type checks, and lint passed (640 warnings). Unit suites passed
for Root (431 tests), Page (611), Edgeless (141), and React (948). The final
panel browser run passed 34 cases. Of 144 embedding cases, 139 passed with 12
workers, one large Firefox case timed out waiting for the demo surface and
passed with one worker, and four required signaling. All four passed with the
local y-webrtc signaling server.

Matched production builds exercised normal and repeat=200 documents in both
browsers with one worker. Large-document median synchronous durations in ms:

| Interaction | Chromium before | Chromium after | Firefox before | Firefox after |
| --- | ---: | ---: | ---: | ---: |
| Bullet-thread focus | 11.5 | 10.8 | 4 | 3 |
| Property preview | 5.0 | 4.8 | 10 | 9 |
| Loaded embedding refresh | 0.1 | 0.2 | 0 | 0 |

All twelve after-build cases passed. Refresh timing also verifies the resolver
was invoked and the embedded content remains available. These are three-sample
medians. Two frames measure rendering progress and do not prove settled layout.

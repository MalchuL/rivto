# React root event migration audit

This audit records the React event transport migration. Event consumers
receive copied input and browser capabilities. Root's browser implementation
owns native listeners; React routes normalized input to document panels.

## Routing and listener ownership

Root's internal `BrowserEventListeners` groups by target, event type, capture and passive. A surface
group has one listener per root; document and window groups are shared by roots
in the same realm. It retains unchanged native listeners when registrations
change, so later phases of the current browser event are not silently skipped.
The panel registry resolves the receiving occurrence after the listener fires.
Pointer continuations belong to the occurrence that started the gesture, even
if the pointer crosses a different panel. A root adapter that installs one
document or window listener per occurrence would change these semantics.

Root's `BrowserRoutedEvents` retains registration snapshots and claim state per
opaque dispatch identity across listener groups. The panel factory captures mode, selection and
target context for each group. A handled registration prevents the browser
default unless its definition opts out or its listener is passive; it does not
stop native propagation. Root owns listener setup rollback and teardown; React's
event manager owns the routed event runtime and extension registration cleanup.

## Browser dependencies traced during migration

| Consumer | Input or operation traced | Ownership requirement |
| --- | --- | --- |
| Keyboard transport and action predicates | Copied keys and live target queries arrive through Root and are combined with panel context in React. | Preserve action scope, keymap, held keys and panel ownership as remaining interfaces are narrowed. |
| Page creation, merge, outdent, selection deletion and separator | Predicates use live target capabilities supplied by the current event factory. | Preserve live ancestry and existing block/content marker rules after transport migration. |
| Page indentation and caret navigation | Selection and focus use browser operations alongside the current event routing. | Complete the browser-owned selection and focus boundary while Page retains structural navigation policy. |
| Clipboard | Synchronous data and target capabilities are captured from native delivery; Firefox may dispatch to body. | Keep document-level routing and existing structural-selection eligibility. |
| Edgeless selection and movement | Consumers use normalized pointer data; React resolves the receiving panel. | Preserve target queries, private hit testing and gesture ownership across panels. |
| Edgeless transform | Moveable's integration needs browser-specific drag start. | Keep native interaction inside the browser integration and expose only resulting transform capabilities. |
| Slash menu, todo prompt and visual property controls | Consumers use content, focus and selection capabilities produced by browser context. | Preserve occurrence-bound identity and deferred-work cleanup as the transport changes. |

`EditorEvent` and `KeyboardEditorEvent` no longer expose native events or elements.
The clipboard extension now consumes only the normalized target capability; its
previous native-event helper was used exclusively by its tests and was removed.
The private Root browser listener receives native events; the React event
manager and `PanelEventFactory` receive normalized input and the event name.
The panel registry receives normalized names and opaque identities, and Root owns
its shared document pointer state. Shared capture boundaries start pointer-owner
snapshots for each native dispatch, including redispatch and nested occurrences.
`BrowserEventListeners` is no longer exported. The browser entry exposes the routed
owner instead, while normalization and native listener groups stay private to Root.
Keep custom event
publishing with its producer or lifecycle owner, separate from extension-facing
registration and observation.

The multi-occurrence listener group, capture, and control contracts now come from
Root's portable entry rather than its browser entry. Capture borrows only an
attachment check; the browser implementation privately resolves the selected
Root's native element. React's event manager constructs and owns the Root routed
event runtime, and the panel registry selects the receiving registration. Root
owns grouped delivery and claims without acquiring panel selection policy. The
panel factory receives only pointer ownership operations; browser default
cancellation remains with the routed event runtime.

React event values now supply normalized mouse data and live target queries for
mouse deliveries, as well as normalized pointer input. The browser registration
test filters its specific button through that target capability and confirms a
different button does not invoke the handlers. Native capture stays private in
Root; React receives only a synchronous normalizer for its selected occurrence.

Input delivery and panel selection now capture the same content host through
Root. React supplies block and occurrence selectors; Root owns the browser text,
caret, geometry and decoration operations. Deferred prompt cleanup relies on comparing those
captures by identity; a replacement host must compare differently, and detaching
the panel must invalidate the originating input root. The regression in
`packages/react-rivto-editor/src/managers/events/__tests__/content-occurrence-identity.test.ts`
protects that contract after both capture paths moved behind Root together.

## Standalone surface registration paths

| Path | Normalized input and operations | Policy owner and verification |
| --- | --- | --- |
| Page event handlers and regional observers | Root supplies the input name, target queries, modifiers, coordinates, and synchronous default control. An observer tied to a rendered block captures its region by opaque identity. | Page resolves occurrence scope before delivery and reconnects observers on attachment changes. [Event implementation and tests](../packages/rivto-page/src/editor/events/) |
| Page keyboard actions | The transport supplies key, code, modifiers, composition, and target context to semantic actions. | Root matches shortcuts and tracks held keys. Page decides which block action applies. [Keyboard transport and tests](../packages/rivto-page/src/editor/keyboard/) |
| Canvas event and keyboard registrations | Canvas uses Root's event registrations, custom payloads, keyboard input, target capabilities, and group-local claims. | Nested canvases retain independent registrations. The input controller owns its attachment and releases delivery on teardown. [Canvas browser integration and tests](../packages/rivto-edgeless/src/browser/) |
| Canvas tools and transforms | Tools get pointer data, coordinates, modifiers, and cancellation. The private drag adapter supplies the native input required by Moveable. | The viewport owns coordinate conversion. The tool owns its gesture and cancels it when the attachment expires. [Tool gesture tests](../packages/rivto-edgeless/src/browser/__tests__/canvas-tool-gesture-detached.test.ts) |

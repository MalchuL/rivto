# Rivto root

The root package contains a generic typed event dispatcher and the semantic
keyboard runtime. Page, Canvas, and the React host use the same dispatch engine
while retaining their own routing and ownership policies.

The default entry point has no DOM event or element types. Keyboard dispatch
accepts normalized key data, and transports supply the platform modifier.
The separate browser entry currently exposes native listeners for existing
Page and Canvas adapters. Page and Canvas registrations expose normalized input;
Page still uses private native context internally, and React's public event APIs
still need normalization.

## Source layout

- `src/events/` owns the framework-neutral event dispatcher and event contracts.
- `src/keyboard/` owns semantic keyboard actions, shortcuts and held-key state.
- `src/browser/events/` connects browser and custom registrations to dispatch.
- `src/browser/input/` owns native listener attachment and input normalization.
- `src/browser/keyboard/` detects the browser's primary shortcut modifier.

Tests live in the owning directory's `__tests__/` folder. `src/index.ts` and
`src/browser.ts` remain the public package entry points; the nested directories
are internal.

## Keyboard runtime

`KeyboardRuntime` owns semantic registrations, effective keymaps, inventory,
conflict reporting, priority dispatch, and IME policy. It has no React, document,
panel, or surface-mode dependency. Hosts supply a `KeyboardTransport` and a
`KeyboardResourceOwner`; host scope filters and inventory metadata stay in that
transport. The host owns runtime destruction; extensions own registration disposers.

`HeldKeys` tracks ordinary keys and modifier flags without consuming input.
`HeldKeyBinding` captures effective shortcuts for one gesture while reading live
physical state. Transports must reconcile pointer modifiers and reset held state
on window blur, hidden document, and detach. Page installs this transport; the
original React editor retains its existing event routes through its own adapter.

`register`, `delete`, `list`, `subscribe`, `replaceKeymap`, and
`setKeymapOverride` preserve semantic action IDs. Empty overrides disable an
action; unknown IDs remain visible as orphan overrides. Equal priorities retain
registration order. A true handler result claims input; the host transport owns
native default prevention. Runtime teardown attempts every disposer and reports
cleanup failures together.

Run `pnpm --filter @chulane/rivto-root test`, `check-types`, `lint`, and `build`
from the workspace. The package publishes ESM and declaration files.

## Event dispatcher

`EventDispatcher<Events>` accepts an event map so callers can register typed
custom names and payloads. Registrations use unique IDs and optional priorities;
handlers may return `"handled"`, and observers cannot claim an event. Disposers
are idempotent. A delivery snapshot can span multiple phases: additions wait
for a new delivery and removals immediately deactivate captured callbacks.

The browser entry also retains single-root native attachment, rollback and cleanup
for the current Page and Canvas integration. It remains a browser-specific API;
the migration to normalized event payloads has not been completed.

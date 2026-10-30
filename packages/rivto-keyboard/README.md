# Rivto keyboard runtime

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

Run `pnpm --filter @chulane/rivto-keyboard test`, `check-types`, `lint`, and `build`
from the workspace. The package publishes ESM and declaration files.

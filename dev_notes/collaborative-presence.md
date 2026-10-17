# Collaborative presence in Rivto

## Existing implementations reviewed before integration

The implementation reuses Yjs mechanisms rather than introducing another presence
protocol or storing a transient-looking map inside the persisted document.

| Implementation                                       | Existing capability                                                                                        | Decision for Rivto                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `y-protocols/awareness` 1.0.7 (MIT)                  | Transient JSON state, connection IDs, clocks, heartbeat, expiry, departure messages                        | Use directly inside `crdt-doc/src/yjs-doc`; add a direct dependency already present in the lockfile                                               |
| Yjs 13.6.31 relative positions (MIT)                 | Character-relative anchors that resolve after concurrent text operations                                   | Use through adapter-neutral text methods; reject anchors for another text                                                                         |
| `y-webrtc` 10.3.0 (MIT)                              | Accepts an existing awareness instance and transports its changes                                          | Pass document-owned awareness; preserve local state after its disconnect/destroy behavior                                                         |
| AFFiNE/BlockSuite remote-selection widgets (MPL-2.0) | Separate document and edgeless presentation, typed selections, viewport projection, remote identity colors | Architectural reference; the widgets depend on BlockSuite's store, selection model, Lit and Gfx runtime, so they are not drop-in React components |
| `y-prosemirror` cursor plugin (MIT)                  | Relative selection mapping and ProseMirror decorations                                                     | Reference for stable selection boundaries; cannot reuse directly without ProseMirror's document/view binding                                      |
| Lexical `SyncCursors` (MIT)                          | Relative positions, remote caret overlays, text highlights, modern CSS Highlight support                   | Reference for text geometry and cleanup; depends on Lexical nodes and DOM mapping                                                                 |

Sources inspected:

- [Yjs awareness and presence](https://docs.yjs.dev/getting-started/adding-awareness)
- [Yjs awareness API](https://docs.yjs.dev/api/about-awareness)
- [Yjs relative positions](https://docs.yjs.dev/api/relative-positions)
- [BlockSuite document remote selection](https://github.com/toeverything/blocksuite/blob/5cb5cb68471ca692f3c162258f0087cb22fcb82d/packages/affine/widgets/remote-selection/src/doc/doc-remote-selection.ts)
- [BlockSuite edgeless remote selection](https://github.com/toeverything/blocksuite/blob/5cb5cb68471ca692f3c162258f0087cb22fcb82d/packages/affine/widgets/remote-selection/src/edgeless/index.ts)
- [ProseMirror cursor plugin](https://github.com/yjs/y-prosemirror/blob/f73c051df9b31a375679acd9e24455ebfc5ddf22/src/cursor-plugin.js)
- [Lexical cursor implementation](https://github.com/facebook/lexical/blob/cb21da40de69c1eedc2b9ec60001fef0d3b1770a/packages/lexical-yjs/src/SyncCursors.ts)

The reviewed ProseMirror development branch uses newer `@y/*` imports; those APIs
are not substituted for the repository's Yjs 13 dependency. No BlockSuite,
ProseMirror, or Lexical implementation code was copied into Rivto. Their runtime
and model dependencies would be larger than the required Rivto-specific binding.

CSS Highlight was considered for text ranges. This version uses DOM Range
rectangles for text and the same clipped overlay as carets, pointers and object
outlines. This avoids a second global highlight/style registry and works with the
existing panel DOM boundaries. It does not mount virtualized text or modify the
native selection to paint someone else's range.

## Public usage and ownership

```tsx
const reactEditor = createReactEditor({
  editor,
  extensions: [
    standardPreset(),
    ...edgelessPreset(),
    collaborationExtension({
      user: { id: "user-42", name: "Vlad", color: "#7c3aed" },
    }),
  ],
});
```

Import `collaborationExtension` and `CollaborationUser` from
`@chulane/rivto-react` or its `extensions` entry. Include the usual editor
stylesheet. The host still attaches BroadcastChannel or WebRTC providers through
its existing document storage setup. Installing the extension does not create a
server, attach providers, or authenticate a display identity.

User IDs and names must be nonempty, names at most 128 characters, IDs at most 512
characters, and colors six-digit hex values. Connection IDs are separate from
host user IDs, so two tabs of one user do not overwrite one another.

`CRDTDoc.collaboration` exposes connection identity, `setLocalState`, `getStates`,
and `subscribe`. `DocumentModel.collaboration` exposes the same adapter-neutral
capability. Returned states are detached. Presence subscriptions do not emit
document-change notifications. The channel is reserved for the extension's
complete local presence record while that extension is installed; it is not an
API for independently overwriting that record from multiple features.

Yjs owns one lazily created Awareness instance per adapter. It lives beside the
Y.Doc, not in a Y.Map. Native encoded snapshots, portable model snapshots, JSON
serialization, clipboard forests and undo scopes therefore contain no presence.
The snapshot version remains unchanged. Destroying the document destroys the
Awareness instance and its heartbeat timer.

`CRDTText.createRelativePosition` / `resolveRelativePosition` provide opaque string
tokens. `document.blocks.createTextPosition` / `resolveTextPosition` provide
block-scoped access without exposing native Y.Text. These operations read text;
they do not create history items or mutate persisted content.

## Transport lifecycle

BroadcastChannel exchanges awareness alongside the existing document handshake,
relays changes and heartbeats without echoing to their source, and sends departure
on disconnect. Reconnection increments the local awareness clock before sending
state so peers accept it after a departure. Disconnecting the last provider also
clears locally cached remote states.

WebRTC receives the same document-owned awareness instance. Its options now omit
the upstream `awareness` option: that resource belongs to the document. Room/key
initialization is awaited. Upstream y-webrtc removes local presence both during
`disconnect()` and during asynchronous room destruction; the wrapper restores the
captured local state after both operations. Other transports may briefly observe
a departure/reappearance, but their final state retains the local user.

Abruptly lost clients expire through Awareness's existing approximately 30-second
timeout; normal extension teardown and provider departure are immediate messages.
No second retry, clock, heartbeat, or expiration mechanism was added.

## Visible behavior

- The active panel publishes its selection. Panel instances share publisher
  ownership, so disposing an inactive panel cannot erase another panel's state.
- Window blur, a hidden tab, panel deactivation and active-panel disposal withdraw
  presence. Pointer exit removes only the pointer.
- Pointer movement coalesces geometry reads and publication to one update every
  50 ms. Selection changes publish immediately.
- Edgeless pointers use canvas coordinates. Document pointers use stable block IDs
  and fractional coordinates inside the block. Pointers are rendered only in the
  matching mode and only when the referenced content is mounted. Outside blocks,
  document pointers use panel content coordinates in CSS pixels, including the
  surface's own scroll offset. Ancestor scrolling is accounted for by surface
  bounds. Scrolling republishes the stationary pointer against current content;
  exiting the surface discards its position so later scrolling cannot revive it.
  Whitespace coordinates follow the panel layout rather than a text anchor, so
  differently sized panels can place them over different content.
- Text and structural block selections are rendered in either mode where the same
  content exists. Element outlines are rendered in edgeless mode. Plugin-owned
  selection namespaces are not broadcast.
- Text selection boundaries use CRDT relative positions. Start boundaries follow
  the next character; non-collapsed end boundaries follow the preceding character.
  Inserts at the outside edges therefore do not expand the selected text.
- Completed native keyboard and pointer gestures are captured before delayed
  browser `selectionchange` events. Remote text changes can then restore an active
  local caret through the existing panel restoration scheduler. New local
  selection changes supersede pending restoration; IME composition retains control.
- Remote text selection reveals raw Markdown source in the affected mounted block.
  Rivto edits source text but normally displays formatted Markdown when idle; using
  source geometry avoids placing a caret at the wrong formatted character. The
  formatted preview returns when remote text selection leaves that block.
- Presence overlays are non-interactive, clipped to the receiving panel, and do
  not autofocus, scroll to peers, or install remote values in local selection.

## Limits

A deleted or replaced text container cannot resolve its old anchors. Block
split/merge currently moves characters through the existing insert/delete
operations rather than preserving their original CRDT item identities. Presence
is updated by the editing peer's next selection event; this change does not add
semantic anchor migration across those operations.

Cross-mode pointers are deliberately absent because document flow and canvas
coordinates have no general mapping. Object outlines use rendered screen-space
bounds. Remote drag previews and collaborator-following are outside this feature.
Peer input is validated before rendering, including finite coordinates, bounded
strings/arrays and hex colors. This is display validation, not authentication or
transport access control.

Native WebRTC data-channel connectivity between separate machines, signaling
availability, TURN/NAT traversal, Safari and Electron are not established by the
local browser checks. The WebRTC-provider browser test exercises its same-origin
cross-tab path with signaling deliberately unavailable.

## Validation

Focused tests cover transient snapshots/history/notifications, detached state,
late join, departure, reconnect, multiple-provider awareness restoration, expiry,
relative position convergence and boundary association, deleted targets, and
invalid peer display data. The WebRTC lifecycle unit test models upstream's two
awareness-removal phases; actual browser integration uses the real provider.

During initial unit-test exploration, native y-webrtc's asynchronous broadcast
teardown left a Node BroadcastChannel handle open. The deterministic lifecycle
unit double avoids depending on that browser transport in Jest; this is not a
claim that upstream Node transport cleanup has been repaired.

Browser coverage uses real pointer/keyboard input where it establishes the
behavior: document and edgeless pointers/carets/ranges, cross-mode selection,
local-caret movement after a remote edit, structural selections, canvas geometry,
shared-panel disposal, and WebRTC-provider presence across tabs. Direct manager
calls are used only to create remote edits and structural fixtures.

The Chromium caret regression initially failed both parallel and serial checks.
The native gesture capture fix addresses that race; the initial failure was not
classified as environmental.

### Completed checks

- `pnpm test`: 360 tests passed across the five core workspace packages.
- `pnpm --filter @chulane/rivto-react test`: 418 tests passed. Focused new suites
  were run again after their final changes.
- `pnpm check-types`: passed across core, React, demo and docs. The final demo
  production build also typechecked the final runtime code.
- `pnpm build` and `pnpm demo:build`: passed; bundlers retain their module-directive
  and large-chunk warnings.
- Lint: no errors after fixing an unused test variable; max-function-length
  warnings remain, including existing repository warnings and longer test cases.
- Chromium and Firefox: 22 behavioral cases passed with `--workers=12`; the final
  strengthened zoom assertion also passed in both browsers.
- Dedicated production-build performance: 8 cases passed with `--workers=1`.
- Document and edgeless overlays were inspected in Chromium screenshots.

The multi-block test initially used Ctrl+Shift+End, which stays inside one editable
host. A plain cross-block drag selects whole blocks by Rivto convention; partial
text selection uses Shift+Alt drag. The final test uses that existing gesture and
asserts selection cleanup after deleting the selected targets. Initial failures
were rerun serially before correcting the fixture; they were not silently retried.

### Performance measurements

Measured on the built demo served by Vite preview on dedicated port 5183, with
normal demo settings and virtualization unchanged. `repeat=0` contains two writing
blocks and `repeat=200` contains 202, rendered in both synchronized peers. Each row
uses five warmed real-pointer samples after one discarded warmup.

End-to-end timing starts at the pointer event and ends two animation frames after
the remote pointer's DOM update. It includes the intentional 50 ms publication
throttle and is a rendering proxy, not a claim about physical display latency.
Synchronous time measures the presence publication call including its synchronous
subscribers. Firefox's coarser timing resolution can report zero for sub-millisecond
calls.

| Browser  | Mode     | Repeat | Remote DOM + two frames, median (range), ms | Synchronous publish, median (range), ms |
| -------- | -------- | -----: | ------------------------------------------: | --------------------------------------: |
| chromium | Page     |      0 |                           99.8 (99.7–100.0) |                           0.1 (0.0–0.1) |
| chromium | Page     |    200 |                            99.1 (82.5–99.4) |                           0.1 (0.0–0.1) |
| chromium | Edgeless |      0 |                            99.8 (99.7–99.8) |                           0.2 (0.1–0.2) |
| chromium | Edgeless |    200 |                            99.2 (98.5–99.7) |                           0.2 (0.1–0.2) |
| firefox  | Page     |      0 |                          100.0 (99.0–100.0) |                           0.0 (0.0–0.0) |
| firefox  | Page     |    200 |                          100.0 (99.0–100.0) |                           0.0 (0.0–0.0) |
| firefox  | Edgeless |      0 |                          100.0 (99.0–101.0) |                           0.0 (0.0–2.0) |
| firefox  | Edgeless |    200 |                         100.0 (100.0–101.0) |                           0.0 (0.0–2.0) |

Every scenario recorded **zero full-forest reads and zero document notifications**
during pointer updates. Remote pointer/caret DOM and the intended single marked
text host were asserted as well, so an inactive publisher cannot pass the timing
check. The measured initial 83–101 ms baseline informed a 250 ms warm-sample bound
with scheduling headroom; correctness and zero-document-work assertions remain
independent of that timing budget.

These are small/large results for the new feature, not an asserted speedup over a
previous cursor implementation. There was no equivalent pre-feature remote-pointer
path to time. No remote-network latency, Safari, or desktop performance is claimed.

## Panel whitespace follow-up

The original page publisher sent `pointer: null` outside a block. The new browser
regression reproduced that disappearance in Chromium and Firefox with 12 workers
and again with one worker before the fix. It now checks blank panel space,
retained text caret, stationary-pointer scrolling, and exit without resurrection.
The fixture extends the surface height to make its empty area scrollable.

After the change, all 20 collaboration behavior cases passed with 12 workers and
all 12 performance cases passed serially against the production build on port 5183. The latter include page whitespace at normal size and `repeat=200`.
Whitespace input-to-render medians (five warmed samples, including the 50 ms
throttle and two frames) were 99.8 ms / 98.9 ms in Chromium, with ranges
99.7–99.9 / 98.9–99.1 ms, and 100 ms / 100 ms in Firefox, with ranges
100–101 / 99–101 ms. Median synchronous publication was 0.1 ms in Chromium and
0 ms at Firefox's timer resolution. All cases recorded zero full-forest reads
and zero document notifications. Existing block/canvas pointer medians remained
99–100 ms, compared with 99.3–100 ms before the change.

The demo production build (including typechecking), three presence state unit
tests, formatting, and focused lint passed; lint retains the long performance
test warning. Safari and Electron were not tested for this follow-up.

## Smooth remote pointer movement (initial CSS implementation)

Reviewed [Liveblocks' animation comparison](https://liveblocks.io/blog/how-to-animate-multiplayer-cursors)
and [`perfect-cursors`](https://github.com/steveruizok/perfect-cursors). Both describe
interpolating sparse network positions; splines can better reconstruct curved
paths at the cost of buffering and additional machinery. For the existing 50 ms
publisher interval, this implementation uses a native 80 ms linear CSS transform
transition. No dependency or extra network traffic is added. New positions
retarget the current transition; initial appearance and removal remain immediate.
Carets and selection rectangles are not animated. A stable pointer key prevents
selection changes from replacing the animated DOM node. The system's
`prefers-reduced-motion: reduce` setting disables the transition.

Four new browser cases sample actual intermediate screen positions in page and
edgeless modes, retain the pointer node across selection changes, and check
reduced motion and removal. All four failed before the fix in Chromium and Firefox
with 12 workers and again serially because no intermediate positions existed.
Afterward all 24 collaboration behavior cases passed with 12 workers.

Performance sampling now waits for the computed transform to reach its target
before the final two frames, so its result includes the full transition rather
than only arrival of the target style. All 12 serial production cases passed at
normal size and `repeat=200`, with zero document updates and full-forest reads.
The production demo build includes typechecking; focused lint and formatting pass
with long-test warnings only. Safari, Electron, and highly irregular remote
network delivery were not tested. Fixed-duration linear transitions do not
reconstruct curved trajectories during long gaps between network packets.

A serial comparison used the same build, fixtures and sampling with only the
pointer transition disabled by a temporary test stylesheet. With animation,
warmed medians across the six scenarios were 192.0–195.6 ms in Chromium
(sample range 184.8–200.7 ms) and 190–194 ms in Firefox (184–201 ms). Without
animation, Chromium medians were 108.3–111.1 ms (101.6–116.6 ms); Firefox samples
were 67–116 ms. This is intentional visual settling time, not extra synchronous
publication work: median publication remained 0.1–0.2 ms in Chromium and 0 ms at
Firefox's timer resolution with animation. All 12 baseline cases passed too.

## Exponential smoothing follow-up

The CSS implementation above is superseded by a requestAnimationFrame controller.
React passes incoming positions only as targets; the controller is the sole owner
of the displayed transform. Each frame uses `alpha = 1 - exp(-elapsed / 20)`
with elapsed time in milliseconds, then advances the current point toward its
latest target. Changing targets, including direction reversals, neither resets
the displayed point nor restarts an active animation clock. Using elapsed time
makes the decay independent of display refresh rate.

Animation stops within 0.25 CSS pixels of the target, leaving the interpolated
point in place instead of performing a final snap. First appearance and reduced
motion remain immediate. A live preference change cancels any pending frame;
unmounting releases both the frame and preference listener. Per-frame writes
update only the DOM transform, without React state, model mutation or network
publication.

The browser regression now checks deceleration, in addition to intermediate
positions. It failed against the prior CSS build in both Chromium and Firefox,
with 12 workers and again serially. All 24 behavior cases passed against the EMA
build with 12 workers. Three deterministic unit tests cover reversal without a
jump, 60/120 Hz equivalence, resting without a final snap, reduced motion and
cleanup. The production demo build includes typechecking; formatting and focused
lint pass, with function-length warnings.

The performance sampler now waits for two unchanged rendered transforms before
its final two frames. This works for both CSS transitions and controller-owned
transforms, and measures complete settling rather than merely receiving a target.

The initial 25 ms time constant exceeded the existing 250 ms settling budget in
four serial scenarios; reducing it to 20 ms shortened the tail without changing
the budget or snapping to the target. With the same sampling before and after,
all 12 final serial production cases passed (normal document and `repeat=200`).
Final Chromium medians were 207.7–211.8 ms, with sample range 201.1–228 ms,
compared with CSS medians 223.4–227.4 ms (205–233.6 ms). Firefox medians were
206–219 ms (202–230 ms), compared with CSS medians 202–231 ms (200–232 ms).
All cases recorded zero document updates and full-forest reads. Median
synchronous publication was 0.1–0.2 ms in Chromium and 0–1 ms in Firefox.

One structural-selection case failed in the final parallel run and passed when
rerun serially in both browsers. The test now awaits the remote caret from the
initial click before replacing that selection, avoiding a race with deferred
native selection synchronization. Safari, Electron and irregular remote network
latency remain unverified for the EMA follow-up.
After that test synchronization change, the complete 24-case behavior run passed
again with 12 workers in Chromium and Firefox.

## Local typing caret regression

The original collaboration implementation incorrectly restored stale relative
anchors over the browser's newer native caret. A content patch also used
`assignText`, deleting and reinserting the entire CRDT text; anchors into deleted
items resolved to offset zero. Existing sync typing cases predominantly appended
to blocks and asserted text, while the remote-caret case used a direct insertion.
Neither covered a character typed in the middle followed by deferred restoration.

The new regression reproduced offset zero instead of five after the first
character in page and edgeless modes, in Chromium and Firefox, both with 12 workers
and serially. A separate cross-peer content-patch anchor test also failed at zero.

`updateBlocks` now delegates content patches to the existing minimal-range
`setBlockText`, preserving unchanged items and anchors. The restoration callback
also compares the live DOM range with the captured core range before queuing work;
a native caret already moved by input owns the selection and cannot be replaced
with stale anchors. No public contract or snapshot shape was added.

Regression coverage checks the caret after every typed character and two frames,
Backspace, replacement of selected text, and native text insertion without keyup.
It asserts complete local and peer text. The remote-insertion test now additionally
checks caret movement after the other peer uses the ordinary content-patch API.
All 634 unit tests passed across document-model (94), core (118), and React (422).
Workspace typechecking, the production demo build, formatting and focused lint
passed, with existing function-length warnings.

The first browser run passed all 32 cases with 12 workers. After extending the
native-input and remote-patch assertions, 31 passed and one Firefox WebRTC
peer-close cleanup assertion timed out; that case then passed serially in both
browsers. The timeout is recorded rather than classified as a pre-existing issue.
Safari/Electron and a real OS IME were not tested in this follow-up.

All eight typing performance cases passed serially on the production preview at
port 5183, with ordinary and `repeat=200` documents and both modes. Five warmed
samples followed one warmup. Chromium small/large medians were 30.6/29.3 ms in page
mode (ranges 28.5–30.7/27–30 ms) and 30.6/29.6 ms in edgeless mode
(29–31/27.7–30.1 ms). Firefox medians were 30/39 ms in page mode
(27–31/25–41 ms) and 29/40 ms in edgeless mode (29–32/39–41 ms).
Timing starts at real beforeinput and ends after two frames with the expected
text and caret checked on every character. Median synchronous content updates
were 0.2–0.3 ms in Chromium and 0–1 ms in Firefox, with six updates for six typed
characters and zero full-forest reads. No valid before-fix typing latency is
reported because the baseline failed the caret correctness assertion.

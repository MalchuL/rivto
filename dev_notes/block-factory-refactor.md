# Block factory contract refactor

The React editor now uses `BlockFactory` for writing creation, recognition, and
emptiness, and for registered separator creation. The migration preserves existing
interaction policies and persisted data shapes.

## Public API

- `BlockFactory` provides `createEmptyBlock()`, `isBlock(block)`, and
  `isEmptyBlock(block)`. Emptiness receives a flat `EditorBlockNode`, including
  props, list props, plugin data, and child IDs.
- `editor.defaultWritingBlockFactory` replaces the separate `createDefaultBlock` and
  `isEmptyBlock` fields. `installDefaultWriting(factory)` restores the previous
  contract when disposed, including the uninstalled throwing contract.
- `defaultWritingBlockExtension({ factory })` replaces the separate creation and
  predicate options. The existing native `type` option still controls registration.
- General React block registration has no factory field, storage, or lookup API.
  Separator registration retains its existing `separatesBlockElements` metadata.
  Automatic insertion reads the registered separator type and uses a matching pure
  factory; ordinary block registration and reset have no per-type factory dependency.
- `@chulane/rivto-react/block-factories` exports the contract, `createBlockFactory`,
  `paragraphBlockFactory`, and `separatorBlockFactory` without React runtime imports.
  Package build/watch entries and source-consumer aliases include the new subpath.

## Preserved behavior

The built-in emptiness policy remains matching native type plus empty text. It
ignores children and properties, as before. Generic reset retains its nonempty-text
short circuit, the writing predicate, and existing conversion rules. Custom types
retain the text-only fallback; specialized `onResetEmpty()` behavior may refuse reset
for meaningful state. The installed writing predicate is consulted once for eligible
empty candidates, without an additional per-type factory lookup.

Separator insertion still reuses any empty childless block. Keyboard selection
fallback still uses text emptiness. Clipboard and reset retain their type-only use
of writing creation; they do not begin applying previously ignored factory fields.
Markdown export, container type checks, and persisted snapshot versions are unchanged.

App initialization and production demo/seed construction use factories. Dedicated
test-harness fixtures remain explicit. Chulane seed JSON was compared byte-for-byte
against the original implementation for empty, plain-text, heading, checkbox, and
numbered-list input.

Original behavior-test assertions and expectations are unchanged. One existing test setup
mechanically moves its original host predicate into a factory object. Eight separate
contract tests cover defaults, writing restoration, separator metadata cleanup,
custom behavior reset refusal, predicate short circuiting, and conversion preservation.

## Initial implementation verification

- Baseline: six focused React suites, 40 tests passed; production demo build passed.
- Final React suite: 67 suites, 415 tests passed. The last fixture-only adjustment
  was followed by all eight contract tests passing again.
- Focused core clipboard/block-manager suites: 37 tests passed.
- Workspace `pnpm check-types`, `pnpm build`, `pnpm demo:build`, and `pnpm lint`
  passed. Lint reports warnings; both new source/test files pass focused lint
  without warnings. `git diff --check` passed.
- Published pure-entry runtime imports were traversed: no React or other external
  runtime dependency is imported by that entry point.
- Nine focused Playwright files ran in Chromium and Firefox with 12 workers.
  Initial run: 93 passed, one Firefox journal-navigation failure; that test passed
  with one worker. After the reset correction: 93 passed, one Chromium partial-text
  clipboard failure; that test passed with one worker. Neither parallel run was
  fully green, and serial passes do not establish the cause of those failures.
- Chulane's separate type check fails on three existing snapshot-version `6` versus
  `9` mismatches. Compiling the original snapshot source reproduced all three.
  The standalone desktop renderer has the same version mismatch at New Document;
  an isolated checkout of its original source reproduced that failure too.

## Initial production interaction measurements

Measurements used the same dedicated Vite preview port, production builds,
default demo settings, Chromium and Firefox, and `repeat=0` / `repeat=200`.
Performance runs were sequential, without concurrent builds or browser tests.
Each operation had one warm-up and three recorded samples, with undo between
samples. Fixture loading was outside the timing.

Enter and separator insertion used actual keyboard shortcuts. Multiline paste used
real pointer/caret setup followed by the same DataTransfer/ClipboardEvent approach
as existing clipboard tests, rather than the OS clipboard. Assertions checked
root-count changes, selected text for paste, DOM caret identity, and undo root count.

Command duration measures synchronous keyboard dispatch or paste-event dispatch,
including synchronous subscribers. Completion duration measures two animation frames,
with caret correctness checked afterwards; it is a rendering proxy rather than a
complete async-layout measurement.

Values are median [minimum-maximum] milliseconds, before → after.

| Browser  | Repeat | Interaction        | Synchronous command                 | Two frames                                |
| -------- | ------ | ------------------ | ----------------------------------- | ----------------------------------------- |
| chromium | 0      | Enter              | 1.5 [1.4-1.7] → 1.3 [1.3-1.4]       | 28.0 [27.5-28.1] → 28.5 [28.3-28.5]       |
| chromium | 0      | Separator shortcut | 1.2 [1.2-1.3] → 1.3 [1.2-1.4]       | 28.2 [28.1-28.5] → 28.1 [28.0-28.2]       |
| chromium | 200    | Enter              | 21.9 [21.9-31.0] → 20.0 [19.5-23.4] | 339.2 [333.0-353.4] → 325.9 [322.5-327.6] |
| chromium | 200    | Separator shortcut | 24.4 [22.5-24.9] → 21.1 [20.5-21.9] | 337.6 [333.1-370.9] → 325.0 [321.6-348.5] |
| firefox  | 0      | Enter              | 2.0 [2.0-3.0] → 3.0 [2.0-4.0]       | 26.0 [24.0-27.0] → 25.0 [25.0-26.0]       |
| firefox  | 0      | Separator shortcut | 2.0 [2.0-3.0] → 2.0 [1.0-2.0]       | 25.0 [25.0-26.0] → 26.0 [25.0-27.0]       |
| firefox  | 200    | Enter              | 33.0 [33.0-35.0] → 35.0 [33.0-36.0] | 373.0 [366.0-390.0] → 403.0 [383.0-404.0] |
| firefox  | 200    | Separator shortcut | 38.0 [38.0-39.0] → 36.0 [35.0-37.0] | 395.0 [391.0-408.0] → 404.0 [370.0-411.0] |
| chromium | 0      | Multiline paste    | 1.4 [1.4-1.8] → 1.7 [1.6-1.8]       | 26.0 [24.8-27.1] → 25.7 [25.4-26.1]       |
| chromium | 200    | Multiline paste    | 21.6 [21.5-22.7] → 21.9 [21.2-22.4] | 325.8 [322.9-329.2] → 329.8 [321.4-331.8] |
| firefox  | 0      | Multiline paste    | 2.0 [2.0-2.0] → 3.0 [1.0-3.0]       | 20.0 [19.0-23.0] → 20.0 [19.0-20.0]       |
| firefox  | 200    | Multiline paste    | 38.0 [33.0-38.0] → 40.0 [40.0-41.0] | 423.0 [376.0-425.0] → 385.0 [366.0-421.0] |

The large default fixture already took hundreds of milliseconds to complete these
interactions before the refactor. These small samples do not establish a speedup;
command timings remain in the same general range, and rendering measurements vary.
Desktop runtime behavior and application builds blocked by the existing version
mismatches remain unverified.

## Removal of general block factories on 2026-10-15

Removed the generic factory field from `ReactBlockRegistration`, the manager's
factory map, and `BlockTypesApi.getFactory()`. Those three block-type modules now
match their original implementation. Writing keeps its dedicated
`defaultWritingBlockFactory`; separator commands keep their own pure factory.
Automatic separator insertion uses the existing registered separator type and
`createBlockFactory(type)` without introducing another registry or public API.

Generic custom reset again has only its original text/writing eligibility checks.
Customization belongs to `onResetEmpty()` behavior. The tests introduced for generic
factory registration were updated to cover existing separator metadata lifecycle
and behavior-based reset refusal; original behavior tests were not weakened.

Verification after the final runtime change:

- 67 React suites, 415 tests passed.
- Workspace type checks and React package/demo builds passed.
- Targeted lint passed with existing function-length warnings and no errors.
- 64 focused Playwright checks passed in Chromium and Firefox with 12 workers;
  no serial retries were needed.
- Real-keyboard Enter, separator insertion, and Backspace reset were measured in
  sequential production-preview runs, at default size and `repeat=200`.
  Each operation used one warm-up and three recorded samples, with undo between
  samples. Command and two-frame timings use the methodology above.
- Reset measurements converted the first root into an empty demo Slider with a
  meaningful range value, plugin data, and a nested child. Backspace preserved
  its ID, properties, plugin data, and child IDs while changing its type to writing;
  the caret returned to the same ID, and undo restored the Slider.
- `git diff --check` passed. Native desktop checks were not rerun for this removal.

Values are median [minimum-maximum] milliseconds, before → after this removal.

| Browser  | Repeat | Interaction        | Synchronous command                 | Two frames                                |
| -------- | ------ | ------------------ | ----------------------------------- | ----------------------------------------- |
| chromium | 0      | Enter              | 1.6 [1.4-1.6] → 1.5 [1.4-1.6]       | 26.5 [26.3-26.9] → 28.1 [28.0-28.4]       |
| chromium | 0      | Separator shortcut | 1.4 [1.3-1.5] → 1.2 [1.1-1.2]       | 26.3 [26.1-27.1] → 28.5 [28.4-28.6]       |
| chromium | 200    | Enter              | 23.1 [22.0-23.1] → 22.3 [20.6-31.8] | 403.1 [402.4-409.2] → 339.2 [336.7-348.4] |
| chromium | 200    | Separator shortcut | 22.5 [21.3-23.3] → 23.9 [21.8-24.7] | 352.6 [350.6-384.0] → 386.3 [339.9-414.7] |
| firefox  | 0      | Enter              | 2.0 [1.0-3.0] → 3.0 [2.0-4.0]       | 25.0 [24.0-25.0] → 25.0 [24.0-27.0]       |
| firefox  | 0      | Separator shortcut | 2.0 [2.0-2.0] → 2.0 [2.0-3.0]       | 25.0 [25.0-25.0] → 27.0 [24.0-28.0]       |
| firefox  | 200    | Enter              | 39.0 [38.0-40.0] → 35.0 [35.0-35.0] | 418.0 [417.0-441.0] → 389.0 [365.0-399.0] |
| firefox  | 200    | Separator shortcut | 40.0 [38.0-42.0] → 40.0 [38.0-41.0] | 408.0 [387.0-437.0] → 385.0 [377.0-399.0] |
| chromium | 0      | Backspace reset    | 1.0 [1.0-1.0] → 1.0 [1.0-1.2]       | 29.1 [28.7-29.5] → 29.7 [29.4-30.0]       |
| chromium | 200    | Backspace reset    | 20.1 [19.9-21.5] → 20.3 [19.2-23.4] | 185.2 [182.5-205.1] → 171.9 [170.6-181.0] |
| firefox  | 0      | Backspace reset    | 1.0 [1.0-2.0] → 2.0 [2.0-2.0]       | 27.0 [26.0-28.0] → 26.0 [26.0-28.0]       |
| firefox  | 200    | Backspace reset    | 15.0 [14.0-16.0] → 16.0 [15.0-22.0] | 43.0 [42.0-44.0] → 43.0 [42.0-51.0]       |

These samples show comparable synchronous command costs and variable rendering
times. They do not establish a performance improvement.

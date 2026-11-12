# HTML surface review

- [x] Scope editing state to its owner and release it when no longer needed.
- [x] Remove demo sample identifiers from package behavior and choose a package-owned block type.
- [x] Document the public HTML bridge and sandbox boundaries.
- [x] Reject non-JSON objects in the bridge and cover them with tests.
- [x] Narrow panel dependencies at HTML command and draft consumers.
- [x] Correct incomplete or inaccurate documentation in the affected implementation.
- [x] Run focused behavior, type, lint, build and browser/performance verification; record results.

The review identified several issues inherited from the demo implementation; their promotion into the editor package makes them part of this change.

## Verification so far

- JSON regression failed before the fix and passed afterward. HTML extension Jest suites and all 23 demo tests pass.
- React package and demo type checks pass. HTML extension ESLint has no errors and one function-length warning. The React package and demo builds pass.
- Playwright HTML surface: 12/12 passed with 12 workers; 36/36 passed serially over three repetitions in Chromium and Firefox, including normal and `?repeat=200` fixtures.
- A React integration test mounts two independent editor runtimes with the same block ID, opens one editor, and unmounts it while the other remains mounted. It fails against the reconstructed module-global store because both editors open, and passes with the scoped store. The editing-state unit test checks release after the final observer.
- A dedicated Chromium production-preview comparison used the same current fixture and restored the earlier module-global editing store in a temporary baseline. Five samples followed a warmup. For normal / `repeat=200` fixtures, median synchronous block updates were 1.0 / 1.4 ms before and 1.3 / 1.4 ms after; median click-to-Pause was 56.0 / 85.0 ms before and 56.6 / 83.5 ms after. Median click-to-source-editor was 48.5 / 220.0 ms before and 48.2 / 218.4 ms after. These click timings include Playwright and are not isolated render measurements; the temporary baseline reconstructs the old state store, not the whole original checkout.
- Renaming the block type from `demo.html` to `html` affects previously saved demo documents; no migration was requested.

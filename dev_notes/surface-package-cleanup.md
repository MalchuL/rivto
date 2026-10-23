# Surface package cleanup

## Ownership pass

- Page owns block DOM selection conversion, directed endpoints, and structural navigation.
- Edgeless owns canvas marquee gesture state and overlay lifecycle.
- React owns persisted block/card projection, group policy, selection writes, native admission,
  concrete content, and card creation transactions.
- Grid spotlight styling remains host presentation; isolate its scheduling from card creation.

## Consumer and lifecycle pass

- Keep the public React DOM selection read/restore bridge; use Page's implementation.
- Remove unused host DOM helpers; move endpoint callers to the existing Page implementation.
- Keep occurrence lookup in React, where panel boundaries are known. Centralize mounting there;
  Page virtual roots and host canvas-card projection implement their respective mount paths.
- Navigation must use displayed model roots and selection must retain offscreen blocks while
  excluding root separators hidden by the edgeless projection.
- A mounted host overlay owns and releases one package marquee instance. It supplies captured
  geometry/group policy and commits selected IDs to the host runtime.
- The viewport owns one spotlight instance and cancels its pending frame on detach.

## Implementation and verification pass

1. Capture the production demo baseline and reproduce the selection/navigation regressions.
2. Consolidate Page selection, endpoint callers, and mounting/navigation.
3. Extract marquee state and DOM lifecycle; isolate spotlight scheduling.
4. Review all changed declarations, narrow dependencies, and cleanup paths.
5. Run focused unit tests, package builds/type checks/lint, browser checks in Chromium and
   Firefox (12 workers, failed cases rerun serially), and serial normal/large interaction timings.

No changes to persisted shapes, block definitions, command ownership, or dependencies are planned.

## Implemented ownership

- `BlockDOMSelection` and `BlockSelectionEndpoints` now provide the shared conversion
  and restoration algorithms. React retains the public read/restore bridge and its
  mutable core-selection conversion. Obsolete host hit-testing helpers and gesture
  records were removed.
- `BlockNavigation` owns displayed-root traversal. React's `PageNavigationController`
  owns panel lookup, scroll anchoring, and delegation to Page virtualization or the
  canvas-card adapter. Vertical caret movement and text extension use the whole
  displayed occurrence; structural moves and horizontal editing keep card boundaries.
- `PageSelection` observes mode and definition changes and excludes edgeless root
  separators while retaining nested separators and offscreen content.
- `CanvasMarquee` owns captured geometry, slop, intersection, and rectangle lifecycle.
  `EdgelessSelectionController` owns host admission, group mapping, canonical selection
  writes, and registration rollback/cleanup. `EdgelessGridSpotlight` separately owns
  viewport measurement and animation-frame cancellation; card insertion stays transactional
  in the existing host surface controller.
- Page virtualization borrows only `selection.get` to retain canonical endpoints if
  Firefox temporarily loses a native anchor. Intermediate selected blocks remain unmounted.
- Removed React's unused direct `react-moveable` dependency using pnpm. Edgeless retains
  the dependency and owns the transform control implementation.

The final ownership review covered creation, constructor dependencies, React hooks,
input registrations, selection/clipboard/navigation callers, exports, and destruction.
Borrowed managers expose only the operations used. No document-model dependency was
introduced into Page or Edgeless, and neither package owns host document mutations.

## Verification

- Reproduced hidden-separator selection and missing adjacent-card mounting in focused
  unit regressions before fixing them.
- React: 91 suites / 566 tests passed; after the final virtualization change, the
  affected surface/controller rerun passed 13 suites / 40 tests.
- Page: 26 suites / 191 tests passed. Edgeless: 9 suites / 40 tests passed.
- Browser behavior: 96 selection/edgeless/navigation cases passed in Chromium and
  Firefox with 12 workers. A stale direct-child selector initially failed in both
  browsers and on serial rerun; the assertion was updated to the current rendered
  structure and passed in both browsers.
- Six additional virtualized/nonvirtualized selection cases passed. Firefox initially
  lost the mounted anchor and failed serially; canonical endpoint pinning fixed it.
  The strengthened regression checks both native endpoints against model endpoints.
- Eight serial performance/behavior cases passed on the production preview. Dedicated
  runs used default demo settings, normal size and `?repeat=200`, one warm-up and
  three measured marquee samples. No builds or other tests ran during timing.

Marquee timing, milliseconds; each cell is median (minimum–maximum):

| Browser / size    | Core selection write before | After         | Pointer to two frames before | After            |
| ----------------- | --------------------------- | ------------- | ---------------------------- | ---------------- |
| Chromium / normal | 0.1 (0.1–0.2)               | 0.1 (0–0.1)   | 16.4 (16.3–16.5)             | 16.3 (16.3–16.5) |
| Chromium / +200   | 0.1 (0.1–0.2)               | 0.1 (0.1–0.2) | 16.1 (15.4–16.1)             | 15.8 (15.1–16.2) |
| Firefox / normal  | 0 (0–1)                     | 1 (0–1)       | 17 (16–17)                   | 17 (15–17)       |
| Firefox / +200    | 0 (0–1)                     | 0 (0–0)       | 22 (20–27)                   | 19 (15–19)       |

Large Chromium rotated-drag end-to-end samples varied from roughly 53 to 99 ms.
A serial CDP diagnostic measured 24–27 ms of browser task work, including 8–9 ms
of script, 7–8 ms of style recalculation, and under 0.3 ms of layout; instrumented
end-to-end samples were 53–64 ms. This does not establish a drag speedup or a stable
regression. The diagnostic test was removed; raw logs remain outside the repository.

The full workspace browser suite and full migration were not validated. The focused
lint run has no errors; existing long-function warnings remain in surrounding code.

# Performance optimization investigation v2

## Scope and method

Measure the production demo with its default Page settings at `?repeat=0` and `?repeat=200`. Preserve document contents, selection, hierarchy, geometry, and existing virtualization defaults. Compare equivalent serial browser runs, verify actual input and rendered results, and keep a candidate only when behavior remains correct and measurements support it. Track discarded experiments here as well.

## Candidates

1. **Block-element placement:** profile the deterministic search for non-overlapping canvas frames during startup; test a way to skip impossible candidates without changing the first valid position.
2. **Block insertion validation:** measure repeated enumeration of all existing IDs during bulk seeding; investigate a bounded collision check that preserves validation and transactional behavior.
3. **Page scrolling with a stationary pointer:** profile native hit testing, hover feedback, and paint; test only changes that preserve immediate handle and nested-editor behavior.
4. **Large Page initial rendering:** profile root and block render/measurement work without enabling virtualization or changing default geometry; test removal of redundant work.
5. **Edgeless scrolling:** compare camera notifications, card loading and height writes with normal and large fixtures; retain changes only if the real input path improves without changing momentum or card geometry.

## Results

The results below include retained changes, discarded prototypes, and measurement limits.

### Baseline: production Chromium

- Three profiled cold-page runs: `repeat=0` 277–288 ms, median 288 ms; `repeat=200` 2307–2414 ms, median 2310 ms. The large fixture had 2,649 block contents and 65,897 DOM nodes. Loading times include CPU-profiler overhead.
- One 30-wheel Page sweep: normal median 16.7 ms to two animation frames, maximum frame 16.8 ms; large median 27.9 ms, maximum frame 66.8 ms, four frames over 50 ms. Both moved to the expected scroll position. These samples are noisy and synthetic, not proof of physical trackpad behavior.

### Candidate 2: insertion collision checks — retained

`validateInsertedForest` copied every existing block ID into a set for each insertion, although validation only calls `has`. It now passes the existing CRDT map through a narrow `has` contract. This preserves duplicate and existing-ID preflight before writes, including detached stored records. A regression test failed before the change because it observed `keys()` calls and passes after it for both 10 and 2,000 existing blocks; it also checks insertion and duplicate rejection.

On the same profiled Chromium load harness, `repeat=200` changed from 2307–2414 ms (median 2310) to 2174–2229 ms (median 2194); `repeat=0` changed from 277–288 ms (median 288) to 258–278 ms (median 273). Both builds rendered 2,649 / 49 block contents respectively. These are three samples, not a guarantee for other devices.

### Candidate 1: skip blocked frame positions — discarded

A prototype skipped ranges of candidate positions guaranteed to overlap the same occupied frame. A deterministic work test failed before the prototype and passed afterward; 200 generated frame layouts matched the original first-free position. With the collision-check improvement already applied, profiled Chromium `repeat=200` changed from median 2194 ms (2174–2229) to 2175 ms (2156–2196); `repeat=0` changed from median 273 ms (258–278) to 289 ms (283–290). The 19 ms large-fixture difference is too small relative to noise and the extra geometry complexity. The prototype and its tests were removed.

### Candidate 4: disabled-windowing geometry — discarded

The Page controller read `documentElement.scrollHeight` on scroll even when windowing was disabled. A focused test reproduced that read, and a prototype skipped the geometry attachment when disabled while preserving it when enabled. The three large-fixture wheel sweeps after the prototype had median-to-two-frame values of 28.2, 29.6, and 26.3 ms, compared with the baseline's 27.9 ms; maximum frame gaps were 50–83.3 ms versus 66.8 ms. All three normal-fixture medians were about 16.7 ms. Because this did not establish a scroll improvement and changed attachment lifecycle, the prototype and tests were removed.

### Candidate 5: Edgeless wheel delivery — no change retained

Serial production-preview `edgeless-trackpad-performance.spec.ts` passed all four Chromium/Firefox normal and `repeat=200` cases. Chromium synchronous medians were 1.5/1.6 ms and two-frame medians were 16.8/17.3 ms; Firefox synchronous medians were 2/2 ms and two-frame medians were 32/32 ms. The tests also verified camera displacement, return position, and bounded control scans. Pixel-mode events are deliberately applied directly to preserve trackpad momentum; no change to event coalescing is justified by these measurements. This does not reproduce physical trackpad behavior.

### Candidate 4b: offscreen root content visibility — discarded

A temporary browser-only stylesheet applied `content-visibility: auto` and `contain-intrinsic-size: auto 40px` to root wrappers. Three Chromium large-fixture loads improved from 2142–2224 ms (median 2147) to 1803–1870 ms (median 1815), with the same 2,649 block contents and 2,425 root wrappers. However, initial document height changed from 106,107 to 108,515 px and changed again during scrolling (106,167 versus 108,684 px). The guessed intrinsic heights alter scroll geometry, so this was not added to source. No virtualization or layout default was changed.

### Candidate 3: reuse the previous native hover hit — discarded

In the large Page, a 30-wheel sweep with the pointer over blocks reached 2900 px and produced a 26.5 ms median to two frames, with one frame above 50 ms; moving the pointer outside the block surface produced an 8.2 ms median and no frames above 50 ms. Instrumented `elementFromPoint` calls were usually under 1 ms but three took about 9–10 ms. This identifies a useful correlation, not a proven sole cause.

A browser-only prototype reused the previous hit while its bounding rectangle still contained the pointer. Three baseline sweeps had maximum frame gaps of 50, 66.7, and 66.8 ms; cached-hit sweeps had 66.7, 50, and 66.7 ms, with 16.7 ms medians in both groups. This did not demonstrate a reliable win, and a cached rectangle cannot detect an overlapping control or nested editor that becomes the real hit. The experiment was discarded; the implementation continues to use native hit testing.

### Candidate 4c: share Markdown highlighter setup — retained

A source-mapped startup profile showed repeated highlight.js language registration. Each non-plain Markdown block caused `rehype-highlight` to create and register its own lowlight instance even when it contained no code fence. The experiment shares one configured synchronous transformer across Markdown processors, retaining the same language detection, plain-text exclusions, and per-document tree processing.

With candidate 2 already applied, three profiled Chromium loads changed from 2174–2229 ms (median 2194) to 1642–1712 ms (median 1694) at `repeat=200`; normal loads changed from 258–278 ms (median 273) to 257–265 ms (median 258). The DOM and content counts were unchanged. A browser regression verifies separate JavaScript and Python blocks retain independent highlights when one changes; it passed Chromium and Firefox. Further package and integration checks are pending.

A separate wheel-path prototype moved a duplicate camera read into the zoom-only branch. Its 18 controller tests and four browser cases passed, but Chromium normal/large medians remained 1.5/1.6 ms synchronous and 16.7/17.3 ms to two frames; Firefox remained 2/2 ms and 32/32 ms. Maximums varied between runs. The prototype was removed because it showed no measurable improvement.

### Final Page scroll samples

After the retained candidates, three large-fixture 30-wheel sweeps had median two-frame values of 31.6, 27.8, and 26.1 ms, with maximum frame gaps around 66.6–66.7 ms. The initial baseline was 27.9 ms and 66.8 ms respectively. Normal-fixture medians remained 16.7 ms. These measurements do not establish an improvement in Page scrolling; hover and physical-device behavior remain open.

## Final validation and ownership review

- `pnpm build`, `pnpm check-types`, `pnpm demo:build`, full document-model Jest suite (100 tests), and full React Jest suite (610 tests) passed. Workspace lint completed with 505 warnings and no errors; formatting and `git diff --check` passed.
- The complete Markdown browser file passed 44 tests in Chromium and Firefox with 12 workers, including normal and `repeat=200` fixtures and independent highlighted blocks. Eight targeted Page and embedding cases also passed in both browsers. The serial block-number keyboard regression passed all four normal/large Chromium/Firefox cases.
- Final serial Edgeless wheel checks passed four cases. Chromium normal/large synchronous medians were 1.4/1.6 ms and two-frame medians 16.7/17.4 ms; Firefox were 2/2 ms and 32/32 ms. Camera positions and card behavior were asserted.
- Collision validation borrows the existing map's `has` operation; the document manager remains the owner of storage and transaction ordering. Markdown owns a single configured transformer; each processor supplies its own tree and file synchronously. No registration, lifecycle, or teardown capability was added to consumer APIs.
- Full workspace browser coverage and physical trackpad or Safari behavior were not rerun. Page scroll samples remain noisy and do not prove a scroll improvement.

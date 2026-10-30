# Page virtualization switching

## Current implementation: stable block tree

`BlockTree` now owns the window virtualizer and always renders the same keyed root
rows. `virtualization={{ enabled, estimateSize, overscan }}` controls the range;
omitting settings or disabling them renders all roots. Visible embeddings retain
their React state, embedded panel, and source lease through toggles. The separate
VirtualBlockTree and the capture/restore transition helper were removed.

The tree owns one controller and its geometry/list/native-selection cleanup. Host
selection remains canonical. Root lookup for cross-document drag now follows the
protected root ID through the stable row wrappers. List metadata adds one addressed
subscription per root in full mode too; tests retain bounded per-edit read/render
checks and verify release on unmount. SSR renders all roots when windowing is off.

The standalone demo exposes enabled, estimated height in CSS pixels, and overscan
in complete roots. Defaults are enabled when settings exist, 240px, and 3 roots;
the React host retains its existing 40px/8-root settings and threshold control.

Validation: 177 Page unit tests and 11 focused host drag tests pass; 8 host toggle
cases, 18 standalone virtualization cases, and 6 host default/move checks pass
across Chromium and Firefox (including embedding moves in Page and Edgeless).
The previous build fails all four embedding-identity cases in parallel and serial.
Initial invalid test setup used the content row instead of the enclosing block;
only the corrected identity failures count as the baseline.

### Stable-tree production measurements

Serial production runs in Chromium/Firefox with real Space input, one warm-up and
three samples per direction. Values are median [min–max] milliseconds. Commit is
the mutation-observer checkpoint after the mode attribute or rendered range changes;
two frames are a rendering proxy, with an independent zero-drift anchor assertion.
There is no document mutation command in this interaction.

| Browser / size     | Enable commit | Enable two frames | Disable commit   | Disable two frames |
| ------------------ | ------------- | ----------------- | ---------------- | ------------------ |
| Chromium / default | 3 [3–3]       | 25 [24–25]        | 3 [3–3]          | 24 [24–25]         |
| Chromium / 200     | 153 [152–155] | 155 [154–157]     | 1232 [1228–1275] | 1342 [1341–1389]   |
| Firefox / default  | 5 [4–5]       | 13 [12–13]        | 5 [5–8]          | 12 [7–13]          |
| Firefox / 200      | 231 [226–317] | 239 [234–327]     | 1864 [1721–1864] | 1907 [1765–1910]   |

Immediately preceding capture/restore build, same procedure:

| Browser / size     | Enable commit | Enable two frames | Disable commit   | Disable two frames |
| ------------------ | ------------- | ----------------- | ---------------- | ------------------ |
| Chromium / default | 37 [35–44]    | 51 [48–65]        | 35 [33–41]       | 52 [49–54]         |
| Chromium / 200     | 243 [236–254] | 258 [250–268]     | 1214 [1184–1215] | 1372 [1326–1377]   |
| Firefox / default  | 64 [64–73]    | 81 [81–90]        | 63 [63–78]       | 78 [71–93]         |
| Firefox / 200      | 435 [435–630] | 444 [443–639]     | 1670 [1633–1821] | 1772 [1718–1931]   |

Small toggles avoid remounting entirely. Large disabling still mounts all offscreen
subtrees, remains expensive, and Firefox has no demonstrated improvement for that
direction. Full mode retains measurements and metadata for O(R) roots; this is not
constant-space virtualization while disabled. No full-workspace suite was run.

## Earlier capture/restore implementation (superseded)

The Page tree retains its current projection until a layout effect captures its
mounted root heights, visible root offset, and editor-owned native text range.
The next commit seeds the window virtualizer with those measurements and restores
the visible anchor before paint. Disabling restores the anchor after mounting the
full tree. Toolbar focus is not moved into the editor.

`BlockTree` owns the transition helper. It borrows only canonical ordering and
text lengths; it does not mutate panel selection. The helper installs no listeners
or animation frames. Its pending anchor/range are cleared on restoration, and its
geometry seed lives with the virtual projection. `VirtualBlockTree` owns the
virtualization controller, including attachment and cleanup. Initial endpoint pins
use the existing native-focus pin reconciliation. Nested occurrences are excluded
from geometry and selection restoration. No new package or public export is needed.

Enabling is O(R) in currently mounted roots and reads each root rectangle once;
accepted roots' descendants are not traversed. Disabling still mounts all roots
and descendants. Scroll stability does not imply constant-time switching, and
large subtrees remain expensive.

## Verification

- Original production build: all four toggle regressions fail on viewport position,
  both with 12 workers and serial retries.
- Updated production build: all four pass (Chromium/Firefox, default/repeat=200,
  four alternating keyboard toggles per case, less than 2px anchor drift).
- Existing default/off/on virtualization browser check: both browsers pass.
- Page unit suite: 179 tests pass, including native text-range restoration and
  measurement isolation across nested occurrences.
- Page and React host types, Page build and production demo build pass.
- Focused lint: zero errors, one existing long-component warning; diff whitespace
  check passes.

The browser regression uses real Space input on the focused toolbar checkbox;
focus uses preventScroll so reaching the control does not invalidate the viewport
assertion. Native range replacement is tested at the DOM helper level. Full
workspace and Edgeless browser suites are outside this focused Page-only change.

## Production interaction timing

Serial Playwright, no tracing, one warm-up cycle followed by three samples per
mode, real keyboard input, ordinary demo and `repeat=200`. Event-to-DOM-commit is
measured at the mutation observer checkpoint after replacing the projection;
it includes React work and is not an isolated model command measurement (this
operation has no document command). Two animation frames provide a rendering
proxy; each sample additionally checks the projection and visible anchor.

Updated build, median [range] milliseconds:

| Browser / size     | Enable commit | Enable two frames | Disable commit   | Disable two frames |
| ------------------ | ------------- | ----------------- | ---------------- | ------------------ |
| Chromium / default | 40 [36–41]    | 54 [50–62]        | 40 [38–42]       | 55 [55–60]         |
| Chromium / 200     | 248 [240–258] | 262 [255–273]     | 1222 [1190–1223] | 1379 [1343–1380]   |
| Firefox / default  | 67 [64–67]    | 85 [81–85]        | 64 [64–79]       | 80 [79–100]        |
| Firefox / 200      | 439 [428–547] | 449 [436–557]     | 1808 [1648–1852] | 1916 [1735–1938]   |

All updated samples retained the anchor at exactly the original viewport offset.
The old implementation loses the anchor, sometimes unmounting it entirely; its
faster enabling timings are not correctness-equivalent. Initial cold enabling is
covered by the browser regression, not hidden behind the timing warm-up.

Original build under the same measurement procedure (broken anchor behavior),
median [range] milliseconds:

| Browser / size     | Enable commit | Enable two frames | Disable commit   | Disable two frames |
| ------------------ | ------------- | ----------------- | ---------------- | ------------------ |
| Chromium / default | 24 [24–25]    | 32 [28–33]        | 31 [31–43]       | 41 [41–55]         |
| Chromium / 200     | 143 [140–148] | 147 [144–152]     | 1210 [1198–1235] | 1358 [1317–1375]   |
| Firefox / default  | 47 [41–53]    | 62 [52–64]        | 56 [53–70]       | 78 [71–91]         |
| Firefox / 200      | 241 [239–336] | 246 [246–339]     | 1875 [1711–1942] | 1986 [1766–2005]   |

Accurate root seeding increases enabling cost. Full-tree remount dominates disabling
in both builds. These measurements do not claim a speed improvement or a complete
solution to large-document remount latency.

# Page drop behavior parity

Acceptance: one canonical gap and one indicator between adjacent roots (ordinary,
embedding, Bento, Columns, Kanban, Table); full-line universal handle hover;
no root-start fallback for a missed gap; populated-container body drops; no blank
structural header above containers/embedding; legacy indicator appearance.

Ownership review before edits: Page owns root/child-list geometry, native target
resolution and feedback. Hosts declare child layout axes and permissions. Model
hierarchy and commits remain unchanged. Virtual wrappers must be transparent to
sibling discovery, without flattening subtrees or using DOM as model identity.

Implementation review: resolve actual mounted placement siblings through the
stable tree host; unify before/after feedback at the same neighboring gap; expose
container axes through BlockChildren; keep container semantics in host adapters;
overlay empty structural rows while retaining controls; share legacy theme tokens
for feedback. Validate using a mixed-type matrix, actual pointer moves, hierarchy
and undo assertions, then repeat performance on small and repeat=200 documents.

## Implemented and verified

- Stable root virtualization wrappers are transparent to sibling lookup. A missing
  mounted root no longer invents an empty-document destination.
- Root before/after edges share the actual sibling-gap center, including container
  rims that take precedence over child regions. The matrix covers all 36 ordered
  pairs of paragraph, embedding, Bento, Columns, Kanban and Table.
- Host layouts declare `BlockChildren.dropAxis`; Page resolves populated-container
  background and sibling gaps. Both wrapper edges paint the same canonical gap,
  including wrapped Bento rows and RTL. Existing model permission checks still
  decide whether the destination can accept the dragged blocks.
- Empty structural headers overlap their body rather than reserving a blank line.
  Embedded Page margins are reset; populated Bento is no longer styled as empty.
  Controls keep their positioning and pointer access.
- Ordinary Page row hover extends across the line. Container/grid descendants keep
  bounded hit areas. Feedback uses the legacy accent, 4px thickness, rounded line
  and inside tint without installing the legacy Page event handlers.

Behavior: 118 focused Chromium/Firefox tests passed with 12 workers, plus 22 loaded
embedding/cross-document checks (including Edgeless and repeat=200). The original
76 checks failed on the immutable baseline both in parallel and serially; all six
additional Bento shared-gap checks also failed there in parallel and serially.
Intermediate Columns failures reproduced serially before the container-rim fix.
An early preview-start race caused navigation failures; the serial rerun eliminated
those. Embedding tests were updated for the existing virtual root wrappers and for
empty headers that intentionally delegate native hits to their body; model,
undo/redo and cycle assertions were retained.

181 Page unit tests and 11 host drag/occurrence tests passed. Page and React type
checks, both package builds and the production demo build passed. Focused ESLint
reported no errors (existing and new method-length warnings remain). `git diff
--check` passed. This is focused verification, not the full workspace suite.

## API and ownership review

Inspected BlockTree/BlockItem creation and rendering, BlockChildren and all host
layout consumers, outline and registered-target resolution, feedback creation and
cleanup, and Page host drag commits. No new manager, subscription, attachment or
ownership facade was added. `dropAxis` is an optional layout declaration; it does
not authorize a model mutation. `data-block-item-id` identifies mounted placement
geometry only; panel/model selection and canonical destination IDs remain the
source of truth. Native hit testing and nested-occurrence isolation remain active.
The host continues to own container semantics, document transport and commands.

Remaining complexity: mounted root discovery still scans O(R) siblings, while
rectangle lookup for outline gaps is bounded by binary search and adjacent items.
Container background resolution scans immediate mounted siblings, not their whole
subtrees. No spatial index, full-document cache or schema changes were introduced.

## Production interaction measurements

Immutable before/after demo previews, Chromium and Firefox, serial real pointer
input, tracing disabled. Default demo documents and extensions were retained at
normal size and `?repeat=200`; three addressed fixture roots were inserted before
the existing roots. One warm-up and three equivalent measured gestures, each
followed by verified undo. Assertions checked the resulting canonical root order,
one grouped move command, and restoration after undo. Timings are milliseconds,
median with observed min–max. Event durations sum actual native listener time;
frames measure through two RAF callbacks after the event, not total async settling.

| Browser / repeat | Move command before → after   | Pointer down after | Pointer move before → after   | Pointer up after | Two frames after commit before → after |
| ---------------- | ----------------------------- | ------------------ | ----------------------------- | ---------------- | -------------------------------------- |
| Chromium / 0     | 0.8 (0.8–0.9) → 0.9 (0.7–1.0) | 0.2 (0.2–0.3)      | 0.3 (0.1–0.7) → 0.3 (0.1–0.8) | 1.0 (1.0–1.5)    | 31.5 (31.2–31.7) → 31.6 (31.4–32.0)    |
| Chromium / 200   | 2.9 (2.9–4.3) → 3.0 (2.7–3.3) | 0.3 (0.3–0.3)      | 0.3 (0.0–2.5) → 0.5 (0.1–4.5) | 3.8 (3.7–4.4)    | 88.7 (82.6–99.3) → 78.7 (77.5–81.0)    |
| Firefox / 0      | 1 (1–1) → 1 (1–1)             | 0 (0–0)            | 0 (0–1) → 0 (0–1)             | 1 (1–3)          | 31 (31–33) → 31 (30–32)                |
| Firefox / 200    | 12 (11–12) → 12 (11–12)       | 1 (0–1)            | 0 (0–1) → 1 (0–4)             | 12 (12–12)       | 62 (62–62) → 60 (59–61)                |

No public block-forest reads occurred during measured gestures, before or after.
The new ancestor/gap resolution has a small measurable movement cost at repeat=200;
this is a correctness fix, not a claim of universally faster pointer handling.
Large-document commit/render latency remains, including Firefox's approximately
12ms synchronous move and 60ms two-frame proxy. Cold document/root replacement and
large subtree virtualization remount costs are not measured or fixed here.

A second benchmark used an actual populated two-tile Bento instead of the ordinary
upper row, dropping a root between its children. It retained the default container
width/wrapping and asserted exact child order, one grouped command and undo. Same
production browsers, repeat settings and sampling protocol:

| Browser / repeat | Move command before → after   | Pointer move before → after   | Two frames after commit before → after    |
| ---------------- | ----------------------------- | ----------------------------- | ----------------------------------------- |
| Chromium / 0     | 1.1 (0.9–1.2) → 1.1 (1.1–1.2) | 0.3 (0.1–0.8) → 0.3 (0.1–1.2) | 31.3 (31.0–31.8) → 31.1 (30.9–31.4)       |
| Chromium / 200   | 5.1 (5.0–6.6) → 5.6 (4.8–6.1) | 0.5 (0.2–2.6) → 0.5 (0.2–4.2) | 121.3 (118.9–121.4) → 123.5 (122.6–126.8) |
| Firefox / 0      | 2 (1–2) → 2 (1–2)             | 0 (0–1) → 0 (0–1)             | 30 (30–31) → 31 (29–32)                   |
| Firefox / 200    | 14 (14–15) → 14 (14–16)       | 0 (0–1) → 1 (0–3)             | 81 (79–86) → 79 (79–84)                   |

Again, no public forest reads occurred. After-change pointer-down medians were
0.2/0.3ms in Chromium and below Firefox's 1ms clock resolution; pointer-up medians
were 1.5/6.2ms and 2/15ms respectively for normal/large documents. Large Bento commit
rendering remains approximately 124ms in Chromium and 79ms in Firefox. These
measurements do not establish smooth rendering for every large subtree.

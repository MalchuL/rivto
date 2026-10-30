# Edgeless creation defaults

## Ownership

An edgeless surface creates one `EdgelessCreationDefaults` through
`EdgelessToolsProvider`, outside its `SurfaceBoundary`. Extension UI,
portals, operation hooks and transform controls therefore use the same session.
The panel and editor are dependencies, not owners of mutable settings. A standalone
`EdgelessOperations` can receive a session explicitly or create an isolated one.

The session owns `CreationDefaultsStore` instances keyed by registration object
identity. Replacing a registration object starts fresh settings. Weak keys avoid
retaining removed registrations. The session itself ends when its surface unmounts.
Switching tools preserves settings; switching away from and back to the edgeless
surface starts a fresh session. Existing document elements remain unchanged.

`EdgelessToolContext` now retains active/last tool selection and owns the surface
session. Its `EdgelessToolGroup` instances expose shared settings through the same
coordinator, without another palette store or global placement size. See
[Edgeless tools](edgeless-tools.md) for the subsequent class-based refactor.

## Registration

Type and toolbar-group registrations share `RememberedElementProperties`:

- `props`: explicit property names.
- `frame`: explicit `width` and/or `height`; never position, rotation or identity.
- `validate(props)`: optional check of merged settings for explicit settings commands.

Toolbar groups additionally declare `creationDefaults: { props, frame }`.
A type uses `behavior.defaultsGroup` or, if absent, `creation.group`.
There is no inferred policy based on keys present in initial defaults.

Built-in field lists are readonly constants in
`src/elements/visuals/remembered-properties.ts`. The mindmap demo owns its own
constants. The change does not introduce a global registry of every property name.

Shapes share style and dimensions between Rectangle and Ellipse. Rectangle owns
its corner radius. Text, Stickies, Drawing and Connectors each have their own group.
Text content, drawing points, connector endpoints and mindmap nodes are not remembered.
Brush selection still applies its explicit preset.

Settings validation is separate from complete element validation: before drawing,
there are no points, and before connecting, there are no endpoints. The store checks
declared fields and finite positive dimensions; the optional policy checks style
values. Creating or editing document elements still runs full element validation.

## Resolution and commits

Resolution order:

1. Registered element definition defaults.
2. Remembered type properties and dimensions.
3. Group initial settings and remembered group values.
4. Explicit creation input.

A placement factory supplies the initial fallback dimensions. Remembered dimensions
override that fallback for the preview. The final gesture supplies the committed
frame. Click placement, canvas drag and toolbar drag use the same session; drawing
and connector geometry is still derived from the actual gesture.

Creation records declared values from the committed element. Property edits record
only requested keys, using the final normalized values returned by the element
manager. Editing an old rectangle's radius therefore does not restore its old fill
as the current Shapes fill. Resize records final dimensions after a successful
commit; programmatic multi-element resize validates the complete batch before writes.

Previews, cancellation and failed validation do not change memory. Undo/redo updates
the document without rewriting session settings. Registered defaults are never mutated.
Settings changes notify consumers, including sibling operations sharing the session.

## API changes

The old `rememberedProperties: ["color"]` becomes
`rememberedProperties: { props: ["color"] }`.

Read settings with `operations.getDefaults({ type: "rectangle" })` or
`operations.getDefaults({ group: "shapes" })`. Write explicit settings with
`operations.setCreationDefaults(scope, { props, frame })`.
Undeclared fields are rejected by explicit setters and ignored when recording document
commits. The old category-based setter, whole-palette getter and global placement-size
methods are removed. These are API changes; document schemas and persisted content
are unchanged.

## Verification

Unit coverage includes group sharing, type isolation, detached defaults, text exclusion,
changed-field updates, preview/cancel/failure/undo behavior, explicit validation,
notifications, custom registrations, replacement registrations and programmatic resize.
Browser coverage exercises real property/resize handles, creation previews, toolbar
drag and cancellation, fresh sessions after mode changes, custom elements and panel
isolation in Chromium and Firefox. Resize/radius scenarios run at repeat=0 and 200;
serial production-build measurements are compared with the pre-change baseline.

### Results (2026-10-18)

- 534 tests across 79 React suites passed.
- Workspace type checks, React package build, demo production build and formatting passed.
- React lint has no errors and reports 230 non-blocking warnings.
- The 24 affected Chromium/Firefox browser scenarios passed after correcting a new
  test's toolbar toggle sequence. The first parallel run had 22 passes and two test
  timeouts; both timeouts reproduced serially. The corrected drag test passed in
  both browsers. The resize/radius performance scenarios also passed 12/12 serially.
- Complete repository E2E coverage and Safari were not run.

Production Vite preview, one worker, demo defaults, repeat=0 and repeat=200.
Each cell is median [minimum–maximum] milliseconds from three pointer samples.
Sync includes synchronous event subscribers; two animation frames are a rendering
proxy. Correctness assertions check live DOM geometry, unchanged document data
while dragging and the committed result. These samples do not establish a speedup
or measure the release handler independently.

| Browser  | Interaction      | repeat |   Sync before |    Sync after | Two frames before | Two frames after |
| -------- | ---------------- | -----: | ------------: | ------------: | ----------------: | ---------------: |
| chromium | Radius           |      0 | 0.4 [0.3–0.4] | 0.3 [0.3–0.4] |  16.6 [16.6–16.7] | 16.6 [16.5–16.8] |
| chromium | Radius           |    200 | 0.2 [0.2–0.3] | 0.3 [0.2–0.3] |  16.5 [16.5–16.6] | 16.7 [16.6–16.7] |
| chromium | Rectangle resize |      0 | 1.1 [0.9–1.1] | 1.2 [1.1–1.4] |  15.6 [15.5–15.6] | 15.4 [15.1–15.6] |
| chromium | Ellipse resize   |      0 | 1.2 [1.2–1.3] | 1.2 [1.0–1.4] |  15.2 [15.2–15.7] | 15.1 [15.1–15.7] |
| chromium | Rectangle resize |    200 | 1.5 [1.4–1.8] | 1.4 [1.4–1.7] |  15.3 [15.2–17.3] | 13.6 [12.3–15.7] |
| chromium | Ellipse resize   |    200 | 1.6 [1.5–1.6] | 1.4 [1.4–1.7] |  12.7 [12.4–12.7] | 16.9 [16.6–17.5] |
| firefox  | Radius           |      0 | 1.0 [0.0–1.0] | 1.0 [0.0–1.0] |  16.0 [16.0–17.0] | 17.0 [16.0–17.0] |
| firefox  | Radius           |    200 | 0.0 [0.0–1.0] | 1.0 [0.0–1.0] |  17.0 [17.0–17.0] | 17.0 [15.0–18.0] |
| firefox  | Rectangle resize |      0 | 2.0 [1.0–2.0] | 2.0 [2.0–2.0] |  15.0 [14.0–16.0] | 15.0 [15.0–16.0] |
| firefox  | Ellipse resize   |      0 | 2.0 [1.0–2.0] | 2.0 [1.0–2.0] |  16.0 [16.0–17.0] | 16.0 [15.0–16.0] |
| firefox  | Rectangle resize |    200 | 2.0 [2.0–2.0] | 1.0 [1.0–2.0] |  16.0 [15.0–16.0] | 15.0 [15.0–16.0] |
| firefox  | Ellipse resize   |    200 | 2.0 [1.0–2.0] | 1.0 [1.0–2.0] |  15.0 [15.0–16.0] | 15.0 [15.0–15.0] |

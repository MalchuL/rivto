# Edgeless tools

## Reading order

1. `packages/react-rivto-editor/src/managers/edgeless-tools/edgeless-tool.ts`:
   public instance contract, capabilities, lifecycle and local preview subscription.
2. `edgeless-tool-context.ts` in that directory: one surface's instances, default
   selection, group lookup, registration reconciliation and cleanup.
3. `edgeless-tool-group.ts`: group settings through the existing creation-defaults
   coordinator. `edgeless-creation-tool.tsx`: ordinary element placement.
4. `packages/react-rivto-editor/src/surfaces/edgeless/edgeless-tools-context.tsx`:
   React provider and hook, including the shared operations/defaults ownership.
5. `packages/react-rivto-editor/src/extensions/edgeless/visuals/tools/`:
   drawing, connector and eraser gestures; `hooks/use-tool-gesture.ts` is their
   common browser adapter. `register-toolbar.tsx` installs built-in factories.
6. `demo/src/CustomGestureTool.tsx`: a host tool with arbitrary registration IDs,
   a group setting and its own React preview, without central dispatch changes.

## Boundaries

The editor registry stores descriptions and factories. Each mounted edgeless
surface creates an `EdgelessToolContext` containing its operations, defaults,
instances and remembered group selection. `EdgelessToolsProvider` observes registry
and document changes after mount and disposes tools/subscriptions on cleanup.
Neither the panel nor editor owns mutable gesture or settings state. Both remain
available as dependencies for scoped document operations and host integrations.

`EdgelessTool` owns interaction behavior and local preview notifications. The
browser adapter normalizes pointer positions, accepts only primary input, captures
accepted pointers, and releases capture on completion, cancellation or failure.
It delegates geometry and persistence to the instance. Capabilities determine
pointer capture, viewport pan and menu persistence. Toolbar placement belongs only
to `EdgelessCreationTool`; the toolbar binds that class’s creation contract and
checks its `supportsPlacement` flag. The base tool has no element-input or frame
placement methods. The common
adapter, context and toolbar never branch on built-in tool/group/type names.

The default interaction is a registration with `default: true`, not a hardcoded
Select identity. The registry rejects a second default. Reset, removal of an active
registration and failed activation resolve that configured fallback. Removing a
group disposes its dependent instances; replacing a registration creates fresh
instances and settings keyed by the replacement registration object.

Built-in identities are declared in `src/elements/visuals/constants.ts` and exported
as `VISUAL_TOOL_IDS`, `VISUAL_TOOL_GROUPS` and `VISUAL_ELEMENT_TYPES`. Type and group
field policies remain in `remembered-properties.ts`; custom extensions declare
and own their own identities and field lists.

## Creation and settings

`EdgelessCreationTool` implements click placement, canvas drag and toolbar drag.
It retains raw factory input for one prospective element and renders through the
registered element renderer. Preview normalization never becomes creation input.
Snapping and remembered dimensions apply to the draft; only commit inserts the
final element. Cancelling discards local input, geometry and guides.

Existing `elementTypes.register({ creation: { create, ... } })` stays unchanged.
Its internal toolbar registration creates an `EdgelessCreationTool`. A tool with
special interaction registers its own `createTool(options)` factory instead.
Drawing and connector classes derive from the creation class to share effective
type/group settings while owning their own geometric gestures. Eraser and Pan
use the base class. Brush switching still applies the selected brush preset.

`EdgelessToolGroup.getSettings()` and `setSettings()` use the same
`EdgelessCreationDefaults` coordinator as property edits and creation. There is
no copied group palette. Type edits remember their registered fields independently
of which tool is active. Preview/cancellation do not write document or settings;
explicit settings edits and selecting a brush preset may change session settings.
Successful creation, property commits and resize remember only declared fields.
Text content, stroke points and connector endpoints are not remembered.

`renderPreview(zoom)` returns arbitrary React content. A registration can override
it with `preview: Component`. Calling protected `changed()` notifies only that
tool's preview subscribers, not the context or document subscribers. A successful
`pointerUp()` owns gesture cleanup and may retain hover feedback. `cancel()` must
clear local state without persistence. The context calls `deactivate()` before a
switch and `dispose()` when an instance leaves its registration/surface lifetime.

## API changes

- `useEdgelessTools()` exposes the surface context; `active` is a class instance.
- `activate(id)`, `reset()`, `getTool(id)`, `getGroup(id)` and `activateGroup(id)`
  replace tool-selection helpers on `EdgelessOperations`.
- Tool registration uses `createTool` instead of `activate`/`isActive` callbacks.
- `edgeless.tool.set` accepts `{ tools, payload: registeredId }`. Document commands
  retain their existing operations/panel arguments.
- `EdgelessVisualTool` and `EdgelessToolState` are removed. There is no closed union
  or centralized `setDrawingBrush` dispatch to extend for new tools.
- All calls to `useEdgelessOperations()` within a surface share its context's
  operations. Independent surfaces remain isolated.

These changes break the old tool API deliberately. Element registration, document
schema and saved records do not require migration.

## Verification

Unit coverage exercises arbitrary IDs/classes, shared group access, surface
isolation, preview notifications without document/context notifications, fallback
activation, registration removal, unchanged element-registration bridging and
factory reuse through commit/cancellation. Browser coverage adds a host-defined
pointer gesture and React preview, cancellation, commit, undo, another panel and
registration removal, alongside built-in creation/drawing/connector/eraser tests.

The first broad run passed 160 and failed eight tests (four scenarios in both
browsers); all eight failures reproduced with one worker. Pan Escape exposed an
incorrect capture-only guard and now uses the generic configured-fallback check.
Three test expectations were updated to the already accepted behavior: shared
shape-group dimensions, SVG inset for fixed screen-size strokes, and initially
empty text. The text test still verifies select-all and replacement after entering
its own draft. The next broad run passed all 170 scenarios with 12 workers.

Performance measurements use the production demo on a dedicated Vite preview
port, one worker, default configuration at repeat=0 and repeat=200. Setup is outside
timing. Real pointer samples include synchronous subscribers; two animation frames
are a rendering proxy. Correctness checks require unchanged document data during
preview, actual rendered geometry and a committed result. Radius/resize have a
pre-refactor baseline. Creation preview/commit timings were added in this refactor
and have no equivalent pre-refactor baseline, so they do not establish a speedup.

The subsequent broad run on the renamed provider passed 169/170 with 12 workers.
The Firefox Diagrams scenario at repeat=200 reached its 30-second total timeout
while reopening the group. A one-worker rerun passed in 13.3 seconds. The test
budget was not increased, and this result is reported separately rather than
claiming an entirely green final parallel run.

### Final checks

- 538 tests in 80 React suites passed, including deferred/default registration cleanup.
- Workspace types, subsequent affected React/demo types, React package build and
  demo production build passed. Scoped lint has zero errors; its function-length
  and documentation warnings remain non-blocking.
- After the final creation-contract separation and pan capability cleanup,
  30/30 focused browser/performance scenarios passed serially in Chromium and
  Firefox. The separate Pan regression also passed in both browsers with 12 workers.
- One attempted serial run could not connect to the terminated preview server
  (`ERR_CONNECTION_REFUSED`). The server was restarted and its HTTP response checked
  before the final run; that failed setup run is excluded from timings.
- Full repository E2E coverage and Safari were not run. Tool API compatibility is
  intentionally broken; persisted document compatibility is unchanged.

### Production pointer measurements

All values are milliseconds. Radius/resize cells are median [minimum–maximum]
from three real pointer samples, compared with the pre-refactor production build.
These runs show no clear radius/resize timing regression; they do not establish a
speedup. Two frames are a rendering proxy, not a guarantee of asynchronous layout
completion. Both document immutability during preview and the committed geometry
are asserted.

| Browser  | Interaction      | repeat |   Sync before |    Sync after | Two frames before | Two frames after |
| -------- | ---------------- | -----: | ------------: | ------------: | ----------------: | ---------------: |
| chromium | Radius           |      0 | 0.2 [0.2–0.3] | 0.3 [0.2–0.3] |  16.6 [16.5–16.6] | 16.6 [16.5–16.6] |
| chromium | Radius           |    200 | 0.3 [0.2–0.3] | 0.2 [0.1–0.3] |  16.7 [16.6–16.7] | 16.6 [16.6–16.7] |
| chromium | Rectangle resize |      0 | 1.2 [1.2–1.2] | 1.2 [1.1–1.5] |  15.3 [15.2–15.4] | 15.2 [15.1–15.2] |
| chromium | Ellipse resize   |      0 | 1.2 [1.0–1.2] | 1.4 [1.0–1.4] |  15.5 [14.6–15.5] | 15.4 [15.1–15.6] |
| chromium | Rectangle resize |    200 | 1.5 [1.2–1.7] | 1.7 [1.6–1.7] |  13.4 [12.7–16.0] | 14.9 [14.8–15.9] |
| chromium | Ellipse resize   |    200 | 1.4 [1.4–1.6] | 1.7 [1.4–1.8] |  13.9 [13.6–14.6] | 14.7 [14.2–18.7] |
| firefox  | Radius           |      0 | 0.0 [0.0–1.0] | 0.0 [0.0–0.0] |  17.0 [16.0–18.0] | 17.0 [17.0–17.0] |
| firefox  | Radius           |    200 | 0.0 [0.0–0.0] | 0.0 [0.0–1.0] |  16.0 [15.0–17.0] | 15.0 [15.0–17.0] |
| firefox  | Rectangle resize |      0 | 1.0 [1.0–3.0] | 2.0 [1.0–2.0] |  16.0 [15.0–16.0] | 16.0 [15.0–17.0] |
| firefox  | Ellipse resize   |      0 | 2.0 [1.0–2.0] | 2.0 [2.0–2.0] |  17.0 [15.0–17.0] | 16.0 [14.0–16.0] |
| firefox  | Rectangle resize |    200 | 2.0 [1.0–2.0] | 2.0 [2.0–3.0] |  16.0 [16.0–17.0] | 15.0 [15.0–17.0] |
| firefox  | Ellipse resize   |    200 | 1.0 [1.0–2.0] | 1.0 [0.0–2.0] |  15.0 [14.0–16.0] | 16.0 [15.0–16.0] |

Creation preview uses three pointer samples; commit uses one release sample per
fixture and is reported as a single observation. These new measurements have no
matching pre-refactor baseline. Setup and page loading are excluded. Creating the
mindmap on repeat=200 includes document subscribers and UI work, so its release
cost is substantially larger than local preview updates.

| Browser  | repeat | Preview sync median [range] | Preview two frames median [range] | Commit sync (one sample) | Commit two frames (one sample) |
| -------- | -----: | --------------------------: | --------------------------------: | -----------------------: | -----------------------------: |
| chromium |      0 |               0.6 [0.6–0.7] |                  16.6 [16.6–16.9] |                     11.0 |                           29.6 |
| chromium |    200 |               1.5 [1.3–1.6] |                  16.6 [16.6–16.7] |                     68.9 |                          130.8 |
| firefox  |      0 |               1.0 [0.0–1.0] |                  16.0 [16.0–16.0] |                     13.0 |                           20.0 |
| firefox  |    200 |               2.0 [1.0–2.0] |                  18.0 [15.0–18.0] |                     29.0 |                           43.0 |

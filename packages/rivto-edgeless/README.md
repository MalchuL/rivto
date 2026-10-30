# @chulane/rivto-edgeless

This package contains the independent Canvas implementation initially ported
from `rivto-vs-hotfix2/packages/canvas`. The production Rivto surface uses its
viewport, native input, camera, tool sessions, toolbar and transform controls.
Document projection, cards and mutation policies remain in the React host.
The package-local demo consumes built public exports without host or source aliases;
see the API ownership and verification audit in the migration plan.
See [the migration plan](../../dev_notes/rivto-edgeless-migration-ru.md).

An independent DOM canvas: camera, viewport virtualization, selection and Moveable
transform controls. It has no dependency on Rivto, document storage or undo.

Import `Canvas` and geometry types from `@chulane/rivto-edgeless`. Import `CanvasView`,
`CanvasItems`, hooks and `CanvasTransformControls` from `@chulane/rivto-edgeless/react`.
React 18 and 19 are supported. Render one view per instance.
The browser view measures its size after mounting; server rendering produces its
initial markup without attaching listeners. React 18 development SSR emits the
standard `useLayoutEffect` warning for the viewport; server import and declaration
consumption do not require a DOM.

## Source ownership

Your application owns the data. Project immutable geometry using `setElements`,
or apply replacement/removal batches using `updateElements`. The canvas keeps a
geometry projection, not your element content. Stable IDs identify elements.

`CanvasApi` is the borrowed scene contract used by sources, views and browser
attachments. It omits `dispose`; `CanvasEditor` or the application retains the
concrete `Canvas` and owns permanent cleanup. Narrower hooks and input adapters
receive only the operations they use, without wrapper objects.

Each projection supplies `id`, `frame`, clockwise `rotation` in degrees and
`zIndex`. Optional `bounds` is the full painted axis-aligned world extent: include
paths, labels and decorations outside the frame. Without it, the canvas computes
the rotated frame bounds. `render: false` retains an element for queries without
mounting its renderer. Capability flags and `minSize` constrain interaction.

`CanvasView` mounts visible items plus a 200 CSS-pixel margin by default. Supply
`renderElement` with a stable function returning a positioned geometry host. Mark
that host with `data-canvas-element={element.id}`, use `position: absolute`,
`left: 0`, `top: 0`, explicit width/height, and
`transform: translate(xpx, ypx) rotate(angledeg)`. The application owns its content.
`children` renders in world coordinates; `overlay` renders in viewport coordinates.

The `camera`, `visible`, `elements`, `selection`, `transform` and `snapping` snapshots provide
`get`/`subscribe`. Use class methods for camera, geometry and selection changes,
and `setSnapping` for grid/alignment settings. Snapshots expose no mutation methods.
`elementStore(id)` is independent of camera and sibling changes. React hooks
subscribe to the corresponding stable snapshots. Camera-only changes do not call
an unchanged `CanvasItems` renderer.

## Gestures and commits

The default view supports click/marquee selection, Ctrl/Cmd additive selection,
middle-button or Space-drag panning, wheel panning and Ctrl/Meta-wheel zoom. The
`allowCamera` and `panEnabled` policies integrate host tools and editable content.
The transform controls support move, resize, rotate, group selection, grid and
object snapping; Alt disables snapping and Shift constrains rotation/aspect ratio.
Keyboard-accessible resize and rotate handles accept arrow keys.

`onTransformStart` and `onTransformPreview` report local geometry.
`onTransformCommit` receives one final batch. Apply it to your source and update
the canvas projection **synchronously** in this callback. Returning false, not
updating the projection, or throwing releases preview geometry in favour of the
latest source projection. Returning false reports rejection but does not undo source
writes already made by the callback. Exceptions propagate after cleanup; no document
rollback is implied.
An unchanged gesture does not invoke commit. Escape, cancellation and view cleanup
discard previews. External removal or geometry changes to participants cancel an
active gesture; unrelated changes do not.

For domain-specific interactions, use `interactions={false}` and connect
`CanvasTransformControls` through `CanvasControlsAdapter`. This is how Rivto owns
group expansion, connector previews, document selection and atomic history while
reusing the generic controls. The adapter maps host DOM identities and policies;
the package never checks application element types or editor selectors.

`pin(ids)` returns an idempotent release function. Use it for DOM focus and active
transforms, not for every selected object. Querying geometry or selecting many
objects does not require mounting their content. Transform controls may create empty, hidden measurement
hosts for offscreen selection members so the control bounds cover the full selection.
`query(rect)` uses the complete projection.
Unmount releases view handlers and cancels previews. Call `dispose()` when the
owning application permanently releases the instance.

## Example and verification

The original `rivto-vs-hotfix2` demo at `/?canvas=1` has been ported into this
package as `demo/canvas-demo.tsx`, rendering 10,000 plain rectangles without
Rivto document imports. `demo/canvas-demo-editor.ts` owns source commits;
`demo/canvas-demo-tools.tsx` owns custom tool registration and preview behavior.
The renderer remains stable across camera changes.

Run `pnpm --filter @chulane/rivto-edgeless build`, then
`pnpm --filter @chulane/rivto-edgeless demo:build` and
`pnpm --filter @chulane/rivto-edgeless demo:preview` (port 5198).
`demo:test` starts that production preview and runs Chromium and Firefox with
12 workers. The demo resolves the package exports from `dist`; it has no source alias.

Run `pnpm --filter @chulane/rivto-edgeless test`, `check-types` and `build`. The independent browser scenarios from the source worktree
`e2e/canvas.spec.ts` now live in `demo/canvas.spec.ts`. Host-specific scenarios remain
covered by the workspace edgeless, creation, shape-resize, rectangle-radius and
other integration suites. Jest uses only `src/**/*.test.ts(x)` so it does not
attempt to execute Playwright scenarios.

Visibility scans cached rectangles; it does not measure each DOM node. This
bounds mounted/rendered content but still performs a linear geometry scan when
camera or projected geometry changes. A spatial index is intentionally deferred
until profiles justify its complexity.

## Source layout

- `src/core/` — framework-neutral Canvas/CanvasEditor, sources, tools and their tests.
- `src/browser/` — native input controller and tool capture without React.
- `src/components/` — viewport, virtualized items and transform controls.
- `src/hooks/` — React subscriptions and browser input lifecycle.
- `src/types/` — geometry contracts and view props.
- `src/utils/` — geometry calculations, snapshot store and DOM viewport lookup.

The public entrypoints are `index.ts` (no React or DOM dependencies), `browser.ts`
(native input without React), and `react.ts` (components and preview presentation).
Default controls flush React preview updates before returning to Moveable: it
re-measures the DOM during the same resize event. Source commits still happen
only when the gesture ends.

## Registered tools

Use CanvasToolRegistry for shared tool/group definitions and CanvasToolContext
for one receiving surface's instances. Application factories bind source operations
and group settings; CanvasTool owns local gesture state, and CanvasToolGroup
provides typed access to the host's settings owner. No application tool IDs or
element names are built into the package.

    const registry = new CanvasToolRegistry();
    registry.registerTool({
      id: "app-inspect",
      title: "Inspect",
      default: true,
      createTool: (options) => new CanvasTool(options),
    });
    const tools = new CanvasToolContext({
      registry,
      createGroup: (registration) => ({ registration }),
      createTool: (registration, group) =>
        registration.createTool({ id: registration.id, group }),
    });

    // Source subclasses CanvasSource and owns application storage.
    const editor = new CanvasEditor({ source, tools });
    // Retain the editor for this surface's lifetime.
    <CanvasEditorProvider editor={editor}>
      <CanvasView canvas={editor.canvas} renderElement={renderElement}
        overlay={<CanvasToolbar registry={registry} tools={tools} />} />
    </CanvasEditorProvider>;

Import the classes from @chulane/rivto-edgeless and components/hooks from
@chulane/rivto-edgeless/react. Subclass CanvasTool for custom gestures or use
CanvasPanTool for primary-pointer panning. Subclass ReactCanvasTool from /react
when a tool renders React preview content. For icons, use a registry parameterized
with ReactCanvasToolRegistration and ReactCanvasToolGroupEntry. Register React icon content; hosts
with their own named icons supply CanvasToolbar's Button component.

CanvasEditorProvider connects the supplied CanvasEditor, which owns source and
tool observation and disposal of local instances. It disconnects on unmount and
permits remount; call editor.dispose() only when permanently discarding the editor. Tool previews notify only their own subscribers. The view delegates
pointer capture, cancellation and preview rendering to the shared implementation;
applications with their own input routing can reuse useCanvasToolGesture.

renderGroup, getButtonProps and renderLayout bind application-specific group
controls, placement and chrome. The registry and context preserve extended
registration types. See `demo/canvas-demo-tools.tsx` for a runnable independent example and
`packages/react-rivto-editor/src/managers/edgeless-tools/` for Rivto integration.
The historical `dev_notes/canvas-tools.md` in the source worktree records the
original rationale; the local example demonstrates the current public API.

## Editor and source lifecycle

CanvasEditor composes one Canvas, a CanvasSource and a surface-local tool session.
CanvasSource.getElements() provides initial geometry for construction and server
rendering without subscriptions. CanvasSource.connect(canvas) refreshes projection
and subscribes to the application's source; its disposer releases those resources.
Factories, settings, source content and undo remain application-owned.

connect() permits exactly one mounted owner. Its idempotent disposer cancels tools
and transforms before disconnecting the source; all cleanup runs even after an
individual failure. A second connect while mounted throws. Remount keeps camera
and externally owned settings, but creates new tool instances. dispose() is terminal
and does not dispose shared registrations or the application's document.

For non-React hosts, use CanvasInputController from @chulane/rivto-edgeless/browser for
native camera/selection input, and CanvasToolGesture for tool pointer capture.
The controller connects a DOM viewport, accepts updated admission policies, and
releases listeners, capture and focus pins on disconnect. The host still renders
its scene and chooses its transform controls; a second non-React rendering engine
is not supplied by this package.

See `demo/canvas-demo-editor.ts` for the application class and the local migration
plan for ownership, Rivto scenarios, lifecycle failure behavior and extension
boundaries. The source worktree's `dev_notes/edgeless-editor-api.md` records the
original design; it is not required to run or customize this package.

## Mounted browser view

`CanvasEditor` owns scene/source/tool lifetime. `CanvasViewport` from
`@chulane/rivto-edgeless/browser` owns the separate DOM attachment: `layers.get()` is
`null` or `{ root, plane }`. `attach(root, plane)` returns an attachment-specific
cleanup; it rejects concurrent mounts and does not dispose the scene on detach.
Imperative browser adapters can use `CanvasViewport.forElement(element)` to find
the nearest mounted world layer without relying on application selectors. This is the single DOM-to-scene lookup;
input connection does not create or destroy the viewport association.

`CanvasEditorProvider` supplies this browser owner separately from the core
editor. `CanvasView` attaches its actual layers. `useCanvasViewportLayers()` from
`@chulane/rivto-edgeless/react` observes mount/unmount, including for sibling extension
components inside the provider. It returns `null` during SSR. Camera and preview
updates do not change this snapshot. Standalone views provide their own owner.

`canvas.canTransform("move" | "resize" | "rotate", ids?)` checks every requested
source object (current selection by default). Empty or unknown selections return
false. Each capability is independent; the default React controls follow these
checks. Rivto remains responsible for projecting group and absolute-geometry
policies. See `dev_notes/canvas-react-integration.md` in the source worktree for the
ownership matrix and integration rationale.

## Native event registrations

`CanvasViewport.events` owns `CanvasEvents`. Register native inputs independently
of attachment; `viewport.attach(root, plane)` binds them to that root's document
and window. Detach releases listeners while retaining registrations for remount.
Keep each registration disposer with the extension that installed it.

`useCanvasViewport()` exposes read-only layers and `events.register` to React
extensions, without exposing attachment. For example, a component inside
`CanvasEditorProvider` can register an effect-owned wheel override:

```tsx
const viewport = useCanvasViewport();
useEffect(() => viewport?.events.register({
  id: "application.wheel",
  type: "wheel",
  priority: 10,
  handle(event) {
    if (event.altKey) {
      event.preventDefault();
      return "handled";
    }
  },
}), [viewport]);
```

Priorities apply within the same target/event/capture group. Returning `handled`
skips later registered callbacks in that group; it does not automatically prevent
native defaults or propagation. Root handlers exclude nested attached canvas
roots. Window/document handlers must check whether they own the active gesture.

Imperative hosts construct `new CanvasInputController(canvas, root,
viewport.events, options)` after creating their viewport. `connect()` installs the
built-in camera/selection registrations and returns their cleanup; it does not own
viewport attachment. Custom registrations and built-ins use the same dispatcher.

## React editor registration

The host's `edgelessSurfaceExtension()` registers its document-aware surface in
`reactEditor.surfaces`. Use `<RegisteredSurface mode="edgeless" />` inside an
`EditorPanel` to observe that registration. Explicit `<EdgelessSurface />` JSX
remains available. Custom hosts may register their own surface component through
`surfaces.register("edgeless", Component)` instead of installing the default surface
extension. The component can compose this package's `CanvasView`, tool registry,
renderers, overlays and input registrations without importing document-model.

## Host-driven marquee selection

`CanvasMarquee` from `@chulane/rivto-edgeless/browser` owns drag slop, captured
client-coordinate bounds, inclusive hit testing, and an imperative rectangle.
The host supplies a detached styled rectangle and a `CanvasMarqueeSource` with
`capture` and `select`. `capture` runs once after the drag crosses three CSS pixels;
use `CanvasMarquee.snapshot(viewport, canvas)` to include offscreen scene objects.
Hosts may map hit IDs to persisted groups before returning the captured hits.

Call `start` for an admitted pointerdown, `move` for pointer samples, and `stop`
on pointerup/cancel or mode changes. `destroy` stops the gesture and removes the
owned rectangle. The host owns event registration and canonical selection writes;
the controller installs no listeners and knows no document or block types.

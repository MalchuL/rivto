# Deletion animation: research and implementation constraints

Research for the Page and Edgeless deletion paths. Source links below describe platform behavior and design guidance; the Rivto-specific observations are from the current implementation, not performance or visual measurements.

## Interaction and accessibility

- Motion should communicate the removal without blocking the next interaction. Apple recommends brief, purposeful feedback, avoiding gratuitous motion for frequent actions, and letting users interrupt it. A visible animation is still required here by the feature request, so test repeated Delete and immediate Undo instead of assuming the duration is acceptable. [Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- Respect reduced motion by removing scale and positional movement or using a dissolve. Apple recommends reducing automatic scaling and replacing spatial transitions with fades. [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- The source does not prescribe a universal deletion duration. Pick timing by observing actual blocks, large subtrees, and canvas visuals in context, including repeated deletion and Undo; increasing duration alone does not fix a transition whose geometry is wrong.

## Available approaches

- **Browser view transitions:** the browser captures old and new visual states around a DOM update, allowing list removal and sibling movement to be coordinated. Chrome's guidance shows named item transitions, recommends disabling the default root transition when it is not wanted, and notes that snapshot overlays can block pointer input unless configured. [Chrome group element transitions](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/group-element-transitions)
- A view transition is not automatically a drop-in for Rivto: the browser invokes its update callback asynchronously, and React must commit the relevant DOM changes during that callback. Chrome documents `flushSync` for the React integration and recommends treating a failed transition as a visual enhancement failure rather than a failed model change. Verify immediate selection/focus restoration, undo, repeated Delete, unsupported browsers and collaboration before adopting it. [Chrome same-document transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document)
- Document-scoped view transitions can change clipping and stacking because their overlay is attached at the document root. Element-scoped transitions address some of those problems but are a newer capability; check actual browser support before relying on them. [Chrome element-scoped transitions](https://developer.chrome.com/docs/css-ui/view-transitions/element-scoped-view-transitions)
- **React exit presence:** Motion's `AnimatePresence` can retain an exiting child, while `popLayout` removes it from layout immediately so siblings reflow. It requires a stable keyed child and, for custom immediate children, a forwarded DOM ref. Transformed ancestors affect absolute positioning. In Rivto, assess whether retaining block renderers and their subscriptions after model deletion is safe before choosing this approach. [Motion AnimatePresence](https://motion.dev/docs/react-animate-presence)

## Current implementation and evidence to collect

`captureDeletedElements` in `packages/react-rivto-editor/src/extensions/built-ins/selection/deletion-animation.ts` clones each selected DOM subtree, strips some identity attributes, appends it to `document.body` at its pre-deletion viewport bounds, and fades/scales it for 400 ms. The document mutation occurs before the copy is appended. The same helper is called for structural Page selections and Edgeless objects.

This design can produce a mismatch: a body-hosted clone does not retain its original ancestor styles, clipping, stacking, scroll behavior, or canvas transform context; siblings may already occupy the removed block's position. The bounding rectangle is axis-aligned, while the original canvas element may be transformed. The fixed copy can also remain visible briefly after Undo.

In a Chromium demo check, pausing a deleted paragraph's exit showed its text overlapping the following paragraph after that paragraph reflowed. A separate 110% zoom canvas check showed that the copied rectangle kept selected-state markup and acquired an opaque canvas-colored background. These observations confirm two visual problems; clipping, rotation, interruption, and Undo still need their own checks.

Record short frame-by-frame captures for a text block followed by another block, a rotated/zoomed canvas visual, a nested block or card, and multi-selection. Check the first frame against the original, the neighbor's position throughout, clipping, scroll/pan during exit, rapid Delete/Undo and focus. Run the same scenarios with reduced motion and in Chromium and Firefox. Measure interaction and rendering on the normal demo and `?repeat=200` as required by the repository performance workflow.

import { BlockEditor, BlockEditorEnd, type BlockVirtualizationOptions } from "@chulane/rivto-page";
import { SurfaceBoundary } from "../surface";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { ESTIMATED_ROOT_HEIGHT } from "./page-virtualization-context";
import { usePageVirtualization } from "../../hooks/editor/use-page-virtualization";
import { useEditorRoot, useRootBlockIds } from "../../hooks";

const PAGE_SURFACE_CLASS = "page-surface";

/**
 * Renders the collaborative document as a nested writing page.
 *
 * The host supplies concrete content, container layouts and panel operations.
 * Page owns structural rendering, addressed descendants and optional root
 * windowing. The existing panel owns the controller outside React render;
 * this view borrows its attachment and never creates a second document tree.
 * Page-end insertion is available only for complete-document views or a hidden
 * subtree root whose insertion commands remain bounded to that root's children.
 *
 * @returns The sole Page surface implementation inside the existing extension boundary.
 * @throws Propagates host-context, attachment and rendering failures.
 */
export function PageSurface() {
  return (
    <SurfaceBoundary type="block">
      <PageSurfaceContent />
    </SurfaceBoundary>
  );
}

/**
 * Attaches the panel-owned Page controller and its ending slot to one DOM root.
 *
 * Root IDs only decide whether the host's windowing threshold is reached. Page
 * independently observes the addressed model, so unmounted selection stays in
 * the panel. Native root attributes continue to identify this exact occurrence
 * for cross-journal navigation and host event routing.
 *
 * @returns One registered editor landmark containing the Page forest and ending slot.
 * @throws Propagates controller lifecycle, model reads and renderer failures.
 */
function PageSurfaceContent() {
  const rootIds = useRootBlockIds();
  const { rootBlockId, reactPanel } = useReactPanelContext();
  const { ref } = useEditorRoot();
  const settings = usePageVirtualization();
  let virtualization: BlockVirtualizationOptions | undefined;
  if (
    settings.threshold === true ||
    (typeof settings.threshold === "number" && rootIds.length >= settings.threshold)
  ) {
    virtualization = { estimateSize: ESTIMATED_ROOT_HEIGHT, overscan: settings.overscan };
  }

  /*
   * `ref` registers the same element as the EditorPanel DOM/event root.
   * `className` retains the public `.page-surface` styling hook.
   * `data-rivto-page-editor-root` is PAGE_EDITOR_ROOT_ATTRIBUTE in constants.ts;
   * PAGE_EDITOR_ROOT_SELECTOR uses it for cross-journal caret navigation.
   * `data-empty` exposes document emptiness to styles and integration tests.
   * `role` and `aria-label` preserve the accessible editor landmark.
   * The Page root's tabIndex permits structural focus without tab-order noise.
   */
  return (
    <BlockEditor
      editor={reactPanel.page}
      emptyDropParentId={rootBlockId ?? null}
      ref={ref}
      virtualization={virtualization}
      className={PAGE_SURFACE_CLASS}
      role="main"
      data-rivto-surface="block"
      data-rivto-page-editor-root
      data-empty={rootIds.length ? undefined : "true"}
      aria-label="Document editor"
    >
      {/* PAGE_END_SLOT_ATTRIBUTE in constants.ts marks the TrailingBlock portal target.
       * Used to add "Add block" buttons at the end of the page.
       */}
      {(rootBlockId === undefined ||
        (!reactPanel.blocks.hasBlock(rootBlockId) &&
          reactPanel.document.blocks.hasBlock(rootBlockId))) && (
        <PageEndSlot blockId={rootIds.at(-1)} />
      )}
    </BlockEditor>
  );
}

/** Canonical final root for the existing host trailing-control slot. */
interface PageEndSlotProps {
  readonly blockId: string | undefined;
}

/**
 * Makes the existing trailing-control slot accept end insertion without a spacer.
 *
 * Empty views keep their root-owned empty destination. Populated views bind the
 * actual final root's canonical boundary to the same slot used by trailing controls.
 *
 * @param props - Last displayed root in this panel's scope.
 * @param props.blockId - Last root, or undefined for an empty view.
 * @returns One unchanged page-end slot with optional declarative drop registration.
 */
function PageEndSlot({ blockId }: PageEndSlotProps) {
  return (
    <BlockEditorEnd blockId={blockId}>
      <div data-page-end-slot="true" />
    </BlockEditorEnd>
  );
}

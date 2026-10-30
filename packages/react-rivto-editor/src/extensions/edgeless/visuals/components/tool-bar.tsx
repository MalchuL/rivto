import { CanvasToolbar, type CanvasToolbarLayout } from "@chulane/rivto-edgeless/react";
import { useRef } from "react";
import { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import { Popover, PopoverAnchor } from "../../../../components/ui/popover";
import { useReactPanelContext } from "../../../../hooks/editor/use-react-panel-context";
import type { EdgelessTool } from "../../../../managers/edgeless-tools/edgeless-tool";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import type { EdgelessToolbarRenderContext } from "../../../../managers/edgeless-toolbar/types";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import {
  EdgelessToolButton,
  type EdgelessToolButtonProps,
} from "../../../../components/edgeless/tool-button";
import { ToolPopover, ToolSections } from "./tool-popover";

/**
 * Bottom-centered create toolbar for the edgeless canvas.
 *
 * Hosts the always-visible Select and Pan tools plus one button per tool
 * category. Activating a category opens the in-tree registered group popover,
 * which stays open while the user places or draws so defaults remain
 * reachable, and closes on Select/Pan, a category toggle, Escape, or a
 * pointer press outside the bar while no creation tool is active. The bar
 * raises its stacking level while a menu is open so the popover clears the
 * selection toolbar.
 */

/** Bottom-centered create toolbar; its CSS hook also identifies the in-tree popover owner. */
const TOOL_BAR_CLASS = `${UI_SCOPE_CLASS} edgeless-tool-bar`;

/**
 * Adapts the shared canvas toolbar to Rivto placement, registered group contents and popover chrome.
 *
 * Menu state, group member selection and activation are owned by CanvasToolbar.
 * This adapter supplies document placement bindings and existing receiving-panel styling.
 *
 * @param props - Shared receiving operations, tool session and mounted preset-drag handlers.
 * @returns Toolbar with registered standalone tools and nonempty groups; active styling follows the shared session.
 */
export function ToolBar({
  edgelessOperation,
  tools,
  ...props
}: {
  readonly edgelessOperation: EdgelessOperations;
  readonly tools: EdgelessToolContext;
} & Pick<EdgelessToolbarRenderContext, "startPresetDrag" | "movePresetDrag" | "endPresetDrag">) {
  const { reactPanel } = useReactPanelContext();
  const pointer = props;
  const context: EdgelessToolbarRenderContext = {
    reactPanel,
    operations: edgelessOperation,
    tools,
    ...pointer,
  };
  return (
    <CanvasToolbar
      registry={reactPanel.editor.edgelessToolbar}
      tools={tools}
      Button={EdgelessToolButton}
      getButtonProps={(registration, instance) => ({
        ...getPlacementBindings(instance, pointer),
        ...registration.getButtonProps?.(context),
      })}
      renderGroup={(groupProps) => {
        const Contents = groupProps.group.registration.render;
        return Contents ? (
          <Contents
            {...groupProps}
            reactPanel={reactPanel}
            operations={edgelessOperation}
            tools={tools}
          />
        ) : (
          <ToolSections tools={groupProps.items.map((item) => groupProps.renderTool(item))} />
        );
      }}
      renderLayout={(layout) => <ToolBarLayout {...layout} tools={tools} />}
    />
  );
}

/**
 * Binds ordinary creation tools to toolbar placement while preserving keyboard activation.
 *
 * @param tool - Current session instance, absent for an unavailable registration.
 * @param pointer - Receiving surface's preset-drag callbacks.
 * @returns Placement callbacks only for creation tools that support ordinary placement.
 */
function getPlacementBindings(
  tool: EdgelessTool | undefined,
  pointer: Pick<
    EdgelessToolbarRenderContext,
    "startPresetDrag" | "movePresetDrag" | "endPresetDrag"
  >,
): Partial<EdgelessToolButtonProps> {
  if (!(tool instanceof EdgelessCreationTool) || !tool.supportsPlacement) {
    return {};
  }
  return {
    /**
     * Keeps pointer placement from also activating the toolbar entry through its synthetic click.
     *
     * @param event - Button click; detail zero identifies keyboard activation.
     * @returns Pointer clicks are marked handled while keyboard clicks retain shared activation.
     */
    onClick: (event) => {
      if (event.detail > 0) {
        event.preventDefault();
      }
    },
    onPointerDown: (event) => pointer.startPresetDrag(event, tool),
    onPointerMove: pointer.movePresetDrag,
    onPointerUp: (event) => pointer.endPresetDrag(event),
    onPointerCancel: (event) => pointer.endPresetDrag(event, false),
  };
}

/**
 * Places registered group contents in the receiving toolbar's in-tree popover.
 *
 * @param props - Shared layout snapshot and surface-local tool session.
 * @returns Existing Rivto toolbar chrome with controlled menu dismissal.
 */
function ToolBarLayout({
  entries,
  content,
  menu,
  popoverId,
  setMenu,
  tools,
}: CanvasToolbarLayout & { readonly tools: EdgelessToolContext }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  return (
    <Popover
      open={Boolean(menu)}
      onOpenChange={(open) => {
        if (!open) {
          setMenu(null);
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          ref={barRef}
          className={TOOL_BAR_CLASS}
          data-edgeless-ui="true"
          data-menu-open={menu ?? undefined}
          role="toolbar"
          aria-label="Visual objects"
        >
          {entries}
          {menu && (
            <ToolPopover id={popoverId} category={menu} container={barRef.current} tools={tools}>
              {content}
            </ToolPopover>
          )}
        </div>
      </PopoverAnchor>
    </Popover>
  );
}

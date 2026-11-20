import { CanvasToolbar, useCanvasViewport } from "@chulane/rivto-edgeless/react";
import { useRef } from "react";
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import { Popover, PopoverAnchor } from "../../../../components/ui/popover";
import { useReactPanelContext } from "../../../../hooks/editor/use-react-panel-context";
import type { ToolBarLayoutProps, ToolBarProps } from "./types";
import { EdgelessToolButton } from "../../../../components/edgeless/tool-button";
import { ToolPopover, ToolSections } from "./tool-popover";
import { usePresetStart } from "../hooks/use-preset-start";
import { usePresetClick } from "../hooks/use-preset-click";

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
 * @param props.edgelessOperation - Panel operations supplied to custom group contents.
 * @param props.tools - Surface-owned tool session and activation state.
 * @param props.startPresetDrag - Captures an eligible toolbar placement pointer.
 * @returns Toolbar with registered standalone tools and nonempty groups; active styling follows the shared session.
 */
export function ToolBar({ edgelessOperation, tools, startPresetDrag }: ToolBarProps) {
  const { reactPanel } = useReactPanelContext();
  const viewport = useCanvasViewport();
  usePresetStart(viewport, tools, startPresetDrag);
  usePresetClick(viewport, tools);
  return (
    <CanvasToolbar
      registry={reactPanel.editor.edgelessToolbar}
      tools={tools}
      Button={EdgelessToolButton}
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
 * Places registered group contents in the receiving toolbar's in-tree popover.
 *
 * @param props - Shared layout snapshot and surface-local tool session.
 * @param props.tools - Session that owns the active tool and menu behavior.
 * @returns Existing Rivto toolbar chrome with controlled menu dismissal.
 */
function ToolBarLayout({ entries, content, menu, popoverId, setMenu, tools }: ToolBarLayoutProps) {
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
          data-edgeless-toolbar=""
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

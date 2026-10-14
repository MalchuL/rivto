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
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UI_SCOPE_CLASS } from '../../../../components/ui-scope';
import { ToolBarDivider } from '../../../../components/edgeless/tool-bar-divider';
import { Popover, PopoverAnchor } from '../../../../components/ui/popover';
import { useReactPanelContext } from '../../../../hooks/editor/use-react-panel-context';
import type { EdgelessOperations } from '../../../../managers/elements/edgeless-operations';
import type { EdgelessToolbarItem, EdgelessToolbarRenderContext } from '../../../../managers/edgeless-toolbar/types';
import type { EdgelessVisualTool } from '../../../../elements/visuals/types';
import { EdgelessToolButton } from '../../../../components/edgeless/tool-button';
import { ToolPopover, ToolSections } from './tool-popover';

/** Bottom-centered create toolbar; its CSS hook also identifies the in-tree popover owner. */
const TOOL_BAR_CLASS = `${UI_SCOPE_CLASS} edgeless-tool-bar`;

/**
 * Bottom-centered create toolbar with always-visible Select and registered group popovers.
 * @param props - Shared receiving operations, current tool and mounted preset-drag handlers.
 * @returns Toolbar with registered standalone tools and nonempty groups; active styling follows each tool predicate.
 */
export function ToolBar({ edgelessOperation, tool, ...pointer }: {
  readonly edgelessOperation: EdgelessOperations;
  readonly tool: EdgelessVisualTool;
} & Pick<EdgelessToolbarRenderContext, 'startPresetDrag' | 'movePresetDrag' | 'endPresetDrag'>) {
  const { reactPanel } = useReactPanelContext();
  const registry = reactPanel.editor.edgelessToolbar;
  const revision = useSyncExternalStore(listener => registry.subscribe(listener), () => registry.revision, () => registry.revision);
  const [menu, setMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();
  const tools = registry.getTools();
  const groups = registry.getGroups().filter(group => tools.some(item => item.group === group.id));
  const context: EdgelessToolbarRenderContext = { reactPanel, operations: edgelessOperation, ...pointer };
  const items: EdgelessToolbarItem[] = tools.map(entry => ({
    tool: entry, active: entry.isActive(tool), activate: () => edgelessOperation.activateToolbarTool(entry.id),
  }));
  const currentGroup = groups.find(group => group.id === menu);

  useEffect(() => {
    if (menu && !registry.getTools().some(item => item.group === menu && registry.getGroup(menu))) setMenu(null);
  }, [menu, registry, revision]);

  useEffect(() => {
    if (tool.tool === 'select' || tool.tool === 'pan') setMenu(null);
  }, [tool]);

  const renderTool = (item: EdgelessToolbarItem, children: ReactNode = item.tool.title) => {
    const bindings = item.tool.getButtonProps?.(context);
    return <EdgelessToolButton key={`tool:${item.tool.id}`} label={item.tool.title} icon={item.tool.icon}
      pressed={item.active} {...bindings} onClick={event => {
        bindings?.onClick?.(event);
        if (!event.defaultPrevented) item.activate();
        if (!item.tool.group) setMenu(null);
      }}>
      {children}
    </EdgelessToolButton>;
  };
  const entries = registry.getEntries().map(entry => {
    if (entry.kind === 'tool') {
      const item = items.find(item => item.tool.id === entry.registration.id)!;
      return renderTool(item, item.tool.icon ? null : item.tool.title);
    }
    const group = entry.registration;
    const open = menu === group.id;
    const last = edgelessOperation.getGroupTool(group.id);
    const active = items.some(item => item.tool.group === group.id && item.active);
    return <EdgelessToolButton key={`group:${group.id}`} label={group.title} icon={last?.icon ?? group.icon}
      aria-haspopup="dialog" aria-controls={open ? popoverId : undefined} aria-expanded={open} pressed={active || open} onClick={() => {
        if (open) { setMenu(null); return; }
        edgelessOperation.activateToolbarGroup(group.id);
        setMenu(group.id);
      }}>{(last?.icon ?? group.icon) ? null : group.title}</EdgelessToolButton>;
  });
  const groupProps = { reactPanel, operations: edgelessOperation, items: items.filter(item => item.tool.group === menu), renderTool };
  const Contents = currentGroup?.render;
  return (
    <Popover open={Boolean(currentGroup)} onOpenChange={open => { if (!open) setMenu(null); }}>
    <PopoverAnchor asChild><div ref={barRef} className={TOOL_BAR_CLASS} data-edgeless-ui="true" data-menu-open={currentGroup?.id}
      role="toolbar" aria-label="Visual objects">
      <EdgelessToolButton label="Select" icon="select" pressed={tool.tool === 'select'} onClick={() => { edgelessOperation.setTool('select'); setMenu(null); }} />
      <EdgelessToolButton label="Pan" icon="pan" pressed={tool.tool === 'pan'} onClick={() => { edgelessOperation.setTool({ tool: 'pan' }); setMenu(null); }} />
      <ToolBarDivider />
      {entries}
      {currentGroup && <ToolPopover id={popoverId} category={currentGroup.id} container={barRef.current} operations={edgelessOperation}>
        {Contents ? <Contents {...groupProps} /> : <ToolSections tools={groupProps.items.map(item => renderTool(item))} />}
      </ToolPopover>}
    </div></PopoverAnchor>
    </Popover>
  );
}

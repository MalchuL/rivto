import type { ReactNode } from "react";
import type { CanvasTool } from "../core/tools/canvas-tool";
import type { ReactCanvasToolEntry, ReactCanvasToolGroupEntry } from "../types/react-tool-registry";
import type { CanvasToolbarItem, CanvasToolbarProps } from "../types/toolbar";
import { CanvasToolButton } from "./canvas-toolbar-layout";

/** Renders one toolbar snapshot using registered presentation and activation policies. */
export class CanvasToolbarRenderer<
  Tool extends CanvasTool,
  Group extends { readonly registration: GroupRegistration },
  Registration extends ReactCanvasToolEntry,
  GroupRegistration extends ReactCanvasToolGroupEntry,
> {
  private readonly items: CanvasToolbarItem<Registration>[];

  /**
   * Captures this render's tool entries while leaving mutable session state with its owner.
   *
   * @param props - Registry, session and application presentation adapters.
   * @param menu - Open group identity, or null.
   * @param setMenu - Updates React-owned menu state.
   * @param popoverId - Accessible identity of the mounted group dialog.
   */
  constructor(
    private readonly props: CanvasToolbarProps<Tool, Group, Registration, GroupRegistration>,
    private readonly menu: string | null,
    private readonly setMenu: (id: string | null) => void,
    private readonly popoverId: string,
  ) {
    this.items = props.registry.getTools().map((entry) => ({
      tool: entry,
      active: entry.id === props.tools.active?.id,
      /**
       * Activates this registration in the receiving surface's session.
       *
       * @returns The session switches tools using its activation and cancellation policy.
       */
      activate: () => props.tools.activate(entry.id),
    }));
  }

  /**
   * Builds ordered standalone buttons and nonempty registered group buttons.
   *
   * @returns Toolbar entries in the registry's declared order.
   */
  renderEntries() {
    return this.props.registry.getEntries().map((entry) => {
      if (entry.kind === "tool") {
        const item = this.items.find((item) => item.tool.id === entry.registration.id)!;
        return this.renderTool(item, item.tool.icon ? null : item.tool.title);
      }
      return this.renderGroupButton(entry.registration);
    });
  }

  /**
   * Resolves the open group and delegates its settings view to the application.
   *
   * @returns Layout data with no content when the group is absent or empty.
   */
  getLayout() {
    const registration = this.props.registry
      .getGroups()
      .find(
        (group) =>
          group.id === this.menu && this.items.some((item) => item.tool.group === group.id),
      );
    const group = registration && this.props.tools.getGroup(registration.id);
    const groupProps = group
      ? {
          group,
          items: this.items.filter((item) => item.tool.group === this.menu),
          renderTool: this.renderTool,
        }
      : undefined;
    const content = groupProps
      ? (this.props.renderGroup?.(groupProps) ??
        groupProps.items.map((item) => this.renderTool(item)))
      : null;
    return {
      entries: this.renderEntries(),
      content,
      menu: registration?.id ?? null,
      popoverId: this.popoverId,
      setMenu: this.setMenu,
    };
  }
  /**
   * Renders one member with application bindings and shared activation behavior.
   *
   * @param item - Registered member and its current activation state.
   * @param children - Button contents, defaulting to the registration title.
   * @returns The application button with shared activation and menu dismissal.
   */
  renderTool = (item: CanvasToolbarItem<Registration>, children: ReactNode = item.tool.title) => {
    const instance = this.props.tools.getTool(item.tool.id);
    const bindings = this.props.getButtonProps?.(item.tool, instance);
    const Button = this.props.Button ?? CanvasToolButton;
    return (
      <Button
        key={`tool:${item.tool.id}`}
        label={item.tool.title}
        icon={item.tool.icon}
        pressed={item.active}
        {...bindings}
        onClick={(event) => {
          bindings?.onClick?.(event);
          if (!event.defaultPrevented) {
            item.activate();
          }
          if (!item.tool.group) {
            this.setMenu(null);
          }
        }}
      >
        {children}
      </Button>
    );
  };

  /**
   * Renders a registered group's last-used icon and controlled menu trigger.
   *
   * @param group - Application group metadata from the current registry snapshot.
   * @returns Accessible button that activates the group's remembered tool on open.
   */
  private renderGroupButton(group: GroupRegistration) {
    const Button = this.props.Button ?? CanvasToolButton;
    const open = this.menu === group.id;
    const last = this.props.tools.getGroupTool(group.id);
    const active = this.items.some((item) => item.tool.group === group.id && item.active);
    return (
      <Button
        key={`group:${group.id}`}
        label={group.title}
        icon={last?.icon ?? group.icon}
        aria-haspopup="dialog"
        aria-controls={open ? this.popoverId : undefined}
        aria-expanded={open}
        pressed={active || open}
        onClick={() => {
          if (open) {
            this.setMenu(null);
            return;
          }
          this.props.tools.activateGroup(group.id);
          this.setMenu(group.id);
        }}
      >
        {(last?.icon ?? group.icon) ? null : group.title}
      </Button>
    );
  }
}

import type { ReactPanelApi } from "../../panels/types";
import type { EdgelessToolbarTool, EdgelessToolbarGroup } from "../edgeless-toolbar/types";
import { RevisionStore } from "../../internal-store";
import { EdgelessOperations } from "../elements/edgeless-operations";
import { EdgelessCreationDefaults } from "../elements/edgeless-creation-defaults";
import { EdgelessToolGroup } from "./edgeless-tool-group";
import type { EdgelessTool } from "./edgeless-tool";

/** Owns tool instances and shared settings for exactly one mounted edgeless surface. */
export class EdgelessToolContext {
  readonly defaults: EdgelessCreationDefaults;
  readonly operations: EdgelessOperations;
  private readonly instances = new Map<EdgelessToolbarTool, EdgelessTool>();
  private readonly groups = new Map<EdgelessToolbarGroup, EdgelessToolGroup>();
  private readonly lastByGroup = new Map<string, string>();
  private readonly changes = new RevisionStore();
  private current?: EdgelessTool;

  /**
   * Creates isolated settings and document operations without external subscriptions.
   *
   * @param reactPanel - Fixed receiving panel; other surfaces create their own context.
   * @param defaults - Optional existing surface settings to retain during integration.
   */
  constructor(
    readonly reactPanel: ReactPanelApi,
    defaults = new EdgelessCreationDefaults(reactPanel.editor),
  ) {
    this.defaults = defaults;
    this.operations = new EdgelessOperations(reactPanel.editor, reactPanel, defaults);
  }

  /**
   * Observes registration changes after mount and restores the configured default tool.
   *
   * @returns Cleanup cancelling tools and releasing document and registry subscriptions.
   */
  observeChanges(): () => void {
    this.reconcile();
    const stopRegistry = this.reactPanel.editor.edgelessToolbar.subscribe(() => this.reconcile());
    const stopOperations = this.operations.observeChanges();
    const stopDeactivate = this.reactPanel.subscribeDeactivation(() => this.current?.cancel());
    return () => {
      stopRegistry();
      stopOperations();
      stopDeactivate();
      for (const tool of this.instances.values()) {
        tool.dispose();
      }
      this.instances.clear();
      this.groups.clear();
      this.current = undefined;
    };
  }

  /**
   * Observes active-tool and registration changes separately from pointer samples.
   *
   * @param listener - Called after the active tool or available registrations change.
   * @returns Cleanup removing this observer.
   */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }

  /**
   * Reads the session revision for React consumers.
   *
   * @returns Stable revision until activation or registry reconciliation.
   */
  get revision(): number {
    return this.changes.revision;
  }

  /**
   * Reads the current instance, lazily resolving the configured default.
   *
   * @returns Current tool, or undefined if no default or active registration exists.
   */
  get active(): EdgelessTool | undefined {
    if (!this.current) {
      const entry = this.defaultRegistration;
      if (entry) {
        return this.getTool(entry.id);
      }
    }
    return this.current;
  }

  /**
   * Checks whether resetting would leave the current interaction.
   *
   * @returns True when the active tool differs from the registry-configured default.
   */
  get canReset(): boolean {
    const fallback = this.defaultRegistration;
    return this.active?.id !== fallback?.id;
  }

  /**
   * Resolves a registered group without copying its settings.
   *
   * @param id - Group registration identity.
   * @returns The stable surface instance, or undefined for a missing group.
   */
  getGroup(id: string): EdgelessToolGroup | undefined {
    const registration = this.reactPanel.editor.edgelessToolbar.getGroup(id);
    if (!registration) {
      return undefined;
    }
    let group = this.groups.get(registration);
    if (!group) {
      group = new EdgelessToolGroup(registration, this.defaults);
      this.groups.set(registration, group);
    }
    return group;
  }

  /**
   * Instantiates a registered tool once for this surface.
   *
   * @param id - Tool registration identity, independent of element type.
   * @returns Its stable instance, or undefined when registration/group is unavailable.
   */
  getTool(id: string): EdgelessTool | undefined {
    const registration = this.reactPanel.editor.edgelessToolbar.getTool(id);
    if (!registration || (registration.group && !this.getGroup(registration.group))) {
      return undefined;
    }
    let tool = this.instances.get(registration);
    if (!tool) {
      tool = registration.createTool({
        id,
        operations: this.operations,
        defaults: this.defaults,
        reactPanel: this.reactPanel,
        group: registration.group ? this.getGroup(registration.group) : undefined,
      });
      if (tool.id !== id) {
        throw new Error("Tool factory returned a different registration identity");
      }
      this.instances.set(registration, tool);
    }
    return tool;
  }

  /**
   * Switches tools through their lifecycle methods and remembers group selection.
   *
   * @param id - Available tool registration to activate.
   * @returns Publishes the resulting active instance.
   * @throws If registration is unavailable or activation fails; a failed activation returns to the configured default.
   */
  activate(id: string): void {
    const next = this.getTool(id);
    if (!next) {
      throw new Error(`Tool ${id} is not available`);
    }
    const previous = this.current;
    previous?.deactivate();
    this.current = next;
    try {
      next.activate(previous);
      if (next.group) {
        this.lastByGroup.set(next.group.registration.id, id);
      }
    } catch (error) {
      next.cancel();
      this.current = undefined;
      const fallback = this.defaultRegistration;
      if (fallback && fallback.id !== next.id) {
        this.activate(fallback.id);
      }
      this.changes.changed();
      throw error;
    }
    this.changes.changed();
  }

  /**
   * Returns to the registry-configured default interaction.
   *
   * @returns Cancels the active gesture and activates the default, or clears selection of a tool when absent.
   */
  reset(): void {
    const entry = this.defaultRegistration;
    if (entry) {
      this.activate(entry.id);
    } else {
      this.current?.deactivate();
      this.current = undefined;
      this.changes.changed();
    }
  }

  /**
   * Resolves the last available member or configured first member of a group.
   *
   * @param id - Registered group identity.
   * @returns A tool registration or undefined for an unavailable/empty group.
   */
  getGroupTool(id: string): EdgelessToolbarTool | undefined {
    const registry = this.reactPanel.editor.edgelessToolbar;
    const group = registry.getGroup(id);
    if (!group) {
      return undefined;
    }
    const entries = registry.getTools().filter((tool) => tool.group === id);
    return (
      entries.find((tool) => tool.id === this.lastByGroup.get(id)) ??
      entries.find((tool) => tool.id === group.defaultToolId) ??
      entries[0]
    );
  }

  /**
   * Activates a group's remembered or default member.
   *
   * @param id - Group registration identity.
   * @returns Switches tools when an available member exists.
   */
  activateGroup(id: string): void {
    const entry = this.getGroupTool(id);
    if (entry) {
      this.activate(entry.id);
    }
  }

  /**
   * Resolves the configured fallback only while its optional group is available.
   *
   * @returns Available default registration, or undefined for absent/deferred defaults.
   */
  private get defaultRegistration(): EdgelessToolbarTool | undefined {
    const registry = this.reactPanel.editor.edgelessToolbar;
    return registry
      .getTools()
      .find((tool) => tool.default && (!tool.group || registry.getGroup(tool.group) !== undefined));
  }

  /**
   * Drops instances whose registrations disappeared and repairs the active selection.
   *
   * @returns Releases stale tools and groups and publishes registry changes.
   */
  private reconcile(): void {
    const registry = this.reactPanel.editor.edgelessToolbar;
    let removedActive = false;
    for (const [registration, tool] of this.instances) {
      if (
        registry.getTool(registration.id) !== registration ||
        (registration.group && registry.getGroup(registration.group) !== tool.group?.registration)
      ) {
        removedActive ||= this.current === tool;
        tool.dispose();
        this.instances.delete(registration);
      }
    }
    for (const registration of this.groups.keys()) {
      if (registry.getGroup(registration.id) !== registration) {
        this.groups.delete(registration);
        this.lastByGroup.delete(registration.id);
      }
    }
    if (removedActive || !this.current) {
      this.current = undefined;
      this.reset();
    }
    this.changes.changed();
  }
}

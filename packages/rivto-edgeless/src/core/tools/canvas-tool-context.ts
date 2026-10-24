import { releaseResources } from "../../utils/release-resources";
import { RevisionStore } from "../../utils/revision-store";
import type { CanvasTool } from "./canvas-tool";
import type { CanvasToolRegistry } from "./canvas-tool-registry";
import type { CanvasToolEntry, CanvasToolGroupEntry } from "../../types/tool-registry";

/** Application bindings used when a canvas session lazily resolves registrations. */
export interface CanvasToolContextOptions<
  Tool extends CanvasTool,
  Group extends { readonly registration: GroupRegistration },
  Registration extends CanvasToolEntry,
  GroupRegistration extends CanvasToolGroupEntry,
> {
  readonly registry: Pick<
    CanvasToolRegistry<Registration, GroupRegistration>,
    "getTool" | "getGroup" | "getTools" | "subscribe"
  >;
  /**
   * Binds one registered group to this session's settings owner.
   *
   * @param registration - Shared immutable group metadata.
   * @returns A surface-local group with the same registration identity.
   */
  readonly createGroup: (registration: GroupRegistration) => Group;
  /**
   * Binds one tool factory to application dependencies for this surface.
   *
   * @param registration - Shared factory registration.
   * @param group - Resolved group, or undefined for standalone tools.
   * @returns A tool with the registration's ID; instances must not be shared between surfaces.
   */
  readonly createTool: (registration: Registration, group: Group | undefined) => Tool;
}

/** Owns tool instances and settings-group bindings for exactly one mounted canvas surface. */
export class CanvasToolContext<
  Tool extends CanvasTool,
  Group extends { readonly registration: GroupRegistration },
  Registration extends CanvasToolEntry,
  GroupRegistration extends CanvasToolGroupEntry,
> {
  private readonly instances = new Map<Registration, Tool>();
  private readonly groups = new Map<GroupRegistration, Group>();
  private readonly lastByGroup = new Map<string, string>();
  private readonly changes = new RevisionStore();
  private current?: Tool;
  private observing = false;
  private suspended = false;

  /**
   * Creates an isolated tool session without external subscriptions.
   *
   * @param options - Shared registry and factories binding application dependencies to this surface.
   * Each surface supplies its own factories and retains its own settings owner.
   */
  constructor(
    private readonly options: CanvasToolContextOptions<
      Tool,
      Group,
      Registration,
      GroupRegistration
    >,
  ) {}

  /**
   * Observes registration changes after mount and restores the configured default tool.
   *
   * Cleanup is idempotent and releases all instances even if an individual disposal fails.
   *
   * @returns Cleanup cancelling tools and releasing tool instances and registry subscriptions.
   * @throws If already observed or initial registration reconciliation fails.
   */
  observeChanges(): () => void {
    if (this.observing) {
      throw new Error("Canvas tools already have an observation owner");
    }
    this.observing = true;
    this.suspended = false;
    let stopRegistry: (() => void) | undefined;
    let released = false;
    /**
     * Suspends this observation and disposes every retained tool instance.
     *
     * @returns Registry observation and tool resources are released once, including on setup failure.
     */
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      this.suspended = true;
      const instances = [...this.instances.values()];
      this.instances.clear();
      this.groups.clear();
      this.current = undefined;
      try {
        releaseResources([
          () => stopRegistry?.(),
          ...instances.map((tool) => () => tool.dispose()),
          () => this.changes.changed(),
        ]);
      } finally {
        this.observing = false;
      }
    };
    try {
      this.reconcile();
      stopRegistry = this.options.registry.subscribe(() => this.reconcile());
    } catch (error) {
      releaseResources([
        () => {
          throw error;
        },
        release,
      ]);
    }
    return release;
  }

  /**
   * Observes active-tool, registration and session-settings changes separately from pointer samples.
   *
   * @param listener - Called after the active tool, available registrations or session settings change.
   * @returns Cleanup removing this observer.
   */
  subscribe(listener: () => void): () => void {
    return this.changes.subscribe(listener);
  }

  /**
   * Reads the session revision for React consumers.
   *
   * @returns Stable revision until activation, registry reconciliation or a published session-settings change.
   */
  get revision(): number {
    return this.changes.revision;
  }

  /**
   * Reads the current instance, lazily resolving the configured default.
   *
   * @returns Current tool, or undefined if no default or active registration exists.
   */
  get active(): Tool | undefined {
    if (this.suspended) {
      return undefined;
    }
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
  getGroup(id: string): Group | undefined {
    const registration = this.options.registry.getGroup(id);
    if (!registration) {
      return undefined;
    }
    let group = this.groups.get(registration);
    if (!group) {
      group = this.options.createGroup(registration);
      this.groups.set(registration, group);
    }
    return group;
  }

  /**
   * Instantiates a registered tool once for this surface.
   *
   * @param id - Tool registration identity, independent of element type.
   * @returns Its stable instance, or undefined when disconnected or registration/group is unavailable.
   */
  getTool(id: string): Tool | undefined {
    if (this.suspended) {
      return undefined;
    }
    const registration = this.options.registry.getTool(id);
    if (!registration || (registration.group && !this.getGroup(registration.group))) {
      return undefined;
    }
    let tool = this.instances.get(registration);
    if (!tool) {
      tool = this.options.createTool(
        registration,
        registration.group ? this.getGroup(registration.group) : undefined,
      );
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
  getGroupTool(id: string): Registration | undefined {
    const registry = this.options.registry;
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
   * Publishes changed session state to toolbar and other context subscribers.
   *
   * Subclasses call this after application-owned tool settings change. Pointer
   * previews remain local to individual tools and must not notify this store.
   *
   * @returns Advances the revision and synchronously notifies current subscribers.
   */
  protected changed(): void {
    this.changes.changed();
  }

  /**
   * Resolves the configured fallback only while its optional group is available.
   *
   * @returns Available default registration, or undefined for absent/deferred defaults.
   */
  private get defaultRegistration(): Registration | undefined {
    const registry = this.options.registry;
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
    const registry = this.options.registry;
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

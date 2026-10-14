import { RevisionStore } from '../../internal-store';
import type { RegistrationOwner } from '../extensions/types';
import type { EdgelessToolbarApi, EdgelessToolbarEntry, EdgelessToolbarGroup, EdgelessToolbarTool } from './types';

/** Extension-owned groups and tools; registering presentation never changes document content. */
export class EdgelessToolbarManager implements EdgelessToolbarApi {
  private readonly groups = new Map<string, EdgelessToolbarGroup>();
  private readonly tools = new Map<string, EdgelessToolbarTool>();
  private readonly positions = new WeakMap<object, number>();
  private sequence = 0;
  private readonly store = new RevisionStore();

  /** @param owner - Registration lifecycle shared with React extensions. */
  constructor(private readonly owner: RegistrationOwner) {
    owner.registerCleanup(() => this.store.clear());
  }

  private register<T extends { readonly id: string }>(entries: Map<string, T>, entry: T): () => void {
    this.owner.assertActive();
    if (entries.has(entry.id)) throw new Error(`Edgeless toolbar registration ${entry.id} already exists`);
    this.positions.set(entry, this.sequence++);
    entries.set(entry.id, entry);
    this.store.changed();
    return this.owner.registerCleanup(() => {
      entries.delete(entry.id);
      this.store.changed();
    });
  }

  /** @inheritdoc EdgelessToolbarApi.registerGroup */
  registerGroup(group: EdgelessToolbarGroup): () => void { return this.register(this.groups, group); }
  /** @inheritdoc EdgelessToolbarApi.registerTool */
  registerTool(tool: EdgelessToolbarTool): () => void { return this.register(this.tools, tool); }
  /** @inheritdoc EdgelessToolbarApi.getGroup */
  getGroup(id: string): EdgelessToolbarGroup | undefined { return this.groups.get(id); }
  /** @inheritdoc EdgelessToolbarApi.getTool */
  getTool(id: string): EdgelessToolbarTool | undefined { return this.tools.get(id); }
  /** @inheritdoc EdgelessToolbarApi.getGroups */
  getGroups(): readonly EdgelessToolbarGroup[] { return [...this.groups.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
  /** @inheritdoc EdgelessToolbarApi.getTools */
  getTools(): readonly EdgelessToolbarTool[] { return [...this.tools.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
  /** @inheritdoc EdgelessToolbarApi.getEntries */
  getEntries(): readonly EdgelessToolbarEntry[] {
    const tools = this.getTools();
    const entries: EdgelessToolbarEntry[] = [
      ...this.getGroups().filter(group => tools.some(tool => tool.group === group.id)).map(registration => ({ kind: 'group' as const, registration })),
      ...tools.filter(tool => !tool.group).map(registration => ({ kind: 'tool' as const, registration })),
    ];
    return entries.sort((a, b) => (a.registration.order ?? 0) - (b.registration.order ?? 0)
      || this.positions.get(a.registration)! - this.positions.get(b.registration)!);
  }
  /** @inheritdoc EdgelessToolbarApi.subscribe */
  subscribe(listener: () => void): () => void { return this.store.subscribe(listener); }
  /** @inheritdoc EdgelessToolbarApi.revision */
  get revision(): number { return this.store.revision; }
}

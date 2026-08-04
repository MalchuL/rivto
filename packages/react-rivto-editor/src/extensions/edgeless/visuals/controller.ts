import {
  RIVTO_CLIPBOARD_MIME,
  type BasicCRDTType,
  type ClipboardBundle,
  type CRDTMap,
  type EditorBlock,
  type EditorBlockInput,
} from "@chulane/rivto";
import type { ReactEditor } from "../../../types";
import { getEdgelessRuntime, type EdgelessSelectionRef } from "../edgeless-runtime";
import {
  EDGELESS_VISUALS_PLUGIN_ID,
  type CreateVisualPayload,
  type EdgelessAlignment,
  type EdgelessReorder,
  type EdgelessVisual,
  type EdgelessVisualTool,
  type UpdateVisualPayload,
  type VisualFrame,
  type VisualGroup,
} from "./types";

type RecordMap = CRDTMap<Record<string, BasicCRDTType>>;

const DEFAULT_FRAME: VisualFrame = { x: 120, y: 120, width: 160, height: 120 };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === "object" && !Array.isArray(value),
);
const copy = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

const unionFrames = (frames: readonly VisualFrame[]): VisualFrame | undefined => {
  if (!frames.length) return undefined;
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Owns extension data, commands, and geometry without extending either editor API. */
export class EdgelessVisualController {
  private readonly selection;
  private readonly namespace: RecordMap;
  private readonly elements: RecordMap;
  private readonly groups: RecordMap;
  private readonly registrations: Array<{ dispose(): void }> = [];
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeDocument: () => void;
  private reconciling = false;
  private currentTool: EdgelessVisualTool = "select";

  /**
   * Materializes this extension's CRDT maps and registers its public commands.
   *
   * @param reactEditor - Owning React editor with the edgeless foundation installed.
   */
  constructor(readonly reactEditor: ReactEditor) {
    this.selection = getEdgelessRuntime(reactEditor);
    this.namespace = reactEditor.editor.document.pluginData.getMap(EDGELESS_VISUALS_PLUGIN_ID);
    this.elements = this.childMap("elements");
    this.groups = this.childMap("groups");
    if (!this.namespace.has("version")) this.namespace.set("version", 1);
    this.registerCommands();
    this.registerClipboard();
    this.unsubscribeDocument = reactEditor.editor.document.subscribe(() => {
      if (this.reconciling) return;
      this.reconciling = true;
      try {
        this.normalizeGroups();
      } finally {
        this.reconciling = false;
      }
    });
  }

  /** @returns Detached persisted visual records. */
  getVisuals(): EdgelessVisual[] {
    return [...this.elements.values()].filter(isRecord).map((value) => copy(value) as unknown as EdgelessVisual);
  }

  /** @returns Detached persisted logical groups. */
  getGroups(): VisualGroup[] {
    return [...this.groups.values()].filter(isRecord).map((value) => copy(value) as unknown as VisualGroup);
  }

  /** @param item - Canvas object reference. @returns Derived outer geometry. */
  getBounds(item: EdgelessSelectionRef): VisualFrame | undefined {
    const frame = this.bounds(item);
    return frame ? { ...frame } : undefined;
  }

  /** @returns Current local creation tool. */
  getTool(): EdgelessVisualTool { return this.currentTool; }

  /** @param listener - Tool-state callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Releases commands and local listeners without deleting persisted data. */
  destroy(): void {
    this.unsubscribeDocument();
    this.registrations.reverse().forEach((registration) => registration.dispose());
    this.listeners.clear();
  }

  /** Creates one validated visual and selects it. */
  create(payload: CreateVisualPayload): string {
    if (!payload || !["sticker", "drawing", "rectangle", "ellipse", "text"].includes(payload.kind)) {
      throw new Error("Unsupported edgeless visual kind");
    }
    const id = crypto.randomUUID();
    const maxZ = Math.max(0, ...this.getVisuals().map((visual) => visual.zIndex), ...this.rootBlocks().map((block) => block.layout?.zIndex ?? 0));
    const frame = this.frame({ ...DEFAULT_FRAME, ...payload.frame });
    let visual: EdgelessVisual;
    if (payload.kind === "sticker") {
      if (!payload.source || (payload.source.type === "image" ? !payload.source.src : payload.source.type !== "emoji" || !payload.source.value)) {
        throw new Error("Sticker source is required");
      }
      visual = { id, kind: payload.kind, frame, zIndex: maxZ + 1, source: copy(payload.source), alt: payload.alt ?? "" };
    } else if (payload.kind === "drawing") {
      if (!Array.isArray(payload.points) || payload.points.length < 2) throw new Error("Drawing requires at least two points");
      visual = { id, kind: payload.kind, frame, zIndex: maxZ + 1, points: copy(payload.points), stroke: payload.stroke ?? "#222", strokeWidth: payload.strokeWidth ?? 3 };
    } else if (payload.kind === "text") {
      visual = { id, kind: payload.kind, frame, zIndex: maxZ + 1, text: payload.text ?? "Text", color: payload.color ?? "#222", fontSize: payload.fontSize ?? 24, align: payload.align ?? "left" };
    } else {
      visual = { id, kind: payload.kind, frame, zIndex: maxZ + 1, fill: payload.fill ?? "#eeeaff", stroke: payload.stroke ?? "#6c5ce7", strokeWidth: payload.strokeWidth ?? 2 };
    }
    this.reactEditor.editor.batchUpdates(() => this.elements.set(id, visual as unknown as BasicCRDTType));
    this.selection.set([{ kind: "visual", id }]);
    return id;
  }

  /** Patches one visual record after validating identity and geometry. */
  update({ id, patch }: UpdateVisualPayload): void {
    const current = this.visual(id);
    if (!current) throw new Error(`Edgeless visual ${id} not found`);
    const safePatch = { ...copy(patch) } as Record<string, unknown>;
    delete safePatch.id;
    delete safePatch.kind;
    const next = { ...current, ...safePatch } as EdgelessVisual;
    if (patch.frame) next.frame = this.frame({ ...current.frame, ...patch.frame });
    this.reactEditor.editor.batchUpdates(() => this.elements.set(id, next as unknown as BasicCRDTType));
  }

  /** Moves the complete active mixed selection by a canvas delta. */
  move(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Move delta must be finite");
    this.translate(this.selection.get().items, dx, dy);
  }

  /** Scales the active selection to an exact outer size. */
  resize(width: number, height: number): void {
    const items = this.selection.get().items;
    const bounds = unionFrames(items.flatMap((item) => this.bounds(item) ?? []));
    if (!bounds || width <= 0 || height <= 0) return;
    const leaves = this.leaves(items);
    this.reactEditor.editor.batchUpdates(() => leaves.forEach((leaf) => {
      const frame = this.bounds(leaf);
      if (!frame) return;
      this.setFrame(leaf, {
        x: bounds.x + (frame.x - bounds.x) * width / bounds.width,
        y: bounds.y + (frame.y - bounds.y) * height / bounds.height,
        width: frame.width * width / bounds.width,
        height: frame.height * height / bounds.height,
      });
    }));
  }

  /** Creates one nested-capable group from same-parent selected objects. */
  group(): string {
    const items = [...this.selection.get().items];
    if (items.length < 2) throw new Error("Grouping requires at least two objects");
    const parents = new Set(items.map((item) => this.parentId(item)));
    if (parents.size !== 1) throw new Error("Grouped objects must share one parent");
    const id = crypto.randomUUID();
    const parentId = [...parents][0];
    const group: VisualGroup = { id, title: `Group ${this.groups.size + 1}`, children: items };
    this.reactEditor.editor.batchUpdates(() => {
      if (parentId) {
        const parent = this.groupRecord(parentId)!;
        this.groups.set(parentId, { ...parent, children: parent.children.map((child) => (
          items.some((item) => this.equalRef(item, child)) ? { kind: "group" as const, id } : child
        )).filter((child, index, all) => all.findIndex((candidate) => this.equalRef(candidate, child)) === index) } as unknown as BasicCRDTType);
      }
      this.groups.set(id, group as unknown as BasicCRDTType);
    });
    this.selection.set([{ kind: "group", id }]);
    return id;
  }

  /** Replaces selected groups with their children and removes their records. */
  ungroup(): void {
    const selected = this.selection.get().items.filter((item) => item.kind === "group");
    const children: EdgelessSelectionRef[] = [];
    this.reactEditor.editor.batchUpdates(() => selected.forEach((item) => {
      const group = this.groupRecord(item.id);
      if (!group) return;
      children.push(...group.children);
      const parentId = this.parentId(item);
      if (parentId) {
        const parent = this.groupRecord(parentId)!;
        this.groups.set(parentId, { ...parent, children: parent.children.flatMap((child) => this.equalRef(child, item) ? group.children : [child]) } as unknown as BasicCRDTType);
      }
      this.groups.delete(item.id);
    }));
    this.selection.set(children);
  }

  /** Aligns selected top-level objects without changing their sizes. */
  align(mode: EdgelessAlignment): void {
    const items = this.selection.get().items;
    const entries = items.flatMap((item) => {
      const bounds = this.bounds(item);
      return bounds ? [{ item, bounds }] : [];
    });
    const outer = unionFrames(entries.map(({ bounds }) => bounds));
    if (!outer || entries.length < 2) return;
    this.reactEditor.editor.batchUpdates(() => entries.forEach(({ item, bounds }) => {
        const dx = mode === "left" ? outer.x - bounds.x : mode === "center" ? outer.x + outer.width / 2 - bounds.width / 2 - bounds.x : mode === "right" ? outer.x + outer.width - bounds.width - bounds.x : 0;
        const dy = mode === "top" ? outer.y - bounds.y : mode === "middle" ? outer.y + outer.height / 2 - bounds.height / 2 - bounds.y : mode === "bottom" ? outer.y + outer.height - bounds.height - bounds.y : 0;
        if (dx || dy) this.translate([item], dx, dy);
      }));
  }

  /** Distributes three or more selected objects across their current outer span. */
  distribute(axis: "horizontal" | "vertical"): void {
    const entries = this.selection.get().items.flatMap((item) => {
      const bounds = this.bounds(item);
      return bounds ? [{ item, bounds }] : [];
    }).sort((a, b) => axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y);
    if (entries.length < 3) return;
    const first = entries[0]!.bounds;
    const last = entries.at(-1)!.bounds;
    const occupied = entries.reduce((sum, entry) => sum + (axis === "horizontal" ? entry.bounds.width : entry.bounds.height), 0);
    const span = axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y;
    const gap = (span - occupied) / (entries.length - 1);
    let cursor = axis === "horizontal" ? first.x : first.y;
    this.reactEditor.editor.batchUpdates(() => entries.forEach(({ item, bounds }) => {
        const delta = cursor - (axis === "horizontal" ? bounds.x : bounds.y);
        if (delta) this.translate([item], axis === "horizontal" ? delta : 0, axis === "vertical" ? delta : 0);
        cursor += (axis === "horizontal" ? bounds.width : bounds.height) + gap;
      }));
  }

  /** Reorders selected leaves in the one layer shared with root block layouts. */
  reorder(direction: EdgelessReorder): void {
    const selected = new Set(this.leaves(this.selection.get().items).map((item) => `${item.kind}:${item.id}`));
    const layers: EdgelessSelectionRef[] = [
      ...this.rootBlocks().map((block) => ({ kind: "block", id: block.id } as const)),
      ...this.getVisuals().map((visual) => ({ kind: "visual", id: visual.id } as const)),
    ].sort((a, b) => (this.boundsWithZ(a)?.zIndex ?? 0) - (this.boundsWithZ(b)?.zIndex ?? 0));
    const moving = layers.filter((item) => selected.has(`${item.kind}:${item.id}`));
    const next = layers.filter((item) => !selected.has(`${item.kind}:${item.id}`));
    if (direction === "front") next.push(...moving);
    else if (direction === "back") next.unshift(...moving);
    else moving.forEach((item) => {
      const old = layers.indexOf(item);
      const base = next.filter((candidate) => layers.indexOf(candidate) < old).length;
      const index = direction === "forward" ? Math.min(next.length, base + 1) : Math.max(0, base - 1);
      next.splice(index, 0, item);
    });
    this.reactEditor.editor.batchUpdates(() => next.forEach((item, zIndex) => this.setZ(item, zIndex)));
  }

  /** Structurally deletes every selected block, visual, and selected group. */
  deleteSelection(): void {
    const leaves = this.leaves(this.selection.get().items);
    const blockIds = leaves.filter((item) => item.kind === "block").map((item) => item.id);
    const visuals = leaves.filter((item) => item.kind === "visual").map((item) => item.id);
    this.reactEditor.editor.batchUpdates(() => {
      blockIds.forEach((id) => this.reactEditor.editor.blocks.removeBlock(id));
      visuals.forEach((id) => this.elements.delete(id));
      this.selection.get().items.filter((item) => item.kind === "group").forEach((item) => this.groups.delete(item.id));
      this.normalizeGroups();
    });
    this.selection.clear();
  }

  /** Registers all command names owned by this opt-in extension. @returns No value. */
  private registerCommands(): void {
    const register = (name: string, handler: (payload: any) => unknown) => {
      this.registrations.push(this.reactEditor.editor.register(name, handler));
    };
    register("edgeless.visual.create", (value) => this.create(value as CreateVisualPayload));
    register("edgeless.visual.update", (value) => this.update(value as UpdateVisualPayload));
    register("edgeless.visual.duplicate", () => this.duplicateSelection());
    register("edgeless.visual.delete", () => this.deleteSelection());
    register("edgeless.selection.get", () => this.selection.get());
    register("edgeless.selection.set", (value) => this.setSelection(value?.items ?? value));
    register("edgeless.selection.clear", () => this.selection.clear());
    register("edgeless.selection.move", (value) => this.move(Number(value?.dx), Number(value?.dy)));
    register("edgeless.selection.resize", (value) => this.resize(Number(value?.width), Number(value?.height)));
    register("edgeless.selection.group", () => this.group());
    register("edgeless.selection.ungroup", () => this.ungroup());
    register("edgeless.selection.align", (value) => {
      const mode = (value?.alignment ?? value) as EdgelessAlignment;
      if (!["left", "center", "right", "top", "middle", "bottom"].includes(mode)) throw new Error("Unsupported alignment");
      this.align(mode);
    });
    register("edgeless.selection.distribute", (value) => {
      const axis = value?.axis ?? value;
      if (axis !== "horizontal" && axis !== "vertical") throw new Error("Unsupported distribution axis");
      this.distribute(axis);
    });
    register("edgeless.selection.reorder", (value) => {
      const direction = (value?.direction ?? value) as EdgelessReorder;
      if (!["front", "forward", "backward", "back"].includes(direction)) throw new Error("Unsupported reorder direction");
      this.reorder(direction);
    });
    register("edgeless.tool.set", (value) => this.setTool((value?.tool ?? value) as EdgelessVisualTool));
  }

  /** Captures mixed edgeless clipboard events before the page clipboard bridge. @returns No value. */
  private registerClipboard(): void {
    const write = (event: ClipboardEvent, cut: boolean): boolean => {
      const snapshot = this.selection.get();
      if (!snapshot.active || !snapshot.items.some((item) => item.kind !== "block")) return false;
      const bundle = this.createClipboardBundle(snapshot.items);
      const text = this.clipboardText(bundle);
      event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, JSON.stringify(bundle));
      event.clipboardData?.setData("text/plain", text);
      event.clipboardData?.setData("text/html", `<p>${this.escapeHtml(text).replace(/\n/g, "<br>")}</p>`);
      event.clipboardData?.setData("text/markdown", text);
      if (cut) this.cutSelection();
      return true;
    };
    this.reactEditor.events.register({ id: "edgeless.visuals.copy", type: "copy", capture: true, mode: "edgeless" }, ({ raw }) => write(raw, false));
    this.reactEditor.events.register({ id: "edgeless.visuals.cut", type: "cut", capture: true, mode: "edgeless" }, ({ raw }) => write(raw, true));
    this.reactEditor.events.register({ id: "edgeless.visuals.paste", type: "paste", capture: true, mode: "edgeless" }, ({ raw }) => {
      const structured = raw.clipboardData?.getData(RIVTO_CLIPBOARD_MIME);
      if (!structured) return false;
      const bundle = JSON.parse(structured) as ClipboardBundle;
      if (!isRecord(bundle.pluginData?.[EDGELESS_VISUALS_PLUGIN_ID])) return false;
      this.pasteClipboardBundle(bundle);
      return true;
    });
  }

  /**
   * Serializes selected blocks, visuals, links, and nested group records.
   * @param items - Top-level canvas references selected for copying.
   * @returns Lossless Rivto bundle carrying this extension's namespace.
   */
  private createClipboardBundle(items: readonly EdgelessSelectionRef[]): ClipboardBundle {
    const leaves = this.leaves(items);
    const blockIds = new Set(leaves.filter((item) => item.kind === "block").map((item) => item.id));
    const visualIds = new Set(leaves.filter((item) => item.kind === "visual").map((item) => item.id));
    const groupIds = new Set<string>();
    const collectGroup = (id: string): void => {
      if (groupIds.has(id)) return;
      const group = this.groupRecord(id);
      if (!group) return;
      groupIds.add(id);
      group.children.filter((child) => child.kind === "group").forEach((child) => collectGroup(child.id));
    };
    items.filter((item) => item.kind === "group").forEach((item) => collectGroup(item.id));
    const blocks = this.rootBlocks().filter((block) => blockIds.has(block.id)).map((block) => copy(block));
    const allBlockIds = new Set<string>();
    const visit = (block: EditorBlock): void => {
      allBlockIds.add(block.id);
      block.children.forEach(visit);
    };
    blocks.forEach(visit);
    const links = this.reactEditor.editor.links.getLinks().filter((link) => allBlockIds.has(link.from.blockId) && allBlockIds.has(link.to.blockId));
    return {
      version: 2,
      blocks,
      links,
      pluginData: {
        [EDGELESS_VISUALS_PLUGIN_ID]: {
          version: 1,
          selection: copy(items),
          elements: this.getVisuals().filter((visual) => visualIds.has(visual.id)),
          groups: this.getGroups().filter((group) => groupIds.has(group.id)),
        },
      },
    };
  }

  /**
   * Pastes a visual clipboard namespace and remaps every carried identity.
   * @param bundle - Structured mixed clipboard bundle to insert atomically.
   * @returns No value.
   * @throws {Error} When the visual namespace is malformed.
   */
  private pasteClipboardBundle(bundle: ClipboardBundle): void {
    const payload = bundle.pluginData?.[EDGELESS_VISUALS_PLUGIN_ID];
    if (!isRecord(payload) || !Array.isArray(payload.elements) || !Array.isArray(payload.groups)) {
      throw new Error("Invalid edgeless visuals clipboard payload");
    }
    const blockMap = new Map<string, string>();
    const remapBlock = (block: EditorBlock): EditorBlockInput => {
      const id = crypto.randomUUID();
      blockMap.set(block.id, id);
      return {
        ...copy(block),
        id,
        layout: block.layout ? { ...block.layout, x: block.layout.x + 24, y: block.layout.y + 24 } : undefined,
        children: block.children.map(remapBlock),
      };
    };
    const blocks = bundle.blocks.map(remapBlock);
    const visualMap = new Map<string, string>();
    const visuals = payload.elements.map((value) => this.validateVisual(value)).map((visual) => {
      const id = crypto.randomUUID();
      visualMap.set(visual.id, id);
      return { ...copy(visual), id, frame: { ...visual.frame, x: visual.frame.x + 24, y: visual.frame.y + 24 } };
    });
    const sourceGroups = payload.groups.map((value) => this.validateGroup(value));
    const groupMap = new Map(sourceGroups.map((group) => [group.id, crypto.randomUUID()]));
    const remapRef = (item: EdgelessSelectionRef): EdgelessSelectionRef | undefined => {
      const id = item.kind === "block" ? blockMap.get(item.id) : item.kind === "visual" ? visualMap.get(item.id) : groupMap.get(item.id);
      return id ? { ...item, id } : undefined;
    };
    const groups = sourceGroups.map((group) => ({
      ...copy(group),
      id: groupMap.get(group.id)!,
      children: group.children.flatMap((child) => remapRef(child) ?? []),
    }));
    const selected = (Array.isArray(payload.selection) ? payload.selection as EdgelessSelectionRef[] : []).flatMap((item) => remapRef(item) ?? []);
    this.reactEditor.editor.batchUpdates(() => {
      let afterId = this.rootBlocks().at(-1)?.id;
      blocks.forEach((block) => { afterId = this.reactEditor.editor.blocks.insertBlock(block, afterId); });
      bundle.links.forEach((link) => {
        const from = blockMap.get(link.from.blockId);
        const to = blockMap.get(link.to.blockId);
        if (from && to) this.reactEditor.editor.links.createLink({ ...copy(link), id: crypto.randomUUID(), from: { ...link.from, blockId: from }, to: { ...link.to, blockId: to } });
      });
      visuals.forEach((visual) => this.elements.set(visual.id, visual as unknown as BasicCRDTType));
      groups.forEach((group) => this.groups.set(group.id, group as unknown as BasicCRDTType));
    });
    this.selection.set(selected.length ? selected : [
      ...blocks.map((block) => ({ kind: "block", id: block.id! } as const)),
      ...visuals.map((visual) => ({ kind: "visual", id: visual.id } as const)),
    ]);
  }

  /** Removes a copied mixed selection structurally as one undo item. @returns No value. */
  private cutSelection(): void {
    const items = this.selection.get().items;
    const leaves = this.leaves(items);
    this.reactEditor.editor.batchUpdates(() => {
      leaves.filter((item) => item.kind === "block").forEach((item) => this.reactEditor.editor.blocks.removeBlock(item.id));
      leaves.filter((item) => item.kind === "visual").forEach((item) => this.elements.delete(item.id));
      items.filter((item) => item.kind === "group").forEach((item) => this.groups.delete(item.id));
      this.normalizeGroups();
    });
    this.selection.clear();
  }

  /**
   * Builds the interoperable plain-text flavor for a mixed bundle.
   * @param bundle - Structured clipboard data to summarize.
   * @returns Block, visual-text, and sticker text joined by newlines.
   */
  private clipboardText(bundle: ClipboardBundle): string {
    const payload = bundle.pluginData?.[EDGELESS_VISUALS_PLUGIN_ID];
    const visuals = isRecord(payload) && Array.isArray(payload.elements) ? payload.elements as EdgelessVisual[] : [];
    const blockText = bundle.blocks.map((block) => block.content).filter(Boolean);
    const visualText = visuals.flatMap((visual) => visual.kind === "text" ? [visual.text] : visual.kind === "sticker" ? [visual.source.type === "emoji" ? visual.source.value : visual.alt] : []);
    return [...blockText, ...visualText].filter(Boolean).join("\n");
  }

  /**
   * Escapes clipboard fallback text before HTML embedding.
   * @param value - Untrusted plain text.
   * @returns HTML-safe text.
   */
  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
  }

  /**
   * Changes the local creation tool and notifies the mounted toolbar.
   * @param tool - Supported select or freehand tool.
   * @returns No value.
   */
  private setTool(tool: EdgelessVisualTool): void {
    if (tool !== "select" && tool !== "drawing") throw new Error("Unsupported edgeless visual tool");
    this.currentTool = tool;
    [...this.listeners].forEach((listener) => listener());
  }

  /**
   * Validates external references before publishing local canvas selection.
   * @param value - Unknown command payload or reference list.
   * @returns No value.
   * @throws {Error} For malformed or missing canvas objects.
   */
  private setSelection(value: unknown): void {
    if (!Array.isArray(value)) throw new Error("Edgeless selection must be a list");
    const roots = new Set(this.rootBlocks().map((block) => block.id));
    const visuals = new Set(this.getVisuals().map((visual) => visual.id));
    const groups = new Set(this.getGroups().map((group) => group.id));
    const items = value.map((item): EdgelessSelectionRef => {
      if (!isRecord(item) || !["block", "visual", "group"].includes(String(item.kind)) || typeof item.id !== "string") {
        throw new Error("Invalid edgeless selection reference");
      }
      const ref = { kind: item.kind as EdgelessSelectionRef["kind"], id: item.id };
      const exists = ref.kind === "block" ? roots.has(ref.id) : ref.kind === "visual" ? visuals.has(ref.id) : groups.has(ref.id);
      if (!exists) throw new Error(`Edgeless ${ref.kind} ${ref.id} not found`);
      return ref;
    });
    this.selection.set(items);
  }

  /** @returns Fresh references created by duplicating the active mixed selection. */
  private duplicateSelection(): EdgelessSelectionRef[] {
    const items = this.selection.get().items;
    if (!items.length) return [];
    this.pasteClipboardBundle(this.createClipboardBundle(items));
    return [...this.selection.get().items];
  }

  /**
   * Translates unique descendant leaves in one transaction.
   * @param items - Blocks, visuals, or recursive groups to move.
   * @param dx - Horizontal canvas delta.
   * @param dy - Vertical canvas delta.
   * @returns No value.
   */
  private translate(items: readonly EdgelessSelectionRef[], dx: number, dy: number): void {
    const leaves = this.leaves(items);
    this.reactEditor.editor.batchUpdates(() => leaves.forEach((leaf) => {
      const frame = this.bounds(leaf);
      if (frame) this.setFrame(leaf, { ...frame, x: frame.x + dx, y: frame.y + dy });
    }));
  }

  /**
   * Expands nested groups into unique block and visual leaves.
   * @param items - References to flatten.
   * @param visited - Cycle and duplicate guard shared by recursion.
   * @returns Unique leaf references in traversal order.
   */
  private leaves(items: readonly EdgelessSelectionRef[], visited = new Set<string>()): EdgelessSelectionRef[] {
    return items.flatMap((item): EdgelessSelectionRef[] => {
      const key = `${item.kind}:${item.id}`;
      if (visited.has(key)) return [];
      visited.add(key);
      if (item.kind !== "group") return [item];
      return this.leaves(this.groupRecord(item.id)?.children ?? [], visited);
    });
  }

  /** @param item - Canvas object to measure. @returns Leaf or derived group bounds. */
  private bounds(item: EdgelessSelectionRef): VisualFrame | undefined {
    if (item.kind === "visual") return this.visual(item.id)?.frame;
    if (item.kind === "block") return this.reactEditor.editor.blocks.getBlock(item.id)?.layout;
    const group = this.groupRecord(item.id);
    return group ? unionFrames(group.children.flatMap((child) => this.bounds(child) ?? [])) : undefined;
  }

  /** @param item - Layer leaf to inspect. @returns Geometry including persisted z-index. */
  private boundsWithZ(item: EdgelessSelectionRef): (VisualFrame & { zIndex: number }) | undefined {
    if (item.kind === "visual") {
      const visual = this.visual(item.id);
      return visual ? { ...visual.frame, zIndex: visual.zIndex } : undefined;
    }
    return this.reactEditor.editor.blocks.getBlock(item.id)?.layout;
  }

  /** @param item - Block or visual leaf. @param frame - Replacement geometry. @returns No value. */
  private setFrame(item: EdgelessSelectionRef, frame: VisualFrame): void {
    const next = this.frame(frame);
    if (item.kind === "block") this.reactEditor.editor.blocks.setBlockLayout(item.id, next);
    else if (item.kind === "visual") {
      const visual = this.visual(item.id);
      if (visual) this.elements.set(item.id, { ...visual, frame: next } as unknown as BasicCRDTType);
    }
  }

  /** @param item - Block or visual leaf. @param zIndex - Normalized layer index. @returns No value. */
  private setZ(item: EdgelessSelectionRef, zIndex: number): void {
    if (item.kind === "block") this.reactEditor.editor.blocks.setBlockLayout(item.id, { zIndex });
    else if (item.kind === "visual") {
      const visual = this.visual(item.id);
      if (visual) this.elements.set(item.id, { ...visual, zIndex } as unknown as BasicCRDTType);
    }
  }

  /** @param item - Child reference to locate. @returns Owning group ID when grouped. */
  private parentId(item: EdgelessSelectionRef): string | undefined {
    return this.getGroups().find((group) => group.children.some((child) => this.equalRef(child, item)))?.id;
  }

  /** @returns Whether two typed references identify the same canvas object. */
  private equalRef(left: EdgelessSelectionRef, right: EdgelessSelectionRef): boolean {
    return left.kind === right.kind && left.id === right.id;
  }

  /**
   * Removes missing, duplicate, multiply-parented, self, and cyclic group references.
   * @returns No value.
   */
  private normalizeGroups(): void {
    const blockIds = new Set(this.rootBlocks().map((block) => block.id));
    const visualIds = new Set(this.getVisuals().map((visual) => visual.id));
    const groupIds = new Set(this.getGroups().map((group) => group.id));
    const groups = new Map(this.getGroups().map((group) => [group.id, group]));
    const parents = new Set<string>();
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return groups.get(from)?.children.some((child) => child.kind === "group" && reaches(child.id, target, seen)) ?? false;
    };
    groups.forEach((group) => {
      const local = new Set<string>();
      const children = group.children.filter((child) => {
        const key = `${child.kind}:${child.id}`;
        const valid = child.kind === "block" ? blockIds.has(child.id) : child.kind === "visual" ? visualIds.has(child.id) : groupIds.has(child.id) && !reaches(child.id, group.id);
        if (!valid || local.has(key) || parents.has(key)) return false;
        local.add(key);
        parents.add(key);
        return true;
      });
      if (!children.length) this.groups.delete(group.id);
      else if (children.length !== group.children.length) this.groups.set(group.id, { ...group, children } as unknown as BasicCRDTType);
    });
  }

  /** @param id - Visual record identity. @returns Detached visual or undefined. */
  private visual(id: string): EdgelessVisual | undefined {
    const value = this.elements.get(id);
    return isRecord(value) ? copy(value) as unknown as EdgelessVisual : undefined;
  }

  /** @param id - Group record identity. @returns Detached group or undefined. */
  private groupRecord(id: string): VisualGroup | undefined {
    const value = this.groups.get(id);
    return isRecord(value) ? copy(value) as unknown as VisualGroup : undefined;
  }

  /** @returns Detached document root blocks eligible as canvas objects. */
  private rootBlocks(): EditorBlock[] { return this.reactEditor.editor.blocks.getBlocks(); }

  /** @param value - Candidate geometry. @returns Validated geometry. @throws {Error} For invalid sizes or coordinates. */
  private frame(value: VisualFrame): VisualFrame {
    if (![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) {
      throw new Error("Visual frame requires finite positive geometry");
    }
    return value;
  }

  /**
   * Materializes one shared record map while retaining loaded portable fields.
   * @param key - Namespace field assigned to elements or groups.
   * @returns Attached collaborative child map.
   */
  private childMap(key: "elements" | "groups"): RecordMap {
    const current = this.namespace.get(key);
    if (current && typeof current === "object" && "entries" in current && "set" in current) return current as RecordMap;
    const map = this.reactEditor.editor.document.crdt.instantiator.createMap<Record<string, BasicCRDTType>>();
    if (isRecord(current)) Object.entries(current).forEach(([id, value]) => map.set(id, value as BasicCRDTType));
    this.namespace.set(key, map);
    return map;
  }

  /**
   * Validates one visual record received from an external clipboard.
   * @param value - Untrusted structured value.
   * @returns Narrowed visual record with valid geometry.
   * @throws {Error} When required fields are missing.
   */
  private validateVisual(value: unknown): EdgelessVisual {
    if (!isRecord(value) || typeof value.id !== "string" || !["sticker", "drawing", "rectangle", "ellipse", "text"].includes(String(value.kind)) || !isRecord(value.frame)) {
      throw new Error("Invalid edgeless visual clipboard record");
    }
    this.frame(value.frame as unknown as VisualFrame);
    if (typeof value.zIndex !== "number" || !Number.isFinite(value.zIndex)) throw new Error("Invalid visual z-index");
    if (value.kind === "sticker" && (!isRecord(value.source) || !["image", "emoji"].includes(String(value.source.type)))) throw new Error("Invalid sticker source");
    if (value.kind === "drawing" && !Array.isArray(value.points)) throw new Error("Invalid drawing points");
    if (value.kind === "text" && typeof value.text !== "string") throw new Error("Invalid visual text");
    return copy(value) as unknown as EdgelessVisual;
  }

  /**
   * Validates one logical group received from an external clipboard.
   * @param value - Untrusted structured value.
   * @returns Narrowed group record.
   * @throws {Error} When identity or child references are malformed.
   */
  private validateGroup(value: unknown): VisualGroup {
    if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.children) || value.children.some((child) => !isRecord(child) || typeof child.id !== "string" || !["block", "visual", "group"].includes(String(child.kind)))) {
      throw new Error("Invalid edgeless group clipboard record");
    }
    return copy(value) as unknown as VisualGroup;
  }
}

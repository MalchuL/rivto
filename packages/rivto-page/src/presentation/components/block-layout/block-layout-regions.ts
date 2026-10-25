import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";

/** Mounted layout roles shared by hover, selection and drop geometry. */
export type BlockLayoutRegion = "shell" | "row" | "content" | "children" | "body" | "slot" | "item";

/** Registration attached to an element without retaining detached DOM globally. */
interface MountedRegion {
  readonly blockId: string;
  readonly role: BlockLayoutRegion;
  readonly registry: Pick<BlockLayoutRegions, "get">;
}

const mounted = new WeakMap<HTMLElement, MountedRegion>();

/** Owns addressed layout elements for one editor occurrence; refs own their registrations. */
export class BlockLayoutRegions {
  private readonly owners = new Map<string, Set<HTMLElement>>();

  /**
   * Registers the actual element supplied by a primitive's committed ref.
   *
   * Multiple slots/items are allowed. Disposing an older registration cannot
   * erase a replacement registration on the same element.
   *
   * @param blockId - Owner within this editor occurrence.
   * @param role - Layout responsibility, independent of DOM depth.
   * @param element - Mounted primitive element.
   * @returns Idempotent disposer releasing only this registration.
   */
  register(blockId: string, role: BlockLayoutRegion, element: HTMLElement): () => void {
    const entry = { blockId, role, registry: this };
    const elements = this.owners.get(blockId) ?? new Set<HTMLElement>();
    elements.add(element);
    this.owners.set(blockId, elements);
    mounted.set(element, entry);
    return () => {
      if (mounted.get(element) !== entry) {
        return;
      }
      mounted.delete(element);
      elements.delete(element);
      if (!elements.size) {
        this.owners.delete(blockId);
      }
    };
  }

  /**
   * Reads one owner's mounted region without walking its child blocks.
   *
   * @param blockId - Addressed owner identity.
   * @param role - Requested layout responsibility.
   * @param within - Optional containing shell, distinguishing nested occurrences.
   * @returns First matching region, or undefined when omitted by the layout.
   */
  get(blockId: string, role: BlockLayoutRegion, within?: HTMLElement): HTMLElement | undefined {
    for (const element of this.owners.get(blockId) ?? []) {
      const entry = mounted.get(element);
      if (
        entry?.registry === this &&
        entry.blockId === blockId &&
        entry.role === role &&
        (!within || within.contains(element))
      ) {
        return element;
      }
    }
    return undefined;
  }

  /**
   * Releases region references when the host destroys this editor.
   *
   * @returns No mounted elements remain owned by this registry.
   */
  destroy(): void {
    for (const elements of this.owners.values()) {
      for (const element of elements) {
        if (mounted.get(element)?.registry === this) {
          mounted.delete(element);
        }
      }
    }
    this.owners.clear();
  }
}

/**
 * Finds the owning primary row for a native hit on an explicitly placed slot.
 *
 * @param hit - Native element hit within an editor occurrence.
 * @returns Owner row for a registered slot/body, or undefined for ordinary content.
 */
export function blockSlotRow(hit: Element): HTMLElement | undefined {
  for (let element: Element | null = hit; element; element = element.parentElement) {
    const entry = mounted.get(element as HTMLElement);
    if (entry?.role === "slot" || entry?.role === "body") {
      return entry.registry.get(entry.blockId, "row");
    }
    if (element.matches("[data-block-id], [data-rivto-block-editor]")) {
      break;
    }
  }
  return undefined;
}

/**
 * Finds one canonical child placement inside a mounted list without scanning the document.
 *
 * @param host - Child host containing the neighbor's placement.
 * @param blockId - Canonical neighbor identity from a validated destination.
 * @returns Outermost matching item or shell, or undefined when hidden/unmounted.
 */
export function blockLayoutNeighbor(host: HTMLElement, blockId: string): HTMLElement | undefined {
  const entry = mounted.get(host);
  if (entry) {
    const shell = entry.registry.get(blockId, "shell", host);
    if (!shell) {
      return undefined;
    }
    let item = shell;
    while (item.parentElement && item.parentElement !== host) {
      item = item.parentElement;
    }
    return item;
  }
  for (const element of host.children) {
    const child = element as HTMLElement;
    if (child.dataset.blockItemId === blockId || child.dataset.blockId === blockId) {
      return child;
    }
  }
  return undefined;
}

const selectors: Record<BlockLayoutRegion, string> = {
  shell: "[data-block-id]",
  row: `.${BLOCK_EDITOR_CLASSES.row}`,
  content: `.${BLOCK_EDITOR_CLASSES.content}`,
  children: `.${BLOCK_EDITOR_CLASSES.children}`,
  body: '[data-slot-position="body"]',
  slot: "[data-slot-position]",
  item: "[data-block-item-id]",
};

/**
 * Resolves an owner's region independently of intervening layout wrappers.
 *
 * Registered shells and items use addressed lookup. Standalone DOM consumers use bounded
 * traversal that stops at child shells and nested editors, never borrowing a
 * descendant's row or slot. No geometry is measured by this lookup.
 *
 * @param shell - Registered layout owner (shell or item), or a canonical block shell for standalone DOM lookup.
 * @param role - Region to locate inside that shell.
 * @returns Owned region, or undefined when the layout omits it.
 */
export function blockLayoutRegion(
  shell: HTMLElement,
  role: BlockLayoutRegion,
): HTMLElement | undefined {
  const owner = mounted.get(shell);
  if (owner) {
    return owner.registry.get(owner.blockId, role, shell);
  }
  const pending = Array.from(shell.children);
  while (pending.length) {
    const element = pending.shift()!;
    if (element.matches("[data-block-id], [data-rivto-block-editor]")) {
      continue;
    }
    if (element.matches(selectors[role])) {
      return element as HTMLElement;
    }
    pending.unshift(...element.children);
  }
  return undefined;
}

/**
 * Reads an explicitly registered owner's region without traversing fallback DOM.
 *
 * Pointer geometry uses this bounded lookup so an unregistered anchor cannot
 * borrow a descendant block's body or scan a large editor subtree.
 *
 * @param element - Existing anchor registered by a layout primitive.
 * @param role - Owned region to read within that anchor and editor occurrence.
 * @returns Current registered region, or undefined for unregistered/omitted regions.
 */
export function registeredBlockRegion(
  element: HTMLElement,
  role: BlockLayoutRegion,
): HTMLElement | undefined {
  const owner = mounted.get(element);
  return owner?.registry.get(owner.blockId, role, element);
}

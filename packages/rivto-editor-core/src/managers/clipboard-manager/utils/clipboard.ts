import type { NormalizedSelection } from "../../selection-manager";
import type { Block, BlockInput, Link } from "../../../store/document-model";
import type { ClipboardBundle } from "../types";
import { BLOCK_LIST_TYPES, resolveBlockListNumbers, type BlockListType } from "../../../blocks";

/**
 * Detached clipboard data after every persisted identity has been remapped.
 *
 * The shape separates children of the first copied block because text-merging
 * paste reuses the destination block ID instead of inserting that first root.
 */
export interface RemappedClipboardBundle {
  /** New root blocks inserted after the destination block. */
  blocks: BlockInput[];
  /** Children formerly owned by a first root whose ID is being reused. */
  firstChildren: BlockInput[];
  /** Links rebuilt with fresh IDs and remapped block endpoints. */
  links: Link[];
}

/**
 * Flattens a detached block forest in pre-order depth-first document order.
 *
 * Parents always appear before descendants and sibling order is retained. The
 * returned array contains the original detached block objects; it does not
 * clone or mutate them.
 *
 * @param blocks - Root blocks of the detached forest to traverse.
 * @returns Every root and descendant in portable document order.
 */
export function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/**
 * Deep-clones one portable block subtree.
 *
 * Copy preparation trims text at selection boundaries. Cloning prevents those
 * changes from mutating document snapshots or sharing mutable props, plugin
 * data and child arrays with the source.
 *
 * @param block - Detached source block to clone.
 * @returns An identity-preserving deep clone safe for clipboard modification.
 */
function cloneBlock(block: Block): Block {
  return {
    ...block,
    props: { ...block.props },
    pluginData: { ...block.pluginData },
    children: block.children.map(cloneBlock),
  };
}

/**
 * Finds a block inside a detached forest by its stable document ID.
 *
 * @param blocks - Roots to search recursively in document order.
 * @param id - Stable block ID to locate.
 * @returns The matching detached block, or undefined when it is absent.
 */
export function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return undefined;
}

/**
 * Builds a child-ID to direct-parent-ID lookup for a detached forest.
 *
 * @param blocks - Roots whose complete descendants should be indexed.
 * @param parents - Accumulator used by recursive calls.
 * @returns The supplied map populated for every non-root block.
 */
function indexParents(blocks: Block[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

/**
 * Produces the minimum set of copied roots for a normalized selection.
 *
 * If both a parent and descendant are selected, only the parent is returned
 * because its subtree already carries the descendant. Whole-block copy retains
 * all descendants of selected roots. Mixed text/block copy retains only
 * descendants explicitly covered by the normalized range.
 *
 * @param document - Complete detached document roots used to resolve ancestry.
 * @param range - Normalized selected blocks and text boundaries.
 * @param wholeBlocks - Whether selected roots carry their complete subtrees.
 * @returns Independent cloned roots in document order without duplicates.
 */
export function cloneSelectedTopLevelSubtrees(
  document: Block[],
  range: NormalizedSelection,
  wholeBlocks: boolean,
): Block[] {
  const selectedIds = new Set(range.blocks.map((block) => block.id));
  const parents = indexParents(document);
  const cloneSelection = (block: Block): Block => ({
    ...cloneBlock(block),
    children: block.children.filter((child) => selectedIds.has(child.id)).map(cloneSelection),
  });
  return range.blocks.filter((block) => {
    let parent = parents.get(block.id);
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  }).map(wholeBlocks ? cloneBlock : cloneSelection);
}

/**
 * Escapes user-authored text before embedding it in the `text/html` flavor.
 *
 * This is not a Markdown renderer. It only prevents block content from becoming
 * active or malformed HTML when copied into another application.
 *
 * @param value - Raw persisted block content.
 * @returns Text with HTML-significant characters replaced by entities.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

/** Portable clipboard formats derived from one selected block forest. */
export interface PortableClipboardFormats {
  /** Plain text with descendants indented by two spaces per level. */
  text: string;
  /** Escaped semantic HTML with descendants represented as nested lists. */
  html: string;
  /** Markdown source with descendants represented as nested list items. */
  markdown: string;
}

/**
 * Serializes one detached block forest without discarding its hierarchy.
 *
 * The callback is evaluated once per block so custom block definitions produce
 * identical text in every portable flavor. Ordinary `list` blocks use the
 * paragraph/outline representation, while checkbox and numbered modes
 * emit their explicit portable markers and semantic controls.
 *
 * @param blocks - Selected roots carrying their copied descendants.
 * @param toRawText - Resolves the portable text for one detached block.
 * @returns Plain-text, HTML, and Markdown clipboard flavors.
 */
export function serializeClipboardBlocks(
  blocks: Block[],
  toRawText: (block: Block) => string,
): PortableClipboardFormats {
  const serializeSiblings = (siblings: Block[], depth: number): PortableClipboardFormats => {
    const numbers = resolveBlockListNumbers(siblings);
    const serialized = siblings.map((block) => {
      const raw = toRawText(block);
      const lines = raw.split(/\r\n?|\n/);
      const number = numbers.get(block.id);
      const children = serializeSiblings(block.children, depth + 1);
      const escaped = escapeHtml(raw).replace(/\r\n?|\n/g, "<br>");
      if (block.listProps.type === "list") {
        const plainIndent = "  ".repeat(depth);
        const markdownIndent = "  ".repeat(Math.max(0, depth - 1));
        const markdownContinuation = "  ".repeat(depth);
        const ownText = lines.map((line) => plainIndent + line).join("\n");
        const ownMarkdown = depth === 0
          ? lines.join("\n")
          : lines.map((line, index) => (
            index === 0 ? `${markdownIndent}- ${line}` : markdownContinuation + line
          )).join("\n");
        return {
          text: children.text ? `${ownText}\n${children.text}` : ownText,
          html: depth === 0
            ? `<p>${escaped}</p>${children.html}`
            : `<li>${escaped}${children.html}</li>`,
          markdown: children.markdown ? `${ownMarkdown}\n${children.markdown}` : ownMarkdown,
          ordinaryHtmlItem: depth > 0,
        };
      }
      const marker = block.listProps.type === "checkbox"
        ? `- [${block.listProps.checked ? "x" : " "}] `
        : `${number}. `;
      const indent = "  ".repeat(depth);
      const continuation = indent + " ".repeat(marker.length);
      const own = lines.map((line, index) => `${index ? continuation : indent + marker}${line}`).join("\n");
      const checkbox = block.listProps.type === "checkbox"
        ? `<input type="checkbox" disabled${block.listProps.checked ? " checked" : ""}>`
        : "";
      const childHtml = children.html;
      const html = number === undefined
        ? `<ul><li>${checkbox}${escaped}${childHtml}</li></ul>`
        : `<ol start="${number}"><li value="${number}">${escaped}${childHtml}</li></ol>`;
      return {
        text: childHtml ? `${own}\n${children.text}` : own,
        html,
        markdown: childHtml ? `${own}\n${children.markdown}` : own,
        ordinaryHtmlItem: false,
      };
    });
    let html = "";
    let ordinaryItems = "";
    const flushOrdinaryItems = () => {
      if (!ordinaryItems) return;
      html += `<ul>${ordinaryItems}</ul>`;
      ordinaryItems = "";
    };
    serialized.forEach((item) => {
      if (item.ordinaryHtmlItem) ordinaryItems += item.html;
      else {
        flushOrdinaryItems();
        html += item.html;
      }
    });
    flushOrdinaryItems();
    return {
      text: serialized.map((item) => item.text).join("\n"),
      html,
      markdown: serialized.map((item) => item.markdown).join("\n"),
    };
  };

  return serializeSiblings(blocks, 0);
}

/**
 * Re-identifies every block and link in an incoming clipboard bundle.
 *
 * Clipboard IDs belong to the source document and cannot be inserted directly.
 * When `firstTargetId` is supplied, the first
 * copied root maps to the existing text target and is therefore omitted from
 * `blocks`; its children are returned separately for attachment to that target.
 *
 * @param bundle - Structured clipboard hierarchy to validate and remap.
 * @param firstTargetId - Existing destination ID reused for the first root.
 * @returns Fresh block inputs, detached first-root children, and remapped links.
 * @throws When required clipboard arrays are missing.
 */
export function remapClipboardBundle(
  bundle: ClipboardBundle,
  firstTargetId?: string,
): RemappedClipboardBundle {
  if (!Array.isArray(bundle.blocks) || !Array.isArray(bundle.links)) {
    throw new Error("Unsupported Rivto clipboard payload");
  }
  const validateBlock = (block: Block): void => {
    if (typeof block.collapsed !== "boolean" || !Array.isArray(block.children)) {
      throw new Error("Invalid Rivto clipboard block");
    }
    if (
      !block.listProps ||
      !BLOCK_LIST_TYPES.includes(block.listProps.type as BlockListType) ||
      typeof block.listProps.checked !== "boolean"
    ) {
      throw new Error("Invalid Rivto clipboard block list state");
    }
    block.children.forEach(validateBlock);
  };
  bundle.blocks.forEach(validateBlock);

  const idMap = new Map<string, string>();
  const remap = (block: Block): BlockInput => {
    const id = crypto.randomUUID();
    idMap.set(block.id, id);
    return {
      ...block,
      id,
      children: block.children.map(remap),
    };
  };
  const [first, ...rest] = bundle.blocks;
  if (first && firstTargetId) idMap.set(first.id, firstTargetId);
  const firstChildren = first && firstTargetId ? first.children.map(remap) : [];
  const blocks = firstTargetId ? rest.map(remap) : bundle.blocks.map(remap);
  const links = bundle.links.flatMap((link) => {
    const from = idMap.get(link.from.blockId);
    const to = idMap.get(link.to.blockId);
    return from && to ? [{
      ...link,
      id: crypto.randomUUID(),
      from: { ...link.from, blockId: from },
      to: { ...link.to, blockId: to },
    }] : [];
  });
  return { blocks, firstChildren, links };
}

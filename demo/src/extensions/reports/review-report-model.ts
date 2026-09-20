/**
 * Portable capture and validation for demo Review reports.
 *
 * The module contains no React or filesystem code, so tests and host adapters
 * can reuse the same snapshot rules. Captures always read current manager state
 * and return detached schema-v6 snapshots suitable for `editor.load()`.
 *
 * @module
 */
import type {
  BlockDefinition,
  EditorBlock,
  EditorBlockInput,
  EditorElement,
  EditorElementInput,
  EditorSnapshot,
  RivtoEditorApi,
} from "@chulane/rivto";
import { z } from "zod";

/** Persisted discriminator shared by Review blocks and canvas elements. */
export const REVIEW_REPORT_TYPE = "demo.review";

const SNAPSHOT_SCHEMA = z.object({
  version: z.literal(6),
  blocks: z.array(z.unknown()),
  elements: z.array(z.unknown()),
  pluginData: z.record(z.string(), z.unknown()).optional(),
}).strict();

/** Persisted properties owned by a Review block. */
export interface ReviewBlockProps extends Record<string, unknown> {
  blocksAbove: number;
  blocksBelow: number;
  includeReportBlock: boolean;
  snapshot: EditorSnapshot | null;
  savedAt: string | null;
}

/** Persisted properties owned by a Review canvas element. */
export interface ReviewElementProps extends Record<string, unknown> {
  problem: string;
  elementsAbove: number;
  elementsBelow: number;
  snapshot: EditorSnapshot | null;
  savedAt: string | null;
}

/** Placement details stored in the JSON report rather than its native snapshot. */
interface ReviewBlockPlacement {
  previousReportSiblingId: string | null;
  nextReportSiblingId: string | null;
  parentReportId: string | null;
}

interface ReviewReportBase {
  reportId: string;
  problem: string;
  savedAt: string;
  snapshot: EditorSnapshot;
}

/** Block report sent to the host persistence callback. */
interface ReviewBlockReport extends ReviewReportBase, ReviewBlockPlacement {
  kind: "block";
}

/** Canvas-element report sent to the host persistence callback. */
interface ReviewElementReport extends ReviewReportBase {
  kind: "element";
}

/** Self-describing report value passed to a host persistence callback. */
export type ReviewReport = ReviewBlockReport | ReviewElementReport;

/** Host-owned persistence boundary used by the standalone extension. */
export type SaveReviewReport = (report: ReviewReport) => Promise<void>;

/** Strict runtime schema for Review block properties. */
export const reviewBlockPropsSchema = z.object({
  blocksAbove: z.number().int().nonnegative(),
  blocksBelow: z.number().int().nonnegative(),
  includeReportBlock: z.boolean().default(false),
  snapshot: SNAPSHOT_SCHEMA.nullable(),
  savedAt: z.iso.datetime().nullable(),
}).strict() as z.ZodType<ReviewBlockProps>;

/** Strict runtime schema for Review canvas-element properties. */
export const reviewElementPropsSchema = z.object({
  problem: z.string(),
  elementsAbove: z.number().int().nonnegative(),
  elementsBelow: z.number().int().nonnegative(),
  snapshot: SNAPSHOT_SCHEMA.nullable(),
  savedAt: z.iso.datetime().nullable(),
}).strict() as z.ZodType<ReviewElementProps>;

/** Demo Review block definition installed by the standalone extension. */
export const reviewBlockDefinition: BlockDefinition<ReviewBlockProps> = {
  type: REVIEW_REPORT_TYPE,
  title: "Review report",
  defaultProps: {
    blocksAbove: 4,
    blocksBelow: 4,
    includeReportBlock: false,
    snapshot: null,
    savedAt: null,
  },
  propSchema: reviewBlockPropsSchema,
};

/**
 * Creates a Review block without capturing document state.
 *
 * @param problem - Initial editable problem statement.
 * @returns A Review block input whose snapshot metadata is empty.
 */
export function createReviewBlockInput(problem = ""): EditorBlockInput {
  return {
    type: REVIEW_REPORT_TYPE,
    content: problem,
    props: reviewBlockPropsSchema.parse({
      blocksAbove: 4,
      blocksBelow: 4,
      includeReportBlock: false,
      snapshot: null,
      savedAt: null,
    }),
  };
}

/**
 * Creates a Review canvas element without capturing document state.
 *
 * @param input - Required placement plus optional problem and window sizes.
 * @returns A complete first-class element input with validated defaults.
 */
export function createReviewElementInput(input: {
  frame: EditorElementInput["frame"];
  zIndex: number;
  id?: string;
  problem?: string;
  elementsAbove?: number;
  elementsBelow?: number;
}): EditorElementInput {
  return {
    id: input.id,
    type: REVIEW_REPORT_TYPE,
    frame: input.frame,
    zIndex: input.zIndex,
    props: reviewElementPropsSchema.parse({
      problem: input.problem ?? "",
      elementsAbove: input.elementsAbove ?? 2,
      elementsBelow: input.elementsBelow ?? 2,
      snapshot: null,
      savedAt: null,
    }),
  };
}

/**
 * Resolves an inclusive block-card range against current root order.
 *
 * @param element - Candidate block-card element.
 * @param rootIds - Current ordered root identifiers.
 * @returns Roots between valid endpoints, or an empty array.
 */
function blockCardRootIds(element: EditorElement, rootIds: readonly string[]): string[] {
  const start = typeof element.props.startBlockId === "string"
    ? rootIds.indexOf(element.props.startBlockId)
    : -1;
  const end = typeof element.props.endBlockId === "string"
    ? rootIds.indexOf(element.props.endBlockId)
    : -1;
  return start >= 0 && end >= 0
    ? rootIds.slice(Math.min(start, end), Math.max(start, end) + 1)
    : [];
}

/**
 * Copies a block subtree while clearing recursive Review payloads.
 *
 * @param block - Complete live subtree to detach.
 * @returns Detached subtree safe to embed in another Review snapshot.
 */
function copyBlockForReport(
  block: EditorBlock,
  excludedBlockId?: string,
): EditorBlock | null {
  if (block.id === excludedBlockId) return null;
  const copy = structuredClone(block);
  copy.children = copy.children.flatMap((child) => {
    const childCopy = copyBlockForReport(child, excludedBlockId);
    return childCopy ? [childCopy] : [];
  });
  if (copy.type === REVIEW_REPORT_TYPE) {
    copy.props = { ...copy.props, snapshot: null, savedAt: null };
  }
  return copy;
}

/**
 * Copies an element while clearing recursive Review payloads.
 *
 * @param element - Live element record to detach.
 * @returns Detached element safe to embed in a Review snapshot.
 */
function copyElementForReport(element: EditorElement): EditorElement {
  const copy = structuredClone(element);
  if (copy.type === REVIEW_REPORT_TYPE) {
    copy.props = { ...copy.props, snapshot: null, savedAt: null };
  }
  return copy;
}

/**
 * Captures the root-block window and source placement around a Review block.
 *
 * @param editor - Live editor whose managers supply current state.
 * @param reviewId - Review block acting as the capture anchor.
 * @param blocksAbove - Maximum preceding root count.
 * @param blocksBelow - Maximum following root count.
 * @param includeReportBlock - Whether the copied forest retains the source Review block.
 * @returns Detached snapshot plus report placement from the same live read.
 */
export function captureBlockReview(
  editor: RivtoEditorApi,
  reviewId: string,
  blocksAbove: number,
  blocksBelow: number,
  includeReportBlock = false,
): { snapshot: EditorSnapshot } & ReviewBlockPlacement {
  if (!editor.blocks.hasBlock(reviewId)) {
    throw new Error(`Review block ${reviewId} is not in the document`);
  }
  const parentReportId = editor.blocks.getParentId(reviewId) ?? null;
  let anchorRootId = reviewId;
  let parentId = parentReportId;
  while (parentId) {
    anchorRootId = parentId;
    parentId = editor.blocks.getParentId(anchorRootId) ?? null;
  }
  const rootIds = editor.blocks.getRootIds();
  const siblingIds = parentReportId === null
    ? rootIds
    : editor.blocks.getChildIds(parentReportId);
  const siblingIndex = siblingIds.indexOf(reviewId);
  const anchorIndex = rootIds.indexOf(anchorRootId);
  if (anchorIndex < 0) throw new Error(`Review block ${reviewId} is not in the document`);
  const selectedIds = rootIds.slice(
    Math.max(0, anchorIndex - blocksAbove),
    Math.min(rootIds.length, anchorIndex + 1 + blocksBelow),
  );
  const selected = new Set(selectedIds.filter((id) => includeReportBlock || id !== reviewId));
  const blocks = selectedIds.flatMap((id): EditorBlock[] => {
    const block = editor.blocks.getBlock(id);
    if (!block) throw new Error(`Captured root block ${id} is missing`);
    const copy = copyBlockForReport(block, includeReportBlock ? undefined : reviewId);
    return copy ? [copy] : [];
  });
  const elements = editor.elements.getElements().flatMap((element): EditorElement[] => {
    if (element.type !== "block") return [];
    const overlap = blockCardRootIds(element, rootIds).filter((id) => selected.has(id));
    if (!overlap.length) return [];
    const copy = copyElementForReport(element);
    copy.props = {
      ...copy.props,
      startBlockId: overlap[0]!,
      endBlockId: overlap.at(-1)!,
    };
    return [copy];
  });
  return {
    snapshot: { version: 6, blocks, elements, pluginData: {} },
    previousReportSiblingId: siblingIndex > 0 ? siblingIds[siblingIndex - 1]! : null,
    nextReportSiblingId: siblingIndex >= 0 && siblingIndex + 1 < siblingIds.length
      ? siblingIds[siblingIndex + 1]!
      : null,
    parentReportId,
  };
}

/**
 * Captures the deterministic canvas window around a Review element.
 *
 * Included groups recursively pull existing children. Connector attachments to
 * excluded elements are detached but retain their absolute fallback positions.
 * Block cards pull their complete referenced root forest.
 *
 * @param editor - Live editor whose managers supply current state.
 * @param reviewId - Review element acting as the capture anchor.
 * @param elementsAbove - Maximum preceding element count.
 * @param elementsBelow - Maximum following element count.
 * @returns Detached loadable schema-v6 snapshot.
 */
export function captureElementReviewSnapshot(
  editor: RivtoEditorApi,
  reviewId: string,
  elementsAbove: number,
  elementsBelow: number,
): EditorSnapshot {
  const ordered = [...editor.elements.getElements()].sort(
    (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id),
  );
  const anchorIndex = ordered.findIndex(({ id }) => id === reviewId);
  if (anchorIndex < 0) throw new Error(`Review element ${reviewId} is not in the document`);
  const included = new Set(ordered.slice(
    Math.max(0, anchorIndex - elementsAbove),
    Math.min(ordered.length, anchorIndex + 1 + elementsBelow),
  ).map(({ id }) => id));
  const byId = new Map(ordered.map((element) => [element.id, element]));

  /** Adds existing group descendants until the included set is closed. */
  const includeChildren = (id: string): void => {
    const element = byId.get(id);
    if (element?.type !== "group" || !Array.isArray(element.props.children)) return;
    element.props.children.forEach((child) => {
      if (typeof child !== "string" || !byId.has(child) || included.has(child)) return;
      included.add(child);
      includeChildren(child);
    });
  };
  [...included].forEach(includeChildren);

  const elements = ordered.filter(({ id }) => included.has(id)).map((element) => {
    const copy = copyElementForReport(element);
    if (copy.type === "group" && Array.isArray(copy.props.children)) {
      copy.props.children = copy.props.children.filter(
        (child): child is string => typeof child === "string" && included.has(child),
      );
    }
    if (copy.type === "connector") {
      for (const key of ["source", "target"] as const) {
        const endpoint = copy.props[key];
        if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) continue;
        const detached = { ...endpoint } as Record<string, unknown>;
        if (typeof detached.elementId === "string" && !included.has(detached.elementId)) {
          delete detached.elementId;
        }
        copy.props[key] = detached;
      }
    }
    return copy;
  });
  const rootIds = editor.blocks.getRootIds();
  const capturedRoots = new Set(elements.flatMap((element) => (
    element.type === "block" ? blockCardRootIds(element, rootIds) : []
  )));
  const blocks = rootIds.filter((id) => capturedRoots.has(id)).map((id) => {
    const block = editor.blocks.getBlock(id);
    if (!block) throw new Error(`Captured root block ${id} is missing`);
    const copy = copyBlockForReport(block);
    if (!copy) throw new Error(`Captured root block ${id} is missing`);
    return copy;
  });
  return { version: 6, blocks, elements, pluginData: {} };
}

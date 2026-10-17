import { z } from "zod";
import type { DocumentModel } from "@chulane/document-model";
import type { Selection } from "@chulane/rivto";

/** Host-provided display identity; it does not authenticate the connection. */
export interface CollaborationUser {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

const id = z.string().min(1).max(512);
const position = z.string().max(2048);
const rangeSchema = z.union([
  z.object({ id, whole: z.literal(true) }),
  z.object({ id, start: position, end: position }),
]);
const selectionSchema = z.object({
  blocks: z.array(rangeSchema).max(10000),
  elements: z.array(id).max(10000),
  anchorBlockId: id.optional(),
  focusBlockId: id.optional(),
  reversed: z.boolean().optional(),
});
const point = { x: z.number().finite(), y: z.number().finite() };
/** Validates peer-controlled display data before it reaches DOM or text resolution. */
export const presenceSchema = z.object({
  user: z.object({
    id,
    name: z.string().min(1).max(128),
    color: z.string().regex(/^#[\da-f]{6}$/i),
  }),
  mode: z.enum(["block", "edgeless"]),
  pointer: z
    .union([
      z.object({ type: z.literal("canvas"), ...point }),
      z.object({ type: z.literal("panel"), ...point }),
      z.object({ type: z.literal("block"), blockId: id, ...point }),
    ])
    .nullable(),
  selection: selectionSchema.nullable(),
});
export type Presence = z.infer<typeof presenceSchema>;
export type PresenceSelection = z.infer<typeof selectionSchema>;

/**
 * Encodes selected text boundaries without including plugin data or stale offsets.
 *
 * @param document - Owner of the shared text and stable entity IDs.
 * @param selection - Current local selection; absent values clear remote coverage.
 * @returns Serializable relative ranges, or null when no selection exists.
 */
export function encodeSelection(
  document: DocumentModel,
  selection?: Selection,
): PresenceSelection | null {
  if (!selection) {
    return null;
  }
  return {
    blocks: selection.blocks.flatMap((range): PresenceSelection["blocks"] => {
      const block = document.blocks.getBlockNode(range.id);
      if (!block) {
        return [];
      }
      if (range.start === 0 && range.end === -1) {
        return [{ id: range.id, whole: true }];
      }
      const start = Math.min(range.start, block.content.length);
      const end =
        range.end === -1 ? block.content.length : Math.min(range.end, block.content.length);
      return [
        {
          id: range.id,
          start: document.blocks.createTextPosition(range.id, start),
          end: document.blocks.createTextPosition(range.id, end, start === end ? 0 : -1),
        },
      ];
    }),
    elements: selection.elements ?? [],
    anchorBlockId: selection.anchorBlockId,
    focusBlockId: selection.focusBlockId,
    reversed: selection.reversed,
  };
}

/**
 * Resolves remote ranges against current text, omitting unavailable entities.
 *
 * @param document - Current document receiving the presence.
 * @param selection - Relative text ranges and structural entity IDs.
 * @returns A detached selection for geometry; never installs it as local selection.
 */
export function decodeSelection(document: DocumentModel, selection: PresenceSelection): Selection {
  return {
    type: "selection",
    ...selection,
    blocks: selection.blocks.flatMap((range) => {
      if (!document.blocks.getBlockNode(range.id)) {
        return [];
      }
      if ("whole" in range) {
        return [{ id: range.id, start: 0, end: -1 }];
      }
      const start = document.blocks.resolveTextPosition(range.id, range.start);
      const end = document.blocks.resolveTextPosition(range.id, range.end);
      return start === undefined || end === undefined
        ? []
        : [{ id: range.id, start, end: Math.max(start, end) }];
    }),
    elements: selection.elements.filter((id) => document.elements.getElementNode(id)),
  };
}

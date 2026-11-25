/**
 * Host side of the opt-in editor access granted to an Unsafe HTML block.
 *
 * The widget never receives live objects. It sends `unsafe-request` messages that
 * name one of a fixed set of block operations; the host validates the request,
 * rechecks the grant, runs the operation and posts a detached result back.
 *
 * @module
 */
import type { PanelAPI } from "@chulane/rivto";

/** Block operations borrowed from either a panel or the shared editor. */
export type UnsafeHtmlBlocks = Pick<
  PanelAPI["blocks"],
  "getParentId" | "getRootIds" | "getChildIds" | "getBlockNode" | "updateBlock"
>;

/** Operation names the widget-side proxy exposes; anything else is rejected. */
export const UNSAFE_HTML_METHODS = [
  "getRootIds",
  "getParentId",
  "getChildIds",
  "getBlockNode",
  "setContent",
] as const;

/** A request whose envelope has been validated; its arguments are still untrusted. */
export interface UnsafeHtmlRequest {
  /** Request identity echoed in the reply. */
  readonly id: number;
  /** The panel boundary or the shared editor document. */
  readonly target: "panel" | "reactEditor";
  /** Requested operation name; unsupported names produce a null result. */
  readonly method: string;
  /** Untrusted operation arguments, validated per method. */
  readonly args: unknown[];
}

/** Host-controlled capabilities for one mounted Unsafe HTML occurrence. */
export interface UnsafeHtmlFrameAccess {
  /** Whether the current source has been approved; baked into the widget's `rivto.panel` getter. */
  readonly enabled: boolean;
  /** Panel-bounded block operations, used for `rivto.panel`. */
  readonly panelBlocks: UnsafeHtmlBlocks;
  /** Shared document block operations, used for `rivto.reactEditor`. */
  readonly editorBlocks: UnsafeHtmlBlocks;
  /**
   * Rechecks the grant against the live document at request time.
   *
   * @returns True only while the approved source is still the block's content.
   */
  readonly isAuthorized: () => boolean;
  /**
   * Records that the widget tried to use access it does not have.
   *
   * @returns The occurrence shows its access warning.
   */
  readonly onDenied: () => void;
}

/** Reply delivered to the widget's pending promise. */
export interface UnsafeHtmlResult {
  readonly id: number;
  readonly value: unknown;
  readonly error?: string;
}

/**
 * Validates the envelope of an untrusted bridge request.
 *
 * @param value - Message received on the authenticated port.
 * @returns A request with well-typed fields, or undefined for malformed input.
 */
export function parseUnsafeHtmlRequest(value: unknown): UnsafeHtmlRequest | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { id, target, method, args } = value as Record<string, unknown>;
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    (target !== "panel" && target !== "reactEditor") ||
    typeof method !== "string" ||
    !Array.isArray(args)
  ) {
    return undefined;
  }
  return { id, target, method, args };
}

/**
 * Applies one supported block operation to the given manager.
 *
 * @param blocks - Panel-bounded or shared-document operations.
 * @param request - Request with an unsupported method or wrong arity yielding null.
 * @returns A detached result, or null when the request is invalid or its target is missing.
 * @throws If the manager rejects the operation.
 */
export function executeUnsafeHtmlRequest(
  blocks: UnsafeHtmlBlocks,
  request: UnsafeHtmlRequest,
): unknown {
  const { method, args } = request;
  if (method === "getRootIds" && args.length === 0) {
    return blocks.getRootIds();
  }
  const [id, value] = args;
  if (typeof id !== "string") {
    return null;
  }
  if (args.length === 1) {
    switch (method) {
      case "getParentId":
        return blocks.getParentId(id) ?? null;
      case "getChildIds":
        return blocks.getChildIds(id);
      case "getBlockNode":
        return blocks.getBlockNode(id) ?? null;
    }
  }
  if (method === "setContent" && args.length === 2 && typeof value === "string") {
    if (!blocks.getBlockNode(id)) {
      return null;
    }
    blocks.updateBlock(id, { content: value });
    return true;
  }
  return null;
}

/**
 * Authorizes and runs a request, converting failures into a reply for the widget.
 *
 * Permission is rechecked here, not when the request was queued, so a source
 * edit or a switch to a noninteractive occurrence revokes pending requests.
 *
 * @param access - Current grant and borrowed managers.
 * @param interactive - Whether this occurrence accepts writes at all.
 * @param request - Parsed request with untrusted arguments.
 * @returns The reply to post; calls `access.onDenied` when access is refused.
 */
export function answerUnsafeHtmlRequest(
  access: UnsafeHtmlFrameAccess,
  interactive: boolean,
  request: UnsafeHtmlRequest,
): UnsafeHtmlResult {
  if (!interactive || !access.enabled || !access.isAuthorized()) {
    access.onDenied();
    return { id: request.id, value: null, error: "Editor access is disabled" };
  }
  const blocks = request.target === "panel" ? access.panelBlocks : access.editorBlocks;
  try {
    return { id: request.id, value: executeUnsafeHtmlRequest(blocks, request) };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "Editor operation failed";
    return { id: request.id, value: null, error };
  }
}

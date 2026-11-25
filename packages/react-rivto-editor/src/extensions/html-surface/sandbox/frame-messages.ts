/**
 * The message protocol between a widget document and its host, in both directions.
 *
 * Every message carries `{channel: HTML_CHANNEL, token}`. Incoming messages
 * are untrusted and validated here before anything acts on them; outgoing
 * messages are built here so their shape is defined in one place.
 *
 * @module
 */
import { HTML_CHANNEL, MAX_DRAG_REGIONS } from "../constants";
import { isJsonRecord, isJsonValue, isWritableKey } from "../model/json-value";
import type {
  HtmlDragHandleRegion,
  HtmlNodeView,
  HtmlWidgetCommand,
  HtmlWidgetContext,
} from "../types";
import {
  parseUnsafeHtmlRequest,
  type UnsafeHtmlRequest,
  type UnsafeHtmlResult,
} from "../unsafe/unsafe-requests";

/** Every validated message a widget document may send to its host. */
export type HtmlFrameMessage =
  | HtmlWidgetCommand
  | { readonly kind: "ready" }
  | { readonly kind: "resize"; readonly height: number }
  | { readonly kind: "drag-handles"; readonly handles: readonly HtmlDragHandleRegion[] }
  | { readonly kind: "unsafe-request"; readonly request: UnsafeHtmlRequest }
  | { readonly kind: "unsafe-denied" };

/** Every message the host sends to a widget document. */
export type HtmlHostMessage =
  | { readonly kind: "node"; readonly node: HtmlNodeView }
  | { readonly kind: "context"; readonly context: HtmlWidgetContext }
  | { readonly kind: "clear-text-selection" }
  | ({ readonly kind: "unsafe-result" } & UnsafeHtmlResult);

/**
 * Posts a host message to a widget document's port, adding the envelope.
 *
 * @param port - The document's connected endpoint.
 * @param token - The document's secret.
 * @param message - Message body.
 * @returns The message has been queued on the port.
 */
export function postHostMessage(port: MessagePort, token: string, message: HtmlHostMessage): void {
  port.postMessage({ channel: HTML_CHANNEL, token, ...message });
}

/**
 * Parses one untrusted message when it belongs to the given document.
 *
 * Messages for another channel or token, unknown kinds, and malformed payloads
 * (including non-JSON values and prototype keys in writes) yield `undefined`.
 *
 * @param data - Handshake from the iframe window or payload from its port.
 * @param token - Secret of the document allowed to send.
 * @returns The validated message, or undefined.
 */
export function parseFrameMessage(data: unknown, token: string): HtmlFrameMessage | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const message = data as Record<string, unknown>;
  if (message.channel !== HTML_CHANNEL || message.token !== token) {
    return undefined;
  }
  switch (message.kind) {
    case "ready":
    case "unsafe-denied":
      return { kind: message.kind };
    case "resize":
      return typeof message.height === "number" && Number.isFinite(message.height)
        ? { kind: "resize", height: message.height }
        : undefined;
    case "drag-handles":
      return parseDragRegions(message.handles);
    case "unsafe-request": {
      const request = parseUnsafeHtmlRequest(message);
      return request && { kind: "unsafe-request", request };
    }
    default:
      return parseWidgetCommand(message);
  }
}

/**
 * Parses the pointer notification and document writes a widget can send.
 *
 * @param message - Message that already matched this document's envelope.
 * @returns The command, or undefined for an unknown kind or invalid payload.
 */
function parseWidgetCommand(message: Record<string, unknown>): HtmlWidgetCommand | undefined {
  switch (message.kind) {
    case "pointerdown":
      return typeof message.primary === "boolean"
        ? { kind: "pointerdown", primary: message.primary }
        : undefined;
    case "set-prop":
      return typeof message.key === "string" &&
        isWritableKey(message.key) &&
        isJsonValue(message.value)
        ? { kind: "set-prop", key: message.key, value: message.value }
        : undefined;
    case "set-props":
      return isJsonRecord(message.props) ? { kind: "set-props", props: message.props } : undefined;
    case "set-list-props":
      return isJsonRecord(message.listProps)
        ? { kind: "set-list-props", listProps: message.listProps }
        : undefined;
    case "set-content":
      return typeof message.content === "string"
        ? { kind: "set-content", content: message.content }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Validates drag regions and clips them to the unit viewport.
 *
 * @param value - Untrusted region list.
 * @returns The clipped regions (empty ones dropped), or undefined if any entry is malformed.
 */
function parseDragRegions(value: unknown): HtmlFrameMessage | undefined {
  if (!Array.isArray(value) || value.length > MAX_DRAG_REGIONS) {
    return undefined;
  }
  const handles: HtmlDragHandleRegion[] = [];
  for (const item of value) {
    const region = parseRegion(item);
    if (region === undefined) {
      return undefined;
    }
    if (region) {
      handles.push(region);
    }
  }
  return { kind: "drag-handles", handles };
}

/**
 * Clips one untrusted rectangle to `[0, 1]` on both axes.
 *
 * @param item - Candidate `{x, y, width, height}` record.
 * @returns The clipped region, null when it is empty after clipping, or undefined when malformed.
 */
function parseRegion(item: unknown): HtmlDragHandleRegion | null | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const { x, y, width, height } = item as Record<string, unknown>;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    ![x, y, width, height].every(Number.isFinite)
  ) {
    return undefined;
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const left = clamp(x);
  const top = clamp(y);
  const right = clamp(x + width);
  const bottom = clamp(y + height);
  if (right <= left || bottom <= top) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

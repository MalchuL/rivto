/** Validated operations made available to an opted-in HTML widget. */
import type { PanelAPI } from "@chulane/rivto";
import { HTML_CHANNEL } from "./protocol/protocol";

/** Block operations borrowed from either a panel or the shared editor. */
export type UnsafeHtmlBlocks = Pick<
  PanelAPI["blocks"],
  "getParentId" | "getRootIds" | "getChildIds" | "getBlockNode" | "updateBlock"
>;

/** A validated request from the sandbox. */
export interface UnsafeHtmlRequest {
  /** Request identity echoed in the reply. */
  readonly id: number;
  /** The panel boundary or the shared editor document. */
  readonly target: "panel" | "reactEditor";
  /** Name of a supported block operation. */
  readonly method: string;
  /** Untrusted operation arguments, validated by the dispatcher. */
  readonly args: unknown[];
}

/**
 * Validates the shape of an untrusted bridge request.
 *
 * @param value - Message received from the widget.
 * @returns A request with supported fields, or undefined for malformed input.
 */
export function parseUnsafeHtmlRequest(value: unknown): UnsafeHtmlRequest | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const request = value as Record<string, unknown>;
  if (
    typeof request.id !== "number" ||
    !Number.isSafeInteger(request.id) ||
    (request.target !== "panel" && request.target !== "reactEditor") ||
    typeof request.method !== "string" ||
    !Array.isArray(request.args)
  ) {
    return;
  }
  return {
    id: request.id,
    target: request.target,
    method: request.method,
    args: request.args,
  };
}

/**
 * Applies one supported block operation to the selected manager.
 *
 * @param blocks - Panel-bounded or shared-document operations.
 * @param request - Validated sandbox request; arguments remain untrusted.
 * @returns A detached result, or null when the request is invalid or missing.
 * @throws If the selected manager rejects an operation.
 */
export function executeUnsafeHtmlRequest(
  blocks: UnsafeHtmlBlocks,
  request: UnsafeHtmlRequest,
): unknown {
  const [id, value] = request.args;
  if (request.method === "getRootIds" && request.args.length === 0) {
    return blocks.getRootIds();
  }
  if (typeof id !== "string") {
    return null;
  }
  if (request.method === "getParentId" && request.args.length === 1) {
    return blocks.getParentId(id) ?? null;
  }
  if (request.method === "getChildIds" && request.args.length === 1) {
    return blocks.getChildIds(id);
  }
  if (request.method === "getBlockNode" && request.args.length === 1) {
    return blocks.getBlockNode(id) ?? null;
  }
  if (request.method === "setContent" && request.args.length === 2 && typeof value === "string") {
    if (!blocks.getBlockNode(id)) {
      return null;
    }
    blocks.updateBlock(id, { content: value });
    return true;
  }
  return null;
}

/**
 * Builds the iframe-side asynchronous proxies without exposing host objects.
 *
 * Messages wait for the host listener so requests made during initial script
 * execution are delivered after the iframe and its parent are ready.
 *
 * @param token - Channel token for this frame.
 * @param enabled - Whether the host currently grants access.
 * @returns JavaScript injected after the ordinary widget bridge.
 */
export function unsafeHtmlRuntime(token: string, enabled: boolean): string {
  return `(function () {
  var token = ${JSON.stringify(token)};
  var enabled = ${JSON.stringify(enabled)};
  var nextId = 0;
  var pending = new Map();
  var hostReady = false;
  var queued = [];
  function post(message) { parent.postMessage(Object.assign({channel: ${JSON.stringify(HTML_CHANNEL)}, token: token}, message), '*'); }
  function send(message) { if (hostReady) post(message); else queued.push(message); }
  function request(target, method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++nextId;
      pending.set(id, {resolve: resolve, reject: reject});
      send({kind: 'unsafe-request', id: id, target: target, method: method, args: args});
    });
  }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== parent || !data || data.channel !== ${JSON.stringify(HTML_CHANNEL)} || data.token !== token) return;
    if (data.kind === 'unsafe-host-ready') {
      hostReady = true;
      queued.splice(0).forEach(post);
      return;
    }
    if (data.kind !== 'unsafe-result') return;
    var entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.value);
  });
  function proxy(target) {
    var blocks = {};
    ['getRootIds', 'getParentId', 'getChildIds', 'getBlockNode', 'setContent'].forEach(function (method) {
      blocks[method] = function () { return request(target, method, Array.from(arguments)); };
    });
    return Object.freeze({blocks: Object.freeze(blocks)});
  }
  post({kind: 'unsafe-ready'});
  var panel = proxy('panel'); var editor = proxy('reactEditor');
  ['panel', 'reactEditor'].forEach(function (name) {
    Object.defineProperty(window.rivto, name, {get: function () {
      if (!enabled) { send({kind: 'unsafe-denied'}); return null; }
      return name === 'panel' ? panel : editor;
    }});
  });
})();`;
}

/**
 * Sandboxed HTML documents and the message bridge between a widget and its node.
 *
 * The frame follows AFFiNE's embed HTML block: the authored markup is the document
 * body (or a full document), painted in an iframe with scripts allowed and the
 * parent origin withheld. Rivto adds a `window.rivto` bridge so that script can
 * read the whole block or element node and write props, list props, or content.
 *
 * @module
 */

/** Persisted block type for pasted HTML, CSS, and JavaScript. */
export const HTML_BLOCK_TYPE = "html";

/** Persisted canvas element type for pasted HTML, CSS, and JavaScript. */
export const HTML_ELEMENT_TYPE = "html";

/** postMessage channel shared by the host frame and the sandboxed document. */
export const HTML_CHANNEL = "rivto-html";

/** How the sandboxed document should size itself against the host. */
export type HtmlFrameFit = "auto" | "fill";

/** Block fields a widget can read. `content` is the authored HTML. */
export interface HtmlBlockView {
  readonly kind: "block";
  readonly id: string;
  readonly type: string;
  readonly content: string;
  readonly props: Record<string, unknown>;
  readonly listProps: Record<string, unknown>;
  readonly pluginData: Record<string, unknown>;
  readonly childIds: readonly string[];
}

/** Element fields a widget can read. `props.html` is the authored HTML. */
export interface HtmlElementView {
  readonly kind: "element";
  readonly id: string;
  readonly type: string;
  readonly frame: { x: number; y: number; width: number; height: number };
  readonly zIndex: number;
  readonly props: Record<string, unknown>;
  readonly childIds: readonly string[];
}

/** Snapshot posted into the sandbox. Scripts see this object as `rivto.node`. */
export type HtmlNodeView = HtmlBlockView | HtmlElementView;

/** Command the sandbox may send after the host has checked its token. */
export type HtmlFrameCommand =
  | { readonly kind: "ready" }
  | { readonly kind: "resize"; readonly height: number }
  | { readonly kind: "set-prop"; readonly key: string; readonly value: unknown }
  | { readonly kind: "set-props"; readonly props: Record<string, unknown> }
  | { readonly kind: "set-list-props"; readonly listProps: Record<string, unknown> }
  | { readonly kind: "set-content"; readonly content: string };

/** Saved source and widget props from the edit form. */
export interface HtmlDraft {
  readonly source: string;
  readonly props: Record<string, unknown>;
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const BRIDGE_RUNTIME = `
(function () {
  var token = __TOKEN__;
  var channel = ${JSON.stringify(HTML_CHANNEL)};
  var current = null;
  var waiters = [];
  var listeners = [];
  function send(message) {
    parent.postMessage(Object.assign({ channel: channel, token: token }, message), "*");
  }
  function publish(next) {
    current = next;
    waiters.splice(0).forEach(function (resolve) { resolve(next); });
    listeners.slice().forEach(function (listener) { listener(next); });
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.channel !== channel || data.token !== token || data.kind !== "node") {
      return;
    }
    publish(data.node);
  });
  window.rivto = {
    get node() { return current; },
    ready: function () {
      if (current) {
        return Promise.resolve(current);
      }
      return new Promise(function (resolve) { waiters.push(resolve); });
    },
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    setProp: function (key, value) { send({ kind: "set-prop", key: key, value: value }); },
    setProps: function (props) { send({ kind: "set-props", props: props }); },
    setListProps: function (listProps) { send({ kind: "set-list-props", listProps: listProps }); },
    setContent: function (content) { send({ kind: "set-content", content: content }); }
  };
  send({ kind: "ready" });
  var report = function () {
    send({ kind: "resize", height: Math.ceil(document.documentElement.scrollHeight) });
  };
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(report).observe(document.documentElement);
  }
  window.addEventListener("load", report);
})();`;

/**
 * Reports whether a property name would pollute a plain object.
 *
 * @param key - Own property name from a widget message or edited JSON object.
 * @returns True for `__proto__`, `constructor`, and `prototype`.
 */
function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

/**
 * Reports whether a widget value can be stored as JSON-compatible document data.
 *
 * Finite numbers, strings, booleans, null, arrays, and plain objects are accepted.
 * Cycles, functions, and non-finite numbers are rejected.
 *
 * @param value - Candidate property value from a message or the edit form.
 * @returns True when every nested value is portable JSON data.
 */
export function isJsonValue(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
      return true;
    }
    if (typeof candidate === "number") {
      return Number.isFinite(candidate);
    }
    if (!candidate || typeof candidate !== "object") {
      return false;
    }
    if (!Array.isArray(candidate)) {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        return false;
      }
    }
    if (seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    const nested = Array.isArray(candidate)
      ? candidate.every(visit)
      : Object.entries(candidate).every(([key, item]) => !isDangerousKey(key) && visit(item));
    seen.delete(candidate);
    return nested;
  };
  return visit(value);
}

/**
 * Narrows a value to a JSON object the widget may write onto a node.
 *
 * @param value - Candidate record from a sandbox message or the props editor.
 * @returns True when the value is a non-array object of JSON data.
 */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && isJsonValue(value);
}

/**
 * Builds the iframe document, injecting the node bridge without changing the markup.
 *
 * A full HTML document keeps its own structure and receives the bridge in `head`.
 * A fragment becomes the body of a small document, which is the AFFiNE embed shape.
 * The sandbox token is bound into the bridge so another frame cannot answer for it.
 *
 * @param source - Authored HTML fragment or complete document.
 * @param token - Per-frame secret required on every message in either direction.
 * @param fit - `fill` locks the document to the host box; `auto` lets the body grow.
 * @param additionalScript - Optional host-provided bridge installed before authored scripts.
 * @returns A `srcdoc` string that installs `window.rivto` before the authored markup runs.
 */
export function composeSrcDoc(
  source: string,
  token: string,
  fit: HtmlFrameFit,
  additionalScript = "",
): string {
  const sizing =
    fit === "fill"
      ? "html,body{margin:0;height:100%;background:transparent}body{overflow:hidden}"
      : "html,body{margin:0;background:transparent}";
  const head = `<meta charset="utf-8"><style>${sizing}</style><script>${BRIDGE_RUNTIME.replace("__TOKEN__", JSON.stringify(token))}${additionalScript}</scr${"ipt>"}`;
  const headOpen = /<head[^>]*>/i.exec(source);
  if (headOpen && /<html[\s>]/i.test(source)) {
    const index = headOpen.index + headOpen[0].length;
    return `${source.slice(0, index)}${head}${source.slice(index)}`;
  }
  return `<!DOCTYPE html><html><head>${head}</head><body>${source}</body></html>`;
}

/**
 * Parses one sandbox message when it belongs to this frame and carries JSON data.
 *
 * Messages for another token are ignored. Property writes that are not JSON, or
 * that use a prototype key, are ignored rather than applied.
 *
 * @param data - `MessageEvent.data` from the host window.
 * @param token - Token of the iframe that is allowed to issue commands.
 * @returns The command, or undefined when the message is not for this frame.
 */
export function parseFrameMessage(data: unknown, token: string): HtmlFrameCommand | undefined {
  if (!data || typeof data !== "object") {
    return;
  }
  const message = data as Record<string, unknown>;
  if (message.channel !== HTML_CHANNEL || message.token !== token) {
    return;
  }
  return commandFromMessage(message);
}

/**
 * Accepts an element property bag that includes an HTML string and JSON widget data.
 *
 * `undefined` values are kept so a patch can remove a key. The returned object is
 * the same record the registry merged with the type defaults.
 *
 * @param props - Merged element properties, including `html`.
 * @returns The same property record when it is valid.
 * @throws If `html` is missing or a property is not JSON data.
 */
export function validateHtmlElementProps(props: Record<string, unknown>): Record<string, unknown> {
  if (typeof props.html !== "string") {
    throw new Error("HTML element requires an html string");
  }
  for (const [key, value] of Object.entries(props)) {
    if (isDangerousKey(key) || (value !== undefined && !isJsonValue(value))) {
      throw new Error(`Invalid HTML element property ${key}`);
    }
  }
  return props;
}

/**
 * Limits an automatic iframe height to a range that cannot grow without bound.
 *
 * @param height - Document scroll height reported by the sandbox, in CSS pixels.
 * @returns A height from 140 through 720 CSS pixels.
 */
export function clampFrameHeight(height: number): number {
  return Math.min(720, Math.max(140, Math.round(height)));
}

/**
 * Formats widget props for the editor, leaving host-owned keys out of the text.
 *
 * @param props - Current persisted properties.
 * @param omit - Keys edited elsewhere, such as `html` or canvas `rotation`.
 * @returns Pretty JSON for the remaining keys. Empty props become `{}`.
 */
export function formatWidgetProps(props: Record<string, unknown>, omit: readonly string[]): string {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!omit.includes(key)) {
      data[key] = value;
    }
  }
  return JSON.stringify(data, null, 2);
}

/**
 * Parses the props editor into a JSON object.
 *
 * @param text - Text from the props field. Blank text means an empty object.
 * @returns The parsed object.
 * @throws If the text is not a JSON object of portable values.
 */
export function parseWidgetProps(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text.trim() ? text : "{}") as unknown;
  if (!isJsonRecord(parsed)) {
    throw new Error("Props must be a JSON object");
  }
  return parsed;
}

/**
 * Builds a property patch that replaces widget data and preserves named host keys.
 *
 * Keys present on the current record but absent from the next object are set to
 * `undefined`, which removes them. Preserved keys stay when the editor omitted them.
 *
 * @param current - Properties currently stored on the node.
 * @param next - Complete widget properties that should remain, plus any source key.
 * @param preserved - Host keys that stay when `next` does not mention them.
 * @returns A shallow patch for `updateBlock` or `updateElement`.
 */
export function replacedPropPatch(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  preserved: readonly string[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...next };
  for (const key of preserved) {
    if (Object.hasOwn(current, key) && !Object.hasOwn(patch, key)) {
      patch[key] = current[key];
    }
  }
  for (const key of Object.keys(current)) {
    if (!Object.hasOwn(patch, key)) {
      patch[key] = undefined;
    }
  }
  return patch;
}

/**
 * Reads the visible name stored on a widget, falling back when it is blank.
 *
 * @param props - Persisted properties that may include `label`.
 * @param fallback - Name used when `label` is missing or empty.
 * @returns The trimmed label, or the fallback.
 */
export function readLabel(props: Record<string, unknown>, fallback: string): string {
  const label = props.label;
  if (typeof label === "string" && label.trim()) {
    return label.trim();
  }
  return fallback;
}

/**
 * Maps a validated channel message onto a command.
 *
 * @param message - Object that already matched this frame's channel and token.
 * @returns The command, or undefined when the payload is the wrong shape.
 */
function commandFromMessage(message: Record<string, unknown>): HtmlFrameCommand | undefined {
  if (message.kind === "ready") {
    return { kind: "ready" };
  }
  if (
    message.kind === "resize" &&
    typeof message.height === "number" &&
    Number.isFinite(message.height)
  ) {
    return { kind: "resize", height: message.height };
  }
  if (message.kind === "set-prop" && typeof message.key === "string" && isHtmlKey(message.key)) {
    if (isJsonValue(message.value)) {
      return { kind: "set-prop", key: message.key, value: message.value };
    }
    return;
  }
  if (message.kind === "set-props" && isJsonRecord(message.props)) {
    return { kind: "set-props", props: message.props };
  }
  if (message.kind === "set-list-props" && isJsonRecord(message.listProps)) {
    return { kind: "set-list-props", listProps: message.listProps };
  }
  if (message.kind === "set-content" && typeof message.content === "string") {
    return { kind: "set-content", content: message.content };
  }
  return;
}

/**
 * Reports whether a widget may write this property name.
 *
 * @param key - Candidate property name.
 * @returns True for a nonempty name that is not a prototype key.
 */
function isHtmlKey(key: string): boolean {
  return key.length > 0 && !isDangerousKey(key);
}

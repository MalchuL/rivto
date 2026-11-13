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
import type {
  EmbeddedContentContext,
  EmbeddedDragHandleRegion,
} from "../../../components/embedded-content-context";

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
  /** Presentation of this mounted block occurrence. */
  readonly context: EmbeddedContentContext;
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
  /** Presentation of this mounted element occurrence. */
  readonly context: EmbeddedContentContext;
}

/** Snapshot posted into the sandbox. Scripts see this object as `rivto.node`. */
export type HtmlNodeView = HtmlBlockView | HtmlElementView;

/** Detached document data; the frame adds the live presentation context. */
export type HtmlNodeData = Omit<HtmlBlockView, "context"> | Omit<HtmlElementView, "context">;

/** Command the sandbox may send after the host has checked its token. */
export type HtmlFrameCommand =
  | { readonly kind: "ready" }
  | { readonly kind: "resize"; readonly height: number }
  | { readonly kind: "pointerdown"; readonly primary: boolean }
  | { readonly kind: "drag-handles"; readonly handles: readonly EmbeddedDragHandleRegion[] }
  | { readonly kind: "set-prop"; readonly key: string; readonly value: unknown }
  | { readonly kind: "set-props"; readonly props: Record<string, unknown> }
  | { readonly kind: "set-list-props"; readonly listProps: Record<string, unknown> }
  | { readonly kind: "set-content"; readonly content: string };

/** Commands delivered to a widget owner after frame lifecycle messages are handled. */
export type HtmlWidgetCommand = Exclude<
  HtmlFrameCommand,
  { kind: "ready" | "resize" | "drag-handles" }
>;

/** Saved source and widget props from the edit form. */
export interface HtmlDraft {
  readonly source: string;
  readonly props: Record<string, unknown>;
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const BRIDGE_RUNTIME = `
(function () {
  var token = __TOKEN__;
  var autoHandles = true;
  var channel = ${JSON.stringify(HTML_CHANNEL)};
  var current = null;
  var waiters = [];
  var listeners = [];
  var contextListeners = [];
  function send(message) {
    parent.postMessage(Object.assign({ channel: channel, token: token }, message), "*");
  }
  /**
   * Publishes document data and any accompanying presentation change.
   *
   * @param next - Detached node snapshot and its current context.
   * @returns Pending readers and relevant subscribers have been notified.
   */
  function publish(next) {
    var previous = current && current.context;
    current = next;
    waiters.splice(0).forEach(function (resolve) { resolve(next); });
    listeners.slice().forEach(function (listener) { listener(next); });
    if (previous && !sameContext(previous, next.context)) {
      contextListeners.slice().forEach(function (listener) { listener(next.context); });
    }
  }
  /**
   * Compares the presentation fields delivered to this widget.
   *
   * @param a - Previous context.
   * @param b - New context.
   * @returns Whether the observable presentation fields are equal.
   */
  function sameContext(a, b) {
    return a.mode === b.mode && a.selected === b.selected && a.preview === b.preview;
  }
  /**
   * Updates presentation state without notifying document-data listeners.
   *
   * @param context - New surface, selection, and preview state.
   * @returns Context listeners have received a changed state when a node exists.
   */
  function publishContext(context) {
    if (!current || sameContext(current.context, context)) { return; }
    current = Object.assign({}, current, { context: context });
    contextListeners.slice().forEach(function (listener) { listener(context); });
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.channel !== channel || data.token !== token) {
      return;
    }
    if (data.kind === "node") {
      publish(data.node);
    } else if (data.kind === "context") {
      publishContext(data.context);
    } else if (data.kind === "host-ready") {
      lastHandles = "";
      scheduleHandles();
    }
  });
  window.rivto = {
    get node() { return current; },
    get props() { return current ? current.props : null; },
    get context() { return current ? current.context : null; },
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
    /**
     * Subscribes to later presentation changes without observing document writes.
     *
     * @param listener - Callback receiving each changed presentation context.
     * @returns A disposer that removes this callback.
     */
    subscribeContext: function (listener) {
      contextListeners.push(listener);
      return function () {
        var index = contextListeners.indexOf(listener);
        if (index >= 0) { contextListeners.splice(index, 1); }
      };
    },
    setProp: function (key, value) { send({ kind: "set-prop", key: key, value: value }); },
    setProps: function (props) { send({ kind: "set-props", props: props }); },
    setListProps: function (listProps) { send({ kind: "set-list-props", listProps: listProps }); },
    setContent: function (content) { send({ kind: "set-content", content: content }); }
  };
  send({ kind: "ready" });
  window.addEventListener("pointerdown", function (event) {
    if (event.isTrusted && event.button === 0) {
      send({ kind: "pointerdown", primary: event.ctrlKey || event.metaKey });
    }
  }, true);
  var handleObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleHandles) : null;
  var observedHandles = [];
  var observedNodes = [];
  var interactiveNodes = new Set();
  var interactiveReferences = new WeakMap();
  var lastHandles = "";
  var handleFrame = 0;
  /**
   * Schedules one measurement for changes collected during this frame.
   *
   * @returns A browser frame is scheduled unless one is already pending.
   */
  function scheduleHandles() {
    if (!handleFrame) { handleFrame = requestAnimationFrame(reportHandles); }
  }
  /**
   * Measures a marked region after applying rectangular ancestor clips.
   *
   * @param node - Authored drag region in the sandbox.
   * @param width - Sandbox viewport width in CSS pixels.
   * @param height - Sandbox viewport height in CSS pixels.
   * @returns The visible rectangle as fractions of the viewport.
   */
  function handleRectangle(node, width, height) {
    var style = getComputedStyle(node);
    if (style.visibility !== "visible" || style.pointerEvents === "none") {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    var bounds = node.getBoundingClientRect();
    var left = bounds.left, top = bounds.top, right = bounds.right, bottom = bounds.bottom;
    for (var parent = node.parentElement; parent; parent = parent.parentElement) {
      var clip = getComputedStyle(parent);
      var clipX = /^(auto|scroll|hidden|clip)$/.test(clip.overflowX);
      var clipY = /^(auto|scroll|hidden|clip)$/.test(clip.overflowY);
      if (clipX || clipY) {
        var box = parent.getBoundingClientRect();
        var scaleX = parent.offsetWidth ? box.width / parent.offsetWidth : 1;
        var scaleY = parent.offsetHeight ? box.height / parent.offsetHeight : 1;
        var x = box.left + parent.clientLeft * scaleX, y = box.top + parent.clientTop * scaleY;
        var clipWidth = parent.offsetWidth ? parent.clientWidth * scaleX : box.width;
        var clipHeight = parent.offsetHeight ? parent.clientHeight * scaleY : box.height;
        if (clipX) { left = Math.max(left, x); right = Math.min(right, x + clipWidth); }
        if (clipY) { top = Math.max(top, y); bottom = Math.min(bottom, y + clipHeight); }
      }
    }
    return { x: left / width, y: top / height, width: Math.max(0, right - left) / width, height: Math.max(0, bottom - top) / height };
  }
  /**
   * Removes a native interactive or text rectangle from host drag targets.
   *
   * @param regions - Remaining viewport-relative drag rectangles.
   * @param box - Viewport-relative area that must stay inside the sandbox.
   * @returns Rectangles surrounding the excluded area.
   */
  function excludeRectangle(regions, box) {
    var result = [];
    regions.forEach(function (r) {
      var l = Math.max(r.x, box.x), t = Math.max(r.y, box.y);
      var right = Math.min(r.x + r.width, box.x + box.width);
      var bottom = Math.min(r.y + r.height, box.y + box.height);
      if (right <= l || bottom <= t) { result.push(r); return; }
      if (t > r.y) { result.push({ x: r.x, y: r.y, width: r.width, height: t - r.y }); }
      if (bottom < r.y + r.height) { result.push({ x: r.x, y: bottom, width: r.width, height: r.y + r.height - bottom }); }
      if (l > r.x) { result.push({ x: r.x, y: t, width: l - r.x, height: bottom - t }); }
      if (right < r.x + r.width) { result.push({ x: right, y: t, width: r.x + r.width - right, height: bottom - t }); }
    });
    return result.slice(0, 64);
  }
  /**
   * Finds background drag targets while leaving native controls and text available.
   *
   * @param width - Sandbox viewport width in CSS pixels.
   * @param height - Sandbox viewport height in CSS pixels.
   * @returns Viewport-relative background rectangles.
   */
  function automaticHandles(width, height) {
    var regions = [{ x: 0, y: 0, width: 1, height: 1 }];
    var controls = document.querySelectorAll('button, a[href], input, textarea, select, [contenteditable], [tabindex], [role="button"], [draggable="true"], [onclick], [onmousedown], [onpointerdown], [ondragstart], [ondragenter], [ondragover], [ondrop], [data-rivto-interactive]');
    controls.forEach(function (node) { regions = excludeRectangle(regions, handleRectangle(node, width, height)); });
    document.body.querySelectorAll("*").forEach(function (node) {
      var style = getComputedStyle(node);
      if (node.onclick || node.onmousedown || node.onpointerdown || node.ondragstart || node.ondragenter || node.ondragover || node.ondrop || style.cursor === "pointer") {
        regions = excludeRectangle(regions, handleRectangle(node, width, height));
      }
    });
    interactiveNodes.forEach(function (reference) {
      var node = reference.deref();
      if (!node) { interactiveNodes.delete(reference); }
      else if (node.isConnected) { regions = excludeRectangle(regions, handleRectangle(node, width, height)); }
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var text;
    while ((text = walker.nextNode())) {
      if (!text.nodeValue.trim() || /^(SCRIPT|STYLE)$/.test(text.parentElement.tagName)) { continue; }
      var range = document.createRange();
      range.selectNodeContents(text);
      Array.from(range.getClientRects()).forEach(function (box) {
        regions = excludeRectangle(regions, { x: box.left / width, y: box.top / height, width: box.width / width, height: box.height / height });
      });
    }
    return regions;
  }
  /**
   * Measures current drag regions and publishes only changed geometry.
   *
   * @returns Observers match the current markers and changed bounds are sent to the host.
   */
  function reportHandles() {
    handleFrame = 0;
    var handles = Array.from(document.querySelectorAll("[data-rivto-drag-handle]")).slice(0, 64);
    if (handleObserver) {
      var nextNodes = new Set();
      handles.forEach(function (node) {
        for (var currentNode = node; currentNode; currentNode = currentNode.parentElement) { nextNodes.add(currentNode); }
      });
      observedNodes.filter(function (node) { return !nextNodes.has(node); }).forEach(function (node) { handleObserver.unobserve(node); });
      nextNodes.forEach(function (node) { if (!observedNodes.includes(node)) { handleObserver.observe(node); } });
      observedNodes = Array.from(nextNodes);
    }
    observedHandles = handles;
    var width = window.innerWidth, height = window.innerHeight;
    var rectangles = width && height ? handles.map(function (node) { return handleRectangle(node, width, height); }) : [];
    if (autoHandles && !handles.length && width && height && document.body) {
      rectangles = automaticHandles(width, height);
    }
    var serialized = JSON.stringify(rectangles);
    if (serialized !== lastHandles) {
      lastHandles = serialized;
      send({ kind: "drag-handles", handles: rectangles });
    }
  }
  /**
   * Checks whether a changed subtree contains an existing or newly marked region.
   *
   * @param node - Added, removed, or changed DOM subtree.
   * @returns Whether it can affect drag-region membership or layout.
   */
  function containsHandle(node) {
    return observedHandles.some(function (handle) { return node === handle || node.contains(handle); }) ||
      (node.nodeType === 1 && (node.hasAttribute("data-rivto-drag-handle") || node.querySelector("[data-rivto-drag-handle]")));
  }
  /**
   * Determines whether a mutation can change a region or its layout.
   *
   * @param change - Mutation delivered by the sandbox document.
   * @returns Whether geometry should be measured again.
   */
  function affectsHandles(change) {
    if (change.type === "attributes") {
      return change.attributeName === "data-rivto-drag-handle" || containsHandle(change.target);
    }
    return containsHandle(change.target) || Array.from(change.addedNodes).some(containsHandle) || Array.from(change.removedNodes).some(containsHandle);
  }
  if (typeof MutationObserver === "function") {
    new MutationObserver(function (changes) {
      if (autoHandles || changes.some(affectsHandles)) { scheduleHandles(); }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "class", "data-rivto-drag-handle", "data-rivto-interactive", "onclick", "onmousedown", "onpointerdown", "ondragstart", "ondragenter", "ondragover", "ondrop", "draggable", "tabindex", "contenteditable", "role", "href"] });
  }
  window.addEventListener("resize", scheduleHandles);
  window.addEventListener("scroll", scheduleHandles, true);
  window.addEventListener("DOMContentLoaded", scheduleHandles);
  var report = function () {
    var body = document.body;
    if (body) {
      send({ kind: "resize", height: Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().bottom)) });
    }
  };
  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    window.addEventListener("DOMContentLoaded", function () {
      if (document.body) { observer.observe(document.body); }
      report();
    });
  }
  window.addEventListener("load", report);
  if (autoHandles) {
    var addListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (listener && /^(click|dblclick|mousedown|pointerdown|touchstart|dragstart|dragenter|dragover|drop)$/.test(type)) {
        if (this instanceof Element && !interactiveReferences.has(this)) {
          var reference = new WeakRef(this);
          interactiveReferences.set(this, reference);
          interactiveNodes.add(reference);
        }
        scheduleHandles();
      }
      return addListener.call(this, type, listener, options);
    };
  }
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
  const runtime = BRIDGE_RUNTIME.replace("__TOKEN__", JSON.stringify(token));
  const head = `<meta charset="utf-8"><style>${sizing}</style><script>${runtime}${additionalScript}</scr${"ipt>"}`;
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
 * @returns A height from zero through 720 CSS pixels.
 */
export function clampFrameHeight(height: number): number {
  return Math.min(720, Math.max(0, Math.round(height)));
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
  if (message.kind === "pointerdown" && typeof message.primary === "boolean") {
    return { kind: "pointerdown", primary: message.primary };
  }
  if (message.kind === "drag-handles") {
    return parseDragHandles(message.handles);
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
 * Validates and clips sandbox-reported drag regions to the iframe viewport.
 *
 * @param value - Untrusted region list supplied by the sandbox.
 * @returns A bounded drag-region command, or undefined for an invalid list.
 */
function parseDragHandles(value: unknown): HtmlFrameCommand | undefined {
  if (!Array.isArray(value) || value.length > 64) {
    return;
  }
  const handles: EmbeddedDragHandleRegion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return;
    }
    const { x, y, width, height } = item as Record<string, unknown>;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      ![x, y, width, height].every(Number.isFinite)
    ) {
      return;
    }
    const left = Math.max(0, Math.min(1, x));
    const top = Math.max(0, Math.min(1, y));
    const right = Math.max(0, Math.min(1, x + width));
    const bottom = Math.max(0, Math.min(1, y + height));
    if (right > left && bottom > top) {
      handles.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return { kind: "drag-handles", handles };
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

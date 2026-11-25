/**
 * Iframe-side measurement of "drag regions": the parts of a widget where a
 * pointer press should start a host gesture (move the block or element)
 * rather than reach the widget.
 *
 * An iframe swallows pointer events, so the host overlays transparent targets
 * at these regions. Two modes:
 *
 * - Explicit: elements marked `data-rivto-drag-handle` are the regions.
 * - Automatic (no markers): the whole viewport minus text, native controls and
 *   anything with a detected pointer/click/drag listener.
 *
 * Listener detection patches `EventTarget.prototype.add/removeEventListener`
 * before authored scripts run, tracking elements through weak references so a
 * removed node is never retained.
 *
 * @module
 */
import { MAX_DRAG_REGIONS } from "../../constants";

/** Selector for elements whose own hit area must stay inside the widget. */
const INTERACTIVE_SELECTOR = [
  "summary",
  "label",
  "audio[controls]",
  "video[controls]",
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  "[tabindex]",
  '[role="button"]',
  '[draggable="true"]',
  "[onclick]",
  "[onmousedown]",
  "[onpointerdown]",
  "[ondragstart]",
  "[ondragenter]",
  "[ondragover]",
  "[ondrop]",
  "[data-rivto-interactive]",
].join(", ");

/** Attributes whose change can add, remove or move a drag region. */
const OBSERVED_ATTRIBUTES = [
  "open",
  "hidden",
  "controls",
  "style",
  "class",
  "data-rivto-drag-handle",
  "data-rivto-interactive",
  "onclick",
  "onmousedown",
  "onpointerdown",
  "ondragstart",
  "ondragenter",
  "ondragover",
  "ondrop",
  "draggable",
  "tabindex",
  "contenteditable",
  "role",
  "href",
];

/**
 * Builds the drag-region measurement and reporting runtime.
 *
 * @returns ES5 source; requires `send`. Sends `drag-handles` messages with
 * viewport-relative rectangles whenever they change, and an empty list on `pagehide`.
 */
export function dragRegionScript(): string {
  return `
  var regionObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleRegions) : null;
  var observedNodes = new Set();
  var interactiveNodes = new Set();
  var interactiveReferences = new WeakMap();
  var lastRegions = "";
  var regionFrame = 0;
  function scheduleRegions() {
    if (!regionFrame) { regionFrame = requestAnimationFrame(reportRegions); }
  }
  // Visible rectangle of a node after rectangular overflow clips of its ancestors,
  // as fractions of the viewport.
  function visibleRectangle(node, width, height) {
    var style = getComputedStyle(node);
    if (style.visibility !== "visible" || style.pointerEvents === "none") {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    var bounds = node.getBoundingClientRect();
    var left = bounds.left, top = bounds.top, right = bounds.right, bottom = bounds.bottom;
    for (var ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
      var clip = getComputedStyle(ancestor);
      var clipX = /^(auto|scroll|hidden|clip)$/.test(clip.overflowX);
      var clipY = /^(auto|scroll|hidden|clip)$/.test(clip.overflowY);
      if (clipX || clipY) {
        var box = ancestor.getBoundingClientRect();
        var scaleX = ancestor.offsetWidth ? box.width / ancestor.offsetWidth : 1;
        var scaleY = ancestor.offsetHeight ? box.height / ancestor.offsetHeight : 1;
        var x = box.left + ancestor.clientLeft * scaleX, y = box.top + ancestor.clientTop * scaleY;
        var clipWidth = ancestor.offsetWidth ? ancestor.clientWidth * scaleX : box.width;
        var clipHeight = ancestor.offsetHeight ? ancestor.clientHeight * scaleY : box.height;
        if (clipX) { left = Math.max(left, x); right = Math.min(right, x + clipWidth); }
        if (clipY) { top = Math.max(top, y); bottom = Math.min(bottom, y + clipHeight); }
      }
    }
    return { x: left / width, y: top / height, width: Math.max(0, right - left) / width, height: Math.max(0, bottom - top) / height };
  }
  // Subtracts one rectangle from a set of rectangles, splitting each overlap into
  // up to four remaining pieces.
  function subtractRectangle(regions, box) {
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
    return result.slice(0, ${MAX_DRAG_REGIONS});
  }
  // Whole viewport minus native controls, detected listeners, pointer cursors and text.
  function automaticRegions(width, height) {
    var regions = [{ x: 0, y: 0, width: 1, height: 1 }];
    function exclude(node) { regions = subtractRectangle(regions, visibleRectangle(node, width, height)); }
    document.querySelectorAll(${JSON.stringify(INTERACTIVE_SELECTOR)}).forEach(exclude);
    document.body.querySelectorAll("*").forEach(function (node) {
      if (node.onclick || node.onmousedown || node.onpointerdown || node.ondragstart || node.ondragenter || node.ondragover || node.ondrop || getComputedStyle(node).cursor === "pointer") {
        exclude(node);
      }
    });
    interactiveNodes.forEach(function (reference) {
      var node = reference.deref();
      if (!node) { interactiveNodes.delete(reference); }
      else if (node.isConnected) { exclude(node); }
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var text;
    while ((text = walker.nextNode())) {
      if (!text.nodeValue.trim() || /^(SCRIPT|STYLE)$/.test(text.parentElement.tagName)) { continue; }
      var range = document.createRange();
      range.selectNodeContents(text);
      Array.from(range.getClientRects()).forEach(function (box) {
        regions = subtractRectangle(regions, { x: box.left / width, y: box.top / height, width: box.width / width, height: box.height / height });
      });
    }
    return regions;
  }
  // Keeps the ResizeObserver on exactly the nodes whose size can move a region.
  function observeRegionNodes(markers) {
    if (!regionObserver) { return; }
    var nextNodes = new Set();
    if (!markers.length && document.body) {
      nextNodes.add(document.body);
      document.body.querySelectorAll("*").forEach(function (node) { nextNodes.add(node); });
    }
    markers.forEach(function (node) {
      for (var ancestor = node; ancestor; ancestor = ancestor.parentElement) { nextNodes.add(ancestor); }
    });
    observedNodes.forEach(function (node) { if (!nextNodes.has(node)) { regionObserver.unobserve(node); } });
    nextNodes.forEach(function (node) { if (!observedNodes.has(node)) { regionObserver.observe(node); } });
    observedNodes = nextNodes;
  }
  function reportRegions() {
    regionFrame = 0;
    var markers = Array.from(document.querySelectorAll("[data-rivto-drag-handle]")).slice(0, ${MAX_DRAG_REGIONS});
    observeRegionNodes(markers);
    var width = window.innerWidth, height = window.innerHeight;
    var rectangles = [];
    if (width && height && markers.length) {
      rectangles = markers.map(function (node) { return visibleRectangle(node, width, height); });
    } else if (width && height && document.body) {
      rectangles = automaticRegions(width, height);
    }
    var serialized = JSON.stringify(rectangles);
    if (serialized !== lastRegions) {
      lastRegions = serialized;
      send({ kind: "drag-handles", handles: rectangles });
    }
  }
  if (typeof MutationObserver === "function") {
    // Automatic regions depend on arbitrary layout, so every mutation reschedules a
    // measurement; one animation frame coalesces bursts.
    new MutationObserver(scheduleRegions).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ${JSON.stringify(OBSERVED_ATTRIBUTES)}
    });
  }
  // Replaced content and fonts can move controls without an attribute mutation.
  document.addEventListener("load", scheduleRegions, true);
  if (document.fonts) { document.fonts.addEventListener("loadingdone", scheduleRegions); }
  window.addEventListener("resize", scheduleRegions);
  window.addEventListener("scroll", scheduleRegions, true);
  window.addEventListener("DOMContentLoaded", scheduleRegions);
  window.addEventListener("pagehide", function () { send({ kind: "drag-handles", handles: [] }); });
${listenerTrackingScript()}
`;
}

/**
 * Tracks pointer, click and drag listeners on elements so automatic regions exclude them.
 *
 * Registrations are matched by type, listener and capture flag like the native
 * implementation; `once` and `signal` removal release the exclusion as well.
 *
 * @returns ES5 source; requires `interactiveNodes`, `interactiveReferences` and `scheduleRegions`.
 */
function listenerTrackingScript(): string {
  return `
  var nativeAddListener = EventTarget.prototype.addEventListener;
  var nativeRemoveListener = EventTarget.prototype.removeEventListener;
  var TRACKED_EVENTS = /^(click|dblclick|mousedown|pointerdown|touchstart|dragstart|dragenter|dragover|drop)$/;
  function captureFlag(options) {
    return typeof options === "boolean" ? options : Boolean(options && options.capture);
  }
  function findRegistration(node, type, listener, capture) {
    var entry = interactiveReferences.get(node);
    return entry && Array.from(entry.registrations).find(function (registration) {
      return registration.type === type && registration.listener === listener && registration.capture === capture;
    });
  }
  function forget(node, registration) {
    var entry = interactiveReferences.get(node);
    if (!entry) { return; }
    entry.registrations.delete(registration);
    if (registration.signal) { nativeRemoveListener.call(registration.signal, "abort", registration.abort); }
    if (!entry.registrations.size) {
      interactiveNodes.delete(entry.reference);
      interactiveReferences.delete(node);
    }
    scheduleRegions();
  }
  // A long-lived signal must not retain a detached element or its listener.
  function abortRegistration(nodeRef, registrationRef) {
    return function () {
      var node = nodeRef.deref(), registration = registrationRef.deref();
      if (node && registration) { forget(node, registration); }
    };
  }
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (!(this instanceof Element) || !listener || !TRACKED_EVENTS.test(type)) {
      return nativeAddListener.call(this, type, listener, options);
    }
    var capture = captureFlag(options);
    var signal = options && options.signal;
    if (signal && signal.aborted) { return; }
    if (findRegistration(this, type, listener, capture)) { return; }
    var registration = { type: type, listener: listener, capture: capture, signal: signal, callback: listener };
    if (options && options.once) {
      registration.callback = function (event) {
        forget(this, registration);
        if (typeof listener === "function") { listener.call(this, event); }
        else { listener.handleEvent(event); }
      };
    }
    nativeAddListener.call(this, type, registration.callback, options);
    var entry = interactiveReferences.get(this);
    if (!entry) {
      entry = { reference: new WeakRef(this), registrations: new Set() };
      interactiveReferences.set(this, entry);
      interactiveNodes.add(entry.reference);
    }
    entry.registrations.add(registration);
    if (signal) {
      registration.abort = abortRegistration(entry.reference, new WeakRef(registration));
      nativeAddListener.call(signal, "abort", registration.abort, { once: true });
    }
    scheduleRegions();
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    var capture = captureFlag(options);
    var registration = findRegistration(this, type, listener, capture);
    if (registration) {
      nativeRemoveListener.call(this, type, registration.callback, capture);
      forget(this, registration);
    } else {
      nativeRemoveListener.call(this, type, listener, options);
    }
  };
`;
}

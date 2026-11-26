/**
 * Page-side measurement of a widget's editor pointer regions: the areas where
 * a press should go to the editor surface (to select, move or range-select the
 * block or element) instead of interacting with the widget.
 *
 * An iframe swallows pointer events, so the editor cannot tell on its own
 * whether a press landed on a button or on empty background. The page script
 * measures the regions and reports them; the editor lays transparent
 * targets over them (see `frame/html-editor-pointer-targets.tsx`).
 *
 * There are two modes:
 * - Explicit: if the widget marks elements with `data-rivto-drag-handle`,
 *   exactly those elements are the regions.
 * - Automatic: otherwise the whole viewport is a region, minus text, native
 *   controls, and any element with a click, pointer or drag listener.
 *
 * To find elements with listeners, the script wraps
 * `EventTarget.prototype.addEventListener` / `removeEventListener` before any
 * widget script runs. Elements are tracked through weak references, so a
 * removed element can still be garbage-collected.
 *
 * @module
 */

/** Elements whose own area always stays with the widget: controls, links, editable and draggable content. */
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

/** Attributes whose change can add, remove or move an editor pointer region. */
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
 * Builds the script that measures editor pointer regions and reports them to the editor.
 *
 * The script sends an `editor-pointer-regions` message with the regions, as fractions of
 * the viewport, whenever they change, and an empty list when the page unloads.
 * Measurements are batched: any number of changes within one animation frame
 * cause a single measurement.
 *
 * @param maxEditorPointerRegions - Most regions the script measures or reports. Must
 * equal the limit the editor's message parser enforces for this page.
 * @returns ES5 source; uses `send`.
 */
export function editorPointerRegionScript(maxEditorPointerRegions: number): string {
  return `
  var sizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleMeasurement) : null;
  /** Elements the ResizeObserver currently watches. */
  var sizeObservedElements = new Set();
  /** Weak references to elements that have click, pointer or drag listeners. */
  var listenerElements = new Set();
  /** For each element with listeners: its weak reference and its live registrations. */
  var listenerEntries = new WeakMap();
  /** JSON of the last regions sent, to avoid sending the same regions twice. */
  var lastSentRegions = "";
  /** Pending animation-frame request, or 0. */
  var pendingFrame = 0;

  /** Schedules one measurement for the next animation frame, unless one is pending. */
  function scheduleMeasurement() {
    if (!pendingFrame) { pendingFrame = requestAnimationFrame(measureAndReport); }
  }

  /**
   * Measures the visible part of an element, after clipping by scrolling ancestors.
   *
   * Hidden elements and elements with pointer-events: none have no visible part.
   * Ancestors with overflow other than "visible" clip the rectangle; scale
   * transforms on those ancestors are taken into account.
   *
   * @param element - The element to measure.
   * @param viewportWidth - Viewport width in CSS pixels.
   * @param viewportHeight - Viewport height in CSS pixels.
   * @returns The visible rectangle as fractions of the viewport (possibly empty).
   */
  function visibleRectangle(element, viewportWidth, viewportHeight) {
    var style = getComputedStyle(element);
    if (style.visibility !== "visible" || style.pointerEvents === "none") {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    var bounds = element.getBoundingClientRect();
    var left = bounds.left, top = bounds.top, right = bounds.right, bottom = bounds.bottom;
    for (var ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      var ancestorStyle = getComputedStyle(ancestor);
      var clipsX = /^(auto|scroll|hidden|clip)$/.test(ancestorStyle.overflowX);
      var clipsY = /^(auto|scroll|hidden|clip)$/.test(ancestorStyle.overflowY);
      if (!clipsX && !clipsY) { continue; }
      var box = ancestor.getBoundingClientRect();
      var scaleX = ancestor.offsetWidth ? box.width / ancestor.offsetWidth : 1;
      var scaleY = ancestor.offsetHeight ? box.height / ancestor.offsetHeight : 1;
      var clipLeft = box.left + ancestor.clientLeft * scaleX;
      var clipTop = box.top + ancestor.clientTop * scaleY;
      var clipWidth = ancestor.offsetWidth ? ancestor.clientWidth * scaleX : box.width;
      var clipHeight = ancestor.offsetHeight ? ancestor.clientHeight * scaleY : box.height;
      if (clipsX) { left = Math.max(left, clipLeft); right = Math.min(right, clipLeft + clipWidth); }
      if (clipsY) { top = Math.max(top, clipTop); bottom = Math.min(bottom, clipTop + clipHeight); }
    }
    return {
      x: left / viewportWidth,
      y: top / viewportHeight,
      width: Math.max(0, right - left) / viewportWidth,
      height: Math.max(0, bottom - top) / viewportHeight
    };
  }

  /**
   * Removes a rectangle from a set of rectangles.
   *
   * Each rectangle that overlaps the hole is split into up to four pieces
   * around it (above, below, left, right). The result is capped at
   * ${maxEditorPointerRegions} rectangles, so a busy widget loses its smallest leftovers.
   *
   * @param regions - Rectangles to cut, as viewport fractions.
   * @param hole - The rectangle to remove, as viewport fractions.
   * @returns The remaining rectangles.
   */
  function subtractRectangle(regions, hole) {
    var result = [];
    regions.forEach(function (region) {
      var regionRight = region.x + region.width, regionBottom = region.y + region.height;
      var overlapLeft = Math.max(region.x, hole.x), overlapTop = Math.max(region.y, hole.y);
      var overlapRight = Math.min(regionRight, hole.x + hole.width);
      var overlapBottom = Math.min(regionBottom, hole.y + hole.height);
      if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) { result.push(region); return; }
      if (overlapTop > region.y) {
        result.push({ x: region.x, y: region.y, width: region.width, height: overlapTop - region.y });
      }
      if (overlapBottom < regionBottom) {
        result.push({ x: region.x, y: overlapBottom, width: region.width, height: regionBottom - overlapBottom });
      }
      if (overlapLeft > region.x) {
        result.push({ x: region.x, y: overlapTop, width: overlapLeft - region.x, height: overlapBottom - overlapTop });
      }
      if (overlapRight < regionRight) {
        result.push({ x: overlapRight, y: overlapTop, width: regionRight - overlapRight, height: overlapBottom - overlapTop });
      }
    });
    return result.slice(0, ${maxEditorPointerRegions});
  }

  /**
   * Computes automatic regions: the whole viewport minus everything interactive.
   *
   * Removed from the viewport, in order: controls and elements matching the
   * interactive selector; elements with inline handlers or a pointer cursor;
   * elements with tracked listeners; and every line of visible text, so text
   * stays selectable.
   *
   * @param viewportWidth - Viewport width in CSS pixels.
   * @param viewportHeight - Viewport height in CSS pixels.
   * @returns The background rectangles, as viewport fractions.
   */
  function automaticRegions(viewportWidth, viewportHeight) {
    var regions = [{ x: 0, y: 0, width: 1, height: 1 }];
    function exclude(element) {
      regions = subtractRectangle(regions, visibleRectangle(element, viewportWidth, viewportHeight));
    }
    document.querySelectorAll(${JSON.stringify(INTERACTIVE_SELECTOR)}).forEach(exclude);
    document.body.querySelectorAll("*").forEach(function (element) {
      var hasInlineHandler = element.onclick || element.onmousedown || element.onpointerdown ||
        element.ondragstart || element.ondragenter || element.ondragover || element.ondrop;
      if (hasInlineHandler || getComputedStyle(element).cursor === "pointer") { exclude(element); }
    });
    listenerElements.forEach(function (reference) {
      var element = reference.deref();
      if (!element) { listenerElements.delete(reference); }
      else if (element.isConnected) { exclude(element); }
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var textNode;
    while ((textNode = walker.nextNode())) {
      if (!textNode.nodeValue.trim() || /^(SCRIPT|STYLE)$/.test(textNode.parentElement.tagName)) { continue; }
      var range = document.createRange();
      range.selectNodeContents(textNode);
      Array.from(range.getClientRects()).forEach(function (line) {
        regions = subtractRectangle(regions, {
          x: line.left / viewportWidth,
          y: line.top / viewportHeight,
          width: line.width / viewportWidth,
          height: line.height / viewportHeight
        });
      });
    }
    return regions;
  }

  /**
   * Points the ResizeObserver at the elements whose size can move a region.
   *
   * In explicit mode those are the markers and their ancestors. In automatic
   * mode any element can matter, so the whole body is observed.
   *
   * @param markers - Elements marked with data-rivto-drag-handle.
   */
  function observeRelevantSizes(markers) {
    if (!sizeObserver) { return; }
    var nextElements = new Set();
    if (!markers.length && document.body) {
      nextElements.add(document.body);
      document.body.querySelectorAll("*").forEach(function (element) { nextElements.add(element); });
    }
    markers.forEach(function (marker) {
      for (var element = marker; element; element = element.parentElement) { nextElements.add(element); }
    });
    sizeObservedElements.forEach(function (element) {
      if (!nextElements.has(element)) { sizeObserver.unobserve(element); }
    });
    nextElements.forEach(function (element) {
      if (!sizeObservedElements.has(element)) { sizeObserver.observe(element); }
    });
    sizeObservedElements = nextElements;
  }

  /** Measures the regions and sends them to the editor if they changed. */
  function measureAndReport() {
    pendingFrame = 0;
    var markers = Array.from(document.querySelectorAll("[data-rivto-drag-handle]")).slice(0, ${maxEditorPointerRegions});
    observeRelevantSizes(markers);
    var width = window.innerWidth, height = window.innerHeight;
    var regions = [];
    if (width && height && markers.length) {
      regions = markers.map(function (marker) { return visibleRectangle(marker, width, height); });
    } else if (width && height && document.body) {
      regions = automaticRegions(width, height);
    }
    var serialized = JSON.stringify(regions);
    if (serialized !== lastSentRegions) {
      lastSentRegions = serialized;
      send({ kind: "editor-pointer-regions", regions: regions });
    }
  }

  if (typeof MutationObserver === "function") {
    // In automatic mode any DOM change can move a region, so every mutation
    // schedules a measurement; the animation frame batches bursts of changes.
    new MutationObserver(scheduleMeasurement).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ${JSON.stringify(OBSERVED_ATTRIBUTES)}
    });
  }
  // Images and fonts can finish loading and move controls without any DOM mutation.
  document.addEventListener("load", scheduleMeasurement, true);
  if (document.fonts) { document.fonts.addEventListener("loadingdone", scheduleMeasurement); }
  window.addEventListener("resize", scheduleMeasurement);
  window.addEventListener("scroll", scheduleMeasurement, true);
  window.addEventListener("DOMContentLoaded", scheduleMeasurement);
  window.addEventListener("pagehide", function () { send({ kind: "editor-pointer-regions", regions: [] }); });
${listenerTrackingScript()}
`;
}

/**
 * Builds the script that tracks which elements have click, pointer or drag listeners.
 *
 * It wraps `addEventListener` / `removeEventListener` so automatic regions can
 * leave those elements to the widget. Registrations are matched the way the
 * browser matches them (event type, callback, capture flag). A registration
 * also ends when a `once` listener fires or its `AbortSignal` aborts; when an
 * element's last registration ends, its area goes back to the editor.
 *
 * @returns ES5 source; uses `listenerElements`, `listenerEntries` and `scheduleMeasurement`.
 */
function listenerTrackingScript(): string {
  return `
  var nativeAddListener = EventTarget.prototype.addEventListener;
  var nativeRemoveListener = EventTarget.prototype.removeEventListener;
  var TRACKED_EVENTS = /^(click|dblclick|mousedown|pointerdown|touchstart|dragstart|dragenter|dragover|drop)$/;

  /**
   * Reads the capture flag the way addEventListener does.
   *
   * @param options - A boolean or an options object, or undefined.
   * @returns The capture flag.
   */
  function captureFlag(options) {
    return typeof options === "boolean" ? options : Boolean(options && options.capture);
  }

  /**
   * Finds a live registration on an element.
   *
   * @param element - The element.
   * @param type - Event type.
   * @param listener - The callback or listener object the widget passed.
   * @param capture - Capture flag.
   * @returns The registration, or undefined.
   */
  function findRegistration(element, type, listener, capture) {
    var entry = listenerEntries.get(element);
    return entry && Array.from(entry.registrations).find(function (registration) {
      return registration.type === type && registration.listener === listener && registration.capture === capture;
    });
  }

  /**
   * Ends one registration; when it was the element's last, stops tracking the element.
   *
   * Called on removeEventListener, after a once listener fires, and when its signal aborts.
   *
   * @param element - The element the listener was registered on.
   * @param registration - The registration to end.
   */
  function forgetRegistration(element, registration) {
    var entry = listenerEntries.get(element);
    if (!entry) { return; }
    entry.registrations.delete(registration);
    if (registration.signal) { nativeRemoveListener.call(registration.signal, "abort", registration.onAbort); }
    if (!entry.registrations.size) {
      listenerElements.delete(entry.reference);
      listenerEntries.delete(element);
    }
    scheduleMeasurement();
  }

  /**
   * Builds the abort handler of a registration made with an AbortSignal.
   *
   * It holds the element and the registration only weakly, so a long-lived
   * signal does not keep a removed element alive.
   *
   * @param elementReference - Weak reference to the element.
   * @param registrationReference - Weak reference to the registration.
   * @returns The abort handler.
   */
  function abortHandler(elementReference, registrationReference) {
    return function () {
      var element = elementReference.deref(), registration = registrationReference.deref();
      if (element && registration) { forgetRegistration(element, registration); }
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
      // A once listener ends its own registration when it fires.
      registration.callback = function (event) {
        forgetRegistration(this, registration);
        if (typeof listener === "function") { listener.call(this, event); }
        else { listener.handleEvent(event); }
      };
    }
    nativeAddListener.call(this, type, registration.callback, options);
    var entry = listenerEntries.get(this);
    if (!entry) {
      entry = { reference: new WeakRef(this), registrations: new Set() };
      listenerEntries.set(this, entry);
      listenerElements.add(entry.reference);
    }
    entry.registrations.add(registration);
    if (signal) {
      registration.onAbort = abortHandler(entry.reference, new WeakRef(registration));
      nativeAddListener.call(signal, "abort", registration.onAbort, { once: true });
    }
    scheduleMeasurement();
  };

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    var capture = captureFlag(options);
    var registration = findRegistration(this, type, listener, capture);
    if (registration) {
      nativeRemoveListener.call(this, type, registration.callback, capture);
      forgetRegistration(this, registration);
    } else {
      nativeRemoveListener.call(this, type, listener, options);
    }
  };
`;
}

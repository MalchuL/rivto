/**
 * Iframe-side relay that lets a native text drag continue into neighboring Page blocks.
 *
 * Browsers keep delivering pointer movement and release to the iframe where a
 * text selection started, even outside its viewport. Once a nonempty range
 * leaves the viewport, this fragment reports the pointer position to the host,
 * which converts it to parent coordinates and lets Page select whole blocks.
 *
 * @module
 */

/** Targets that own their own pointer behavior and never start a relayed selection. */
const NATIVE_INPUT_SELECTOR =
  "input,textarea,select,button,label,summary,a[href],audio[controls],video[controls],[role=button],[draggable=true],[data-rivto-interactive]";

/**
 * Builds the text-selection relay.
 *
 * IMPORTANT: widget commands must never be able to impersonate cross-block
 * pointer input. Reports are authenticated with a separate `selectionKey`
 * that authored scripts cannot read: the fragment removes its own `<script>`
 * element and captures `postMessage` and the native coordinate getters before
 * any authored script runs.
 *
 * @param selectionKey - Host secret used only for these reports, distinct from the frame token.
 * @returns ES5 source; requires `port`.
 */
export function textSelectionScript(selectionKey: string): string {
  return `
  (function () {
    document.currentScript.remove();
    var post = port.postMessage.bind(port);
    var readX = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(MouseEvent.prototype, "clientX").get);
    var readY = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(MouseEvent.prototype, "clientY").get);
    var id = null, x = 0, y = 0, crossing = false;
    function report(phase) {
      post({ selectionKey: ${JSON.stringify(selectionKey)}, phase: phase, x: x, y: y });
    }
    function reset() {
      if (crossing) { report("cancel"); }
      id = null;
      crossing = false;
    }
    function update(phase) {
      if (id === null) { return; }
      if (!crossing) {
        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) { return; }
        var selection = window.getSelection();
        if (!selection || selection.isCollapsed) { return; }
        crossing = true;
      }
      report(phase);
    }
    window.addEventListener("pointerdown", function (event) {
      if (!event.isTrusted || event.pointerType !== "mouse" || event.button !== 0) { return; }
      reset();
      var target = event.target;
      if (!(target instanceof Element) || target.isContentEditable ||
          target.closest(${JSON.stringify(NATIVE_INPUT_SELECTOR)})) { return; }
      id = event.pointerId;
      x = readX(event); y = readY(event);
    }, true);
    window.addEventListener("pointermove", function (event) {
      if (!event.isTrusted || id !== event.pointerId) { return; }
      if (event.buttons !== 1) { reset(); return; }
      x = readX(event); y = readY(event);
      update("move");
    }, true);
    document.addEventListener("selectionchange", function () {
      if (!crossing) { update("move"); }
    });
    window.addEventListener("pointerup", function (event) {
      if (!event.isTrusted || id !== event.pointerId) { return; }
      x = readX(event); y = readY(event);
      update("end");
      crossing = false;
      id = null;
    }, true);
    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { reset(); }
    }, true);
    window.addEventListener("blur", function (event) {
      if (event.target === window) { reset(); }
    });
    // A widget that captures the pointer (e.g. a sortable list) owns the gesture.
    window.addEventListener("gotpointercapture", function (event) {
      if (event.pointerId === id) { reset(); }
    }, true);
    ["dragstart", "pointercancel", "pagehide"].forEach(function (type) {
      window.addEventListener(type, reset, true);
    });
  })();
`;
}

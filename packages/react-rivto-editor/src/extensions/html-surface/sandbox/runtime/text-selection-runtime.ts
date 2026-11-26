/**
 * Page side of the text-selection relay: lets a text selection that starts
 * inside an HTML block continue into the neighboring Page blocks.
 *
 * While the mouse button is held, the browser keeps sending pointer events to
 * the iframe where a text selection started, even after the pointer leaves
 * it. This script watches for that: once the selection is non-empty and the
 * pointer is outside the viewport, it reports the pointer position to the
 * editor, which lets Page select whole blocks (see `frame/iframe-text-selection.ts`).
 * Moving back into the iframe returns to an ordinary text selection.
 *
 * Keep `./reference/text-selection-runtime.js` in sync with the emitted script.
 * `iframe-runtime.test.ts` checks that both copies match.
 *
 * @module
 */

/** Elements with their own pointer behavior; a press on them never starts a relayed selection. */
const NATIVE_INPUT_SELECTOR =
  "input,textarea,select,button,label,summary,a[href],audio[controls],video[controls],[role=button],[draggable=true],[data-rivto-interactive]";

/**
 * Builds the page-side text-selection relay.
 *
 * IMPORTANT: a widget script must not be able to fake these reports, or it
 * could make Page select blocks the user never dragged over. So reports use a
 * separate secret, `selectionKey`, that widget scripts cannot read. Before
 * any widget script runs, this script:
 * - removes its own `<script>` element, which contains the key;
 * - keeps private copies of `port.postMessage` and of the native
 *   `clientX` / `clientY` getters, so a widget cannot replace them.
 *
 * @param selectionKey - Secret used only for these reports; different from the page token.
 * @returns ES5 source; uses `port`.
 */
export function textSelectionScript(selectionKey: string): string {
  return `
  (function () {
    document.currentScript.remove();
    var post = port.postMessage.bind(port);
    var readX = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(MouseEvent.prototype, "clientX").get);
    var readY = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(MouseEvent.prototype, "clientY").get);
    /** Pointer ID of the drag being watched, or null. */
    var id = null;
    /** Last pointer position, in iframe viewport coordinates. */
    var x = 0, y = 0;
    /** Whether the drag has left the iframe with a non-empty selection, so reports are being sent. */
    var crossing = false;

    /**
     * Sends the current position to the editor.
     *
     * @param phase - "move", "end" or "cancel".
     */
    function report(phase) {
      post({ selectionKey: ${JSON.stringify(selectionKey)}, phase: phase, x: x, y: y });
    }
    /** Stops watching the drag, telling the editor to cancel if reports were being sent. */
    function reset() {
      if (crossing) { report("cancel"); }
      id = null;
      crossing = false;
    }
    /**
     * Reports the position once the drag qualifies: a non-empty selection and
     * the pointer outside the viewport. After that, every position is reported.
     *
     * @param phase - "move" or "end".
     */
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
    // A widget that captures the pointer (a sortable list, a slider) owns the gesture.
    window.addEventListener("gotpointercapture", function (event) {
      if (event.pointerId === id) { reset(); }
    }, true);
    ["dragstart", "pointercancel", "pagehide"].forEach(function (type) {
      window.addEventListener(type, reset, true);
    });
  })();
`;
}

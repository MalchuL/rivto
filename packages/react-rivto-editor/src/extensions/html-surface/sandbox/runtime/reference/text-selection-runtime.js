// Keep this reference in sync with ../text-selection-runtime.ts. iframe-runtime.test.ts checks the emitted code.
/* global document, port, MouseEvent, innerWidth, innerHeight, window, Element */
/* eslint-disable @stylistic/curly-newline -- Preserve the layout of the emitted script. */

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
      post({ selectionKey: "reference-selection-key", phase: phase, x: x, y: y });
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
          target.closest("input,textarea,select,button,label,summary,a[href],audio[controls],video[controls],[role=button],[draggable=true],[data-rivto-interactive]")) { return; }
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

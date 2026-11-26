// Keep this reference in sync with ../unsafe-runtime.ts. iframe-runtime.test.ts checks the emitted code.
/* global send, port, namespace, token, window */
/* eslint-disable @stylistic/curly-newline -- Preserve the layout of the emitted script. */

  (function () {
    var enabled = true;
    var nextId = 0;
    /** Unanswered requests: request ID -> the promise's resolve and reject. */
    var pending = new Map();

    /**
     * Sends a request to the editor.
     *
     * @param target - "panel" or "reactEditor".
     * @param method - Name of the block method.
     * @param args - Arguments as passed by the widget.
     * @returns A promise of the editor's answer; rejected if the editor refuses or the call fails.
     */
    function request(target, method, args) {
      return new Promise(function (resolve, reject) {
        var id = ++nextId;
        pending.set(id, { resolve: resolve, reject: reject });
        send({ kind: "unsafe-request", id: id, target: target, method: method, args: args });
      });
    }
    port.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.namespace !== namespace || data.token !== token || data.kind !== "unsafe-result") { return; }
      var entry = pending.get(data.id);
      if (!entry) { return; }
      pending.delete(data.id);
      if (data.error) { entry.reject(new Error(data.error)); } else { entry.resolve(data.value); }
    });
    /**
     * Builds the frozen object a widget sees as rivto.panel or rivto.reactEditor.
     *
     * @param target - "panel" or "reactEditor".
     * @returns An object with a frozen blocks object of request functions.
     */
    function proxy(target) {
      var blocks = {};
      ["getRootIds","getParentId","getChildIds","getBlockNode","setContent"].forEach(function (method) {
        blocks[method] = function () { return request(target, method, Array.from(arguments)); };
      });
      return Object.freeze({ blocks: Object.freeze(blocks) });
    }
    var proxies = { panel: proxy("panel"), reactEditor: proxy("reactEditor") };
    ["panel", "reactEditor"].forEach(function (name) {
      Object.defineProperty(window.rivto, name, { get: function () {
        if (!enabled) { send({ kind: "unsafe-denied" }); return null; }
        return proxies[name];
      } });
    });
  })();

/**
 * Page side of Unsafe HTML editor access: the `rivto.panel` and
 * `rivto.reactEditor` objects a widget script calls.
 *
 * @module
 */
import { UNSAFE_HTML_METHODS } from "../../unsafe/unsafe-requests";

/**
 * Defines `rivto.panel` and `rivto.reactEditor`.
 *
 * Each exposes `blocks` with the methods in {@link UNSAFE_HTML_METHODS}. Every
 * method returns a promise: the call is sent to the editor as an
 * `unsafe-request`, and the editor decides when it arrives whether to run it.
 * `rivto.panel` works within the panel showing the block; `rivto.reactEditor`
 * works on the whole document.
 *
 * While access is off, both getters return `null` and tell the editor, which
 * then shows its "this HTML requested editor access" warning. Calls made
 * while the page is still starting are queued by the port until the editor
 * connects.
 *
 * @param enabled - Whether access was granted when this page was built.
 * @returns ES5 source; uses `port`, `send`, `namespace` and `token`.
 */
export function unsafeAccessScript(enabled: boolean): string {
  return `
  (function () {
    var enabled = ${JSON.stringify(enabled)};
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
      ${JSON.stringify(UNSAFE_HTML_METHODS)}.forEach(function (method) {
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
`;
}

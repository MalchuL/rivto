/**
 * Iframe-side proxies for the editor access an Unsafe HTML block may be granted.
 *
 * @module
 */
import { UNSAFE_HTML_METHODS } from "../../unsafe/unsafe-requests";

/**
 * Defines `rivto.panel` and `rivto.reactEditor` as promise-returning proxies.
 *
 * Every call becomes an `unsafe-request`; the host decides at execution time
 * whether to honor it. While access is disabled, the getters return `null`
 * and notify the host so it can show its access warning. Requests made during
 * initial script execution are queued by the port until the host connects.
 *
 * @param enabled - Whether the host granted access when this document was composed.
 * @returns ES5 source; requires `port`, `send`, `channel` and `token`.
 */
export function unsafeAccessScript(enabled: boolean): string {
  return `
  (function () {
    var enabled = ${JSON.stringify(enabled)};
    var nextId = 0;
    var pending = new Map();
    function request(target, method, args) {
      return new Promise(function (resolve, reject) {
        var id = ++nextId;
        pending.set(id, { resolve: resolve, reject: reject });
        send({ kind: "unsafe-request", id: id, target: target, method: method, args: args });
      });
    }
    port.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.channel !== channel || data.token !== token || data.kind !== "unsafe-result") { return; }
      var entry = pending.get(data.id);
      if (!entry) { return; }
      pending.delete(data.id);
      if (data.error) { entry.reject(new Error(data.error)); } else { entry.resolve(data.value); }
    });
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

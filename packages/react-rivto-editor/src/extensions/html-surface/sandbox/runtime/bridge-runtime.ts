/**
 * Core iframe-side runtime: the private host connection and the `window.rivto` API.
 *
 * Every runtime fragment in this directory is plain ES5 source spliced into a
 * single IIFE by `composeSrcDoc`. Fragments share this scope:
 *
 * - `token`   – per-document secret, declared by the composer.
 * - `channel` – {@link HTML_CHANNEL}, declared by the composer.
 * - `port`    – this document's end of the private `MessageChannel`.
 * - `send(message)` – posts `{channel, token, ...message}` through `port`.
 *
 * The host answers only through `port`, so a page that the iframe navigates to
 * can never receive messages meant for the authored document.
 *
 * @module
 */

/**
 * Builds the connection and the public widget API.
 *
 * Declares `port` and `send` for later fragments, defines `window.rivto`, and
 * announces readiness by transferring the other port end to the parent.
 *
 * @returns ES5 source that must run first inside the composed IIFE.
 */
export function bridgeCoreScript(): string {
  return `
  var connection = new MessageChannel();
  var port = connection.port1;
  var current = null;
  var waiters = [];
  var listeners = [];
  var contextListeners = [];
  function send(message) {
    port.postMessage(Object.assign({ channel: channel, token: token }, message));
  }
  function sameContext(a, b) {
    return a.mode === b.mode && a.selected === b.selected && a.preview === b.preview;
  }
  function notify(list, value) {
    list.slice().forEach(function (listener) { listener(value); });
  }
  function subscribeTo(list, listener) {
    list.push(listener);
    return function () {
      var index = list.indexOf(listener);
      if (index >= 0) { list.splice(index, 1); }
    };
  }
  // A full snapshot notifies data subscribers, and context subscribers only if the
  // presentation changed. A context-only update never notifies data subscribers.
  function publishNode(next) {
    var previous = current && current.context;
    current = next;
    waiters.splice(0).forEach(function (resolve) { resolve(next); });
    notify(listeners, next);
    if (previous && !sameContext(previous, next.context)) { notify(contextListeners, next.context); }
  }
  function publishContext(context) {
    if (!current || sameContext(current.context, context)) { return; }
    current = Object.assign({}, current, { context: context });
    notify(contextListeners, context);
  }
  port.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.channel !== channel || data.token !== token) { return; }
    if (data.kind === "node") { publishNode(data.node); }
    else if (data.kind === "context") { publishContext(data.context); }
    else if (data.kind === "clear-text-selection") { window.getSelection()?.removeAllRanges(); }
  });
  window.rivto = {
    get node() { return current; },
    get props() { return current ? current.props : null; },
    get context() { return current ? current.context : null; },
    ready: function () {
      if (current) { return Promise.resolve(current); }
      return new Promise(function (resolve) { waiters.push(resolve); });
    },
    subscribe: function (listener) { return subscribeTo(listeners, listener); },
    subscribeContext: function (listener) { return subscribeTo(contextListeners, listener); },
    setProp: function (key, value) { send({ kind: "set-prop", key: key, value: value }); },
    setProps: function (props) { send({ kind: "set-props", props: props }); },
    setListProps: function (listProps) { send({ kind: "set-list-props", listProps: listProps }); },
    setContent: function (content) { send({ kind: "set-content", content: content }); }
  };
  port.start();
  parent.postMessage({ channel: channel, token: token, kind: "ready" }, "*", [connection.port2]);
`;
}

/**
 * Reports trusted primary pointer presses so the host can select a canvas element.
 *
 * @returns ES5 source; requires `send`.
 */
export function pointerNotificationScript(): string {
  return `
  window.addEventListener("pointerdown", function (event) {
    if (event.isTrusted && event.button === 0) {
      send({ kind: "pointerdown", primary: event.ctrlKey || event.metaKey });
    }
  }, true);
`;
}

/**
 * Reports the document height whenever layout changes, for auto-sized Page blocks.
 *
 * @returns ES5 source; requires `send`.
 */
export function frameHeightScript(): string {
  return `
  function reportHeight() {
    var body = document.body;
    if (body) {
      send({ kind: "resize", height: Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().bottom)) });
    }
  }
  if (typeof ResizeObserver === "function") {
    var heightObserver = new ResizeObserver(reportHeight);
    heightObserver.observe(document.documentElement);
    window.addEventListener("DOMContentLoaded", function () {
      if (document.body) { heightObserver.observe(document.body); }
      reportHeight();
    });
  }
  window.addEventListener("load", reportHeight);
`;
}

/**
 * Closes the connection when the document unloads.
 *
 * Must be the last `pagehide` listener so other fragments can still send
 * their final messages (such as clearing drag regions) first.
 *
 * @returns ES5 source; requires `port`.
 */
export function connectionTeardownScript(): string {
  return `
  window.addEventListener("pagehide", function () {
    // IMPORTANT: editor access belongs to this document. Close its port when leaving
    // so the next page loaded in this iframe cannot inherit the connection.
    port.close();
  });
`;
}

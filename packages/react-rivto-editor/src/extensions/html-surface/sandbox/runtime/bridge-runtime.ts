/**
 * Core of the script that runs inside a widget page: the private connection
 * to the editor and the `window.rivto` API that widget scripts use.
 *
 * How the page scripts are built: every `*Script()` function in this directory
 * returns plain ES5 source text. `composeSrcDoc` joins the pieces into one
 * function that runs before any widget script. The pieces share these names:
 *
 * - `token`     – the page's secret; every message carries it. Declared by the composer.
 * - `namespace` – {@link HTML_IFRAME_MESSAGE_NAMESPACE}; every message carries it. Declared by the composer.
 * - `port`      – the page's end of the private `MessageChannel` to the editor.
 * - `send(message)` – posts `{namespace, token, ...message}` through `port`.
 *
 * The editor answers only through `port`, so if a link or form navigates the
 * iframe to another page, that page cannot receive messages meant for the widget.
 *
 * The scripts are strings, so TypeScript does not check them. Their behavior
 * is covered by the browser tests in `e2e/html-*.spec.ts`.
 *
 * @module
 */

/**
 * Builds the connection to the editor and the `window.rivto` API.
 *
 * Declares `port` and `send` for the later pieces, defines `window.rivto`,
 * and sends `ready` to the editor together with the other end of the channel.
 *
 * @returns ES5 source. Must be the first piece, because the others use `port` and `send`.
 */
export function bridgeCoreScript(): string {
  return `
  var connection = new MessageChannel();
  var port = connection.port1;
  /** Latest node snapshot with its context, or null until the editor sends one. */
  var currentNode = null;
  /** Resolvers of rivto.ready() calls made before the first snapshot. */
  var readyWaiters = [];
  /** Callbacks registered with rivto.subscribe(). */
  var nodeListeners = [];
  /** Callbacks registered with rivto.subscribeContext(). */
  var contextListeners = [];

  /**
   * Posts a message to the editor through the private port.
   *
   * @param message - Message body; the namespace and token are added.
   */
  function send(message) {
    port.postMessage(Object.assign({ namespace: namespace, token: token }, message));
  }

  /**
   * Compares the presentation fields a widget can observe.
   *
   * @param a - One context.
   * @param b - Another context.
   * @returns True when mode, selected and preview are all equal.
   */
  function sameContext(a, b) {
    return a.mode === b.mode && a.selected === b.selected && a.preview === b.preview;
  }

  /**
   * Calls every listener in a list with a value.
   *
   * Iterates over a copy, so a listener may unsubscribe itself while being called.
   *
   * @param list - Listeners to call.
   * @param value - Value passed to each listener.
   */
  function notify(list, value) {
    list.slice().forEach(function (listener) { listener(value); });
  }

  /**
   * Adds a listener to a list.
   *
   * @param list - The list to add to.
   * @param listener - The callback.
   * @returns A function that removes the listener again.
   */
  function subscribeTo(list, listener) {
    list.push(listener);
    return function () {
      var index = list.indexOf(listener);
      if (index >= 0) { list.splice(index, 1); }
    };
  }

  /**
   * Stores a new node snapshot from the editor and notifies the widget.
   *
   * Resolves pending rivto.ready() calls and calls node listeners. Context
   * listeners are called only if the presentation also changed.
   *
   * @param next - The new snapshot, including its context.
   */
  function publishNode(next) {
    var previous = currentNode && currentNode.context;
    currentNode = next;
    readyWaiters.splice(0).forEach(function (resolve) { resolve(next); });
    notify(nodeListeners, next);
    if (previous && !sameContext(previous, next.context)) { notify(contextListeners, next.context); }
  }

  /**
   * Stores a presentation-only change and notifies context listeners.
   *
   * Node listeners are deliberately not called, so selecting a block cannot
   * make a widget re-render as if its data had changed.
   *
   * @param context - The new context.
   */
  function publishContext(context) {
    if (!currentNode || sameContext(currentNode.context, context)) { return; }
    currentNode = Object.assign({}, currentNode, { context: context });
    notify(contextListeners, context);
  }

  port.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.namespace !== namespace || data.token !== token) { return; }
    if (data.kind === "node") { publishNode(data.node); }
    else if (data.kind === "context") { publishContext(data.context); }
    else if (data.kind === "clear-text-selection") { window.getSelection()?.removeAllRanges(); }
  });

  window.rivto = {
    get node() { return currentNode; },
    get props() { return currentNode ? currentNode.props : null; },
    get context() { return currentNode ? currentNode.context : null; },
    ready: function () {
      if (currentNode) { return Promise.resolve(currentNode); }
      return new Promise(function (resolve) { readyWaiters.push(resolve); });
    },
    subscribe: function (listener) { return subscribeTo(nodeListeners, listener); },
    subscribeContext: function (listener) { return subscribeTo(contextListeners, listener); },
    setProp: function (key, value) { send({ kind: "set-prop", key: key, value: value }); },
    setProps: function (props) { send({ kind: "set-props", props: props }); },
    setListProps: function (listProps) { send({ kind: "set-list-props", listProps: listProps }); },
    setContent: function (content) { send({ kind: "set-content", content: content }); }
  };

  port.start();
  parent.postMessage({ namespace: namespace, token: token, kind: "ready" }, "*", [connection.port2]);
`;
}

/**
 * Reports primary-button presses to the editor.
 *
 * The canvas uses this to select an HTML element when the user clicks inside
 * it: the iframe swallows the press, so the canvas would not see it otherwise.
 * Only trusted (real) presses are reported.
 *
 * @returns ES5 source; uses `send`.
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
 * Reports the page height whenever it may have changed, so a Page block can
 * grow to fit its widget.
 *
 * @returns ES5 source; uses `send`.
 */
export function frameHeightScript(): string {
  return `
  /** Sends the body's full height to the editor. */
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
 * Closes the connection when the page unloads.
 *
 * Must be the last piece: the other pieces register their own `pagehide`
 * handlers (for example, to clear editor pointer regions), and those must still be able
 * to send before the port closes.
 *
 * @returns ES5 source; uses `port`.
 */
export function connectionTeardownScript(): string {
  return `
  window.addEventListener("pagehide", function () {
    // IMPORTANT: editor access belongs to this page. Closing the port when the
    // page unloads ensures the next page loaded in this iframe cannot use it.
    port.close();
  });
`;
}

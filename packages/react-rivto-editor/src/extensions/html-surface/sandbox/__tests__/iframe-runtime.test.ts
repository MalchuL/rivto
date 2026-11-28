import { HTML_IFRAME_MESSAGE_NAMESPACE } from "../../constants";
import type { HtmlBlockView, HtmlWidgetContext } from "../../types";
import type { HtmlHostMessage } from "../frame-messages";
import {
  bridgeCoreScript,
  connectionTeardownScript,
  frameHeightScript,
  pointerNotificationScript,
} from "../runtime/bridge-runtime";
import { editorPointerRegionScript } from "../runtime/editor-pointer-region-runtime";
import { textSelectionScript } from "../runtime/text-selection-runtime";
import { unsafeAccessScript } from "../runtime/unsafe-runtime";

const { readFileSync } = import.meta.jest.requireActual<{
  readFileSync: (path: URL, encoding: "utf8") => string;
}>("node:fs");

test.each([
  [
    "bridge-runtime",
    [
      bridgeCoreScript(),
      pointerNotificationScript(),
      frameHeightScript(),
      connectionTeardownScript(),
    ].join("\n"),
  ],
  ["editor-pointer-region-runtime", editorPointerRegionScript(5)],
  ["text-selection-runtime", textSelectionScript("reference-selection-key")],
  ["unsafe-runtime", unsafeAccessScript(true)],
])("%s emits the same code as its JavaScript reference", (name, script) => {
  expect(script.trim()).toBe(readRuntimeReference(name));
});

/**
 * Reads the exact iframe script after the reference file's metadata header.
 *
 * @param name - Reference file name without the extension.
 * @returns JavaScript with normalized line endings and surrounding whitespace removed.
 */
function readRuntimeReference(name: string): string {
  const reference = readFileSync(
    new URL(`../runtime/reference/${name}.js`, import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const headerEnd = reference.indexOf("\n\n");
  expect(headerEnd).toBeGreaterThan(0);
  return reference.slice(headerEnd + 2).trim();
}

type WidgetApi = {
  readonly node: HtmlBlockView | null;
  readonly props: HtmlBlockView["props"] | null;
  readonly context: HtmlWidgetContext | null;
  readonly ready: () => Promise<HtmlBlockView>;
  readonly subscribe: (listener: (node: HtmlBlockView) => void) => () => void;
  readonly subscribeContext: (listener: (context: HtmlWidgetContext) => void) => () => void;
  readonly setProp: (key: string, value: unknown) => void;
  readonly setProps: (props: HtmlBlockView["props"]) => void;
  readonly setListProps: (props: HtmlBlockView["listProps"]) => void;
  readonly setContent: (content: string) => void;
};

const namespace = HTML_IFRAME_MESSAGE_NAMESPACE;
const token = "test-widget-document";
const initialNode: HtmlBlockView = {
  kind: "block",
  id: "widget",
  type: "html",
  content: "<p>First snapshot</p>",
  props: { count: 0 },
  listProps: {},
  pluginData: {},
  childIds: [],
  context: { mode: "block", selected: false, preview: false },
};

/**
 * Executes the JavaScript reference with isolated window and message-port doubles.
 *
 * @returns The installed widget API and the events and messages available to the host.
 */
function startReferenceBridge() {
  const window = new EventTarget();
  const { fn } = import.meta.jest;
  const port1 = Object.assign(new EventTarget(), { start: fn(), close: fn(), postMessage: fn() });
  const port2 = new EventTarget();
  const parent = { postMessage: fn() };
  const document = {
    body: { scrollHeight: 41, getBoundingClientRect: () => ({ bottom: 42.2 }) },
  };
  const start = new Function(
    "window",
    "parent",
    "MessageChannel",
    "namespace",
    "token",
    "document",
    "ResizeObserver",
    `${readRuntimeReference("bridge-runtime")}
return window.rivto;`,
  );
  const api: WidgetApi = start(
    window,
    parent,
    function () {
      return { port1, port2 };
    },
    namespace,
    token,
    document,
    undefined,
  );

  /**
   * Delivers a host message to the widget port with its protocol envelope.
   *
   * @param message - Host message body.
   * @param envelope - Overrides used to simulate a message from another document or namespace.
   * @returns The widget's message listeners have run.
   */
  const deliver = (message: HtmlHostMessage, envelope = { namespace, token }): void => {
    port1.dispatchEvent(new MessageEvent("message", { data: { ...envelope, ...message } }));
  };
  return { api, window, parent, port1, port2, deliver };
}

test("connects once and resolves ready with the first matching node snapshot", async () => {
  const { api, parent, port1, port2, deliver } = startReferenceBridge();
  expect(port1.start).toHaveBeenCalledTimes(1);
  expect(parent.postMessage.mock.calls).toEqual([
    [{ namespace, token, kind: "ready" }, "*", [port2]],
  ]);
  const waiting = api.ready();
  const message = { kind: "node", node: initialNode } as const;
  deliver(message, { namespace, token: "another-document" });
  deliver(message, { namespace: "another-namespace", token });
  expect([api.node, api.props, api.context]).toEqual([null, null, null]);

  deliver(message);
  await expect(waiting).resolves.toEqual(initialNode);
  await expect(api.ready()).resolves.toEqual(initialNode);
  expect(api.props).toEqual(initialNode.props);
  expect(api.context).toEqual(initialNode.context);
});

test("notifies context listeners separately and releases both subscriptions", () => {
  const { api, deliver } = startReferenceBridge();
  const onNode = import.meta.jest.fn();
  const onContext = import.meta.jest.fn();
  const unsubscribeNode = api.subscribe(onNode);
  const unsubscribeContext = api.subscribeContext(onContext);
  deliver({ kind: "node", node: initialNode });
  expect(onNode.mock.calls).toEqual([[initialNode]]);
  expect(onContext).not.toHaveBeenCalled();

  const selected = { ...initialNode.context, selected: true };
  deliver({ kind: "context", context: selected });
  deliver({ kind: "context", context: { ...selected } });
  expect(onNode).toHaveBeenCalledTimes(1);
  expect(onContext.mock.calls).toEqual([[selected]]);
  expect(api.context).toEqual(selected);

  unsubscribeNode();
  unsubscribeContext();
  const updated = { ...initialNode, props: { count: 1 } };
  deliver({ kind: "node", node: updated });
  expect(api.node).toEqual(updated);
  expect(onNode).toHaveBeenCalledTimes(1);
  expect(onContext).toHaveBeenCalledTimes(1);
});

test("sends all four write commands through the transferred connection", () => {
  const { api, port1, parent } = startReferenceBridge();
  api.setProp("count", 1);
  api.setProps({ count: 2, label: "Counter" });
  api.setListProps({ checked: true });
  api.setContent("<p>Updated</p>");
  expect(port1.postMessage.mock.calls).toEqual([
    [{ namespace, token, kind: "set-prop", key: "count", value: 1 }],
    [{ namespace, token, kind: "set-props", props: { count: 2, label: "Counter" } }],
    [{ namespace, token, kind: "set-list-props", listProps: { checked: true } }],
    [{ namespace, token, kind: "set-content", content: "<p>Updated</p>" }],
  ]);
  expect(parent.postMessage).toHaveBeenCalledTimes(1);
});

test("reports the document height and closes its port when the page hides", () => {
  const { window, port1 } = startReferenceBridge();
  window.dispatchEvent(new Event("load"));
  expect(port1.postMessage.mock.calls).toEqual([
    [{ namespace, token, kind: "resize", height: 43 }],
  ]);
  expect(port1.close).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("pagehide"));
  expect(port1.close).toHaveBeenCalledTimes(1);
});

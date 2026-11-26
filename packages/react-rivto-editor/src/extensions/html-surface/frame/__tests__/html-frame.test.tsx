/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HtmlFrame } from "../html-frame";
import { HTML_IFRAME_MESSAGE_NAMESPACE } from "../../constants";
import { DEFAULT_HTML_SURFACE_LIMITS } from "../../options";

test("only the authenticated document port receives snapshots, permission decisions and updates", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const node = {
    kind: "block" as const,
    id: "one",
    type: "html",
    content: "",
    props: {},
    childIds: [],
    pluginData: {},
    listProps: {},
  };
  const context = { selected: false, mode: "block" as const, preview: false };
  let denials = 0;
  let reads = 0;
  const blocks = {
    getRootIds: () => {
      reads++;
      return [];
    },
    getParentId: () => null,
    getChildIds: () => [],
    getBlockNode: () => undefined,
    updateBlock: () => {
      throw new Error("Unexpected update");
    },
  };
  const access = {
    enabled: false,
    isAuthorized: () => false,
    onDenied: () => {
      denials++;
    },
    panelBlocks: blocks,
    editorBlocks: blocks,
  };
  const render = (label: string) =>
    act(() =>
      root.render(
        <HtmlFrame
          frameName="One"
          fit="auto"
          source="<p>One</p>"
          node={{ ...node, props: { label } }}
          context={context}
          interactive
          onCommand={() => {}}
          unsafeAccess={access}
          limits={DEFAULT_HTML_SURFACE_LIMITS}
        />,
      ),
    );
  const messages: unknown[] = [];
  let closed = false;
  const port = {
    postMessage: (data: unknown) => {
      messages.push(data);
    },
    close: () => {
      closed = true;
    },
    onmessage: null as ((event: { data: unknown }) => void) | null,
  };
  try {
    render("original");
    const iframe = host.querySelector("iframe")!;
    let windowPosts = 0;
    iframe.contentWindow!.postMessage = () => {
      windowPosts++;
    };
    const token = JSON.parse(/var token = ("[^"]+")/.exec(iframe.srcdoc)![1]!);
    const data = { namespace: HTML_IFRAME_MESSAGE_NAMESPACE, kind: "ready", token };
    window.dispatchEvent(
      Object.assign(new Event("message"), { data, source: iframe.contentWindow, ports: [port] }),
    );
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        kind: "node",
        node: expect.objectContaining({ props: { label: "original" } }),
      }),
    );
    let selectionEvents = 0;
    iframe.addEventListener("rivto-iframe-text-selection", () => {
      selectionEvents++;
    });
    port.onmessage!({ data: { selectionKey: token, phase: "move", x: 2, y: 120 } });
    expect(selectionEvents).toBe(0);
    port.onmessage!({
      data: {
        ...data,
        kind: "unsafe-request",
        id: 1,
        target: "panel",
        method: "getRootIds",
        args: [],
      },
    });
    expect(denials).toBe(1);
    expect(reads).toBe(0);
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({ kind: "unsafe-result", error: "Editor access is disabled" }),
    );
    iframe.dispatchEvent(new Event("load"));
    render("updated");
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        kind: "node",
        node: expect.objectContaining({ props: { label: "updated" } }),
      }),
    );
    expect(windowPosts).toBe(0);
  } finally {
    act(() => root.unmount());
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
  expect(closed).toBe(true);
});

test("an auto-sized frame grows with its document up to the configured maxBlockHeight", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const port = {
    postMessage: () => {},
    close: () => {},
    onmessage: null as ((event: { data: unknown }) => void) | null,
  };
  try {
    act(() =>
      root.render(
        <HtmlFrame
          frameName="Tall"
          fit="auto"
          source="<p>Tall</p>"
          node={{
            kind: "block",
            id: "tall",
            type: "html",
            content: "",
            props: {},
            listProps: {},
            pluginData: {},
            childIds: [],
          }}
          context={{ mode: "block", selected: false, preview: false }}
          interactive
          limits={{ ...DEFAULT_HTML_SURFACE_LIMITS, maxBlockHeight: 100 }}
          onCommand={() => {}}
        />,
      ),
    );
    const iframe = host.querySelector("iframe")!;
    const token = JSON.parse(/var token = ("[^"]+")/.exec(iframe.srcdoc)![1]!);
    const envelope = { namespace: HTML_IFRAME_MESSAGE_NAMESPACE, token };
    window.dispatchEvent(
      Object.assign(new Event("message"), {
        data: { ...envelope, kind: "ready" },
        source: iframe.contentWindow,
        ports: [port],
      }),
    );
    act(() => port.onmessage!({ data: { ...envelope, kind: "resize", height: 60 } }));
    expect(iframe.style.height).toBe("60px");
    act(() => port.onmessage!({ data: { ...envelope, kind: "resize", height: 500 } }));
    expect(iframe.style.height).toBe("100px");
  } finally {
    act(() => root.unmount());
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

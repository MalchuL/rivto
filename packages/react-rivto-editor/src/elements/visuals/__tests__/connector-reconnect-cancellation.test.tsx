/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { ElementRenderProps } from "../../../managers/elements/types";
import {
  ConnectorEndpoints,
  ConnectorInteractionContext,
  useConnectorPreview,
} from "../connector-endpoints";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("clears a reconnect preview on pointer cancellation without committing it", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const updateProperties = jestApi.fn();
  const onReconnectHover = jestApi.fn();
  const endpoint = { anchor: { x: 0.5, y: 0.5 }, position: { x: 10, y: 20 } };
  const container = document.createElement("div");
  document.body.append(container);
  const inputRoot = new BrowserInputRoot(container);
  const props = {
    element: {
      id: "connector",
      frame: { x: 0, y: 0 },
      props: { source: endpoint, target: endpoint },
    },
    operations: { updateProperties },
    selected: true,
  } as unknown as ElementRenderProps;
  const interaction = { inputRoot, resolveEndpoint: () => endpoint, onReconnectHover };
  const root = createRoot(container);

  /**
   * Renders the connector with its local preview and interaction services.
   *
   * @returns Selected endpoint buttons for the fixture.
   */
  function Connector() {
    const preview = useConnectorPreview(props);
    return <ConnectorEndpoints {...props} preview={preview} />;
  }

  try {
    act(() =>
      root.render(
        <ConnectorInteractionContext.Provider value={interaction}>
          <Connector />
        </ConnectorInteractionContext.Provider>,
      ),
    );
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Reconnect target"]')!;
    button.setPointerCapture = jestApi.fn();
    button.hasPointerCapture = jestApi.fn(() => false);
    act(() => button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 17 })));
    expect(onReconnectHover).toHaveBeenLastCalledWith({ x: 17, y: 0 });
    act(() => button.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true })));
    expect(onReconnectHover).toHaveBeenLastCalledWith(null);
    act(() => button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    expect(updateProperties).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    inputRoot.detach();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

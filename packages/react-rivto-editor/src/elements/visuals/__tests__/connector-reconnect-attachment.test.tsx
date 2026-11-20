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
import type { ConnectorInteraction } from "../types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not commit a reconnect through a replacement attachment", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const updateProperties = jestApi.fn();
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
  let attached = true;
  const original: ConnectorInteraction = {
    inputRoot,
    resolveEndpoint: () => (attached ? endpoint : undefined),
    onReconnectHover: jestApi.fn(),
  };
  const replacement: ConnectorInteraction = {
    inputRoot: undefined,
    resolveEndpoint: jestApi.fn(() => endpoint),
    onReconnectHover: jestApi.fn(),
  };
  const root = createRoot(container);
  /**
   * Renders a connector with its local preview state.
   *
   * @returns Selected endpoint controls bound to the current interaction.
   */
  function Connector() {
    const preview = useConnectorPreview(props);
    return <ConnectorEndpoints {...props} preview={preview} />;
  }
  /**
   * Publishes a particular canvas attachment to the connector.
   *
   * @param interaction - Attachment-specific conversion and feedback.
   * @returns The fixture renders with that interaction.
   */
  function render(interaction: ConnectorInteraction) {
    act(() =>
      root.render(
        <ConnectorInteractionContext.Provider value={interaction}>
          <Connector />
        </ConnectorInteractionContext.Provider>,
      ),
    );
  }
  try {
    render(original);
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Reconnect target"]')!;
    button.setPointerCapture = jestApi.fn();
    button.hasPointerCapture = jestApi.fn(() => true);
    button.releasePointerCapture = jestApi.fn();
    act(() => button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    attached = false;
    inputRoot.detach();
    const replacementRoot = new BrowserInputRoot(container);
    render({ ...replacement, inputRoot: replacementRoot });
    expect(button.releasePointerCapture).toHaveBeenCalledTimes(1);
    act(() => button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    expect(updateProperties).not.toHaveBeenCalled();
    expect(replacement.resolveEndpoint).not.toHaveBeenCalled();
    expect(original.onReconnectHover).toHaveBeenLastCalledWith(null);
    replacementRoot.detach();
  } finally {
    act(() => root.unmount());
    inputRoot.detach();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

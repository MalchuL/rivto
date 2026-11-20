/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useConnectorEndpointInput } from "../use-connector-endpoint-input";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("binds both mounted endpoint identities and releases them on deselection", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const inputRoot = new BrowserInputRoot(container);
  const view = createRoot(container);
  const input = jestApi.fn();
  const detach = jestApi.fn();
  /**
   * Mounts both reconnect controls while selected.
   *
   * @param props - Selection state used to mount the controls.
   * @param props.selected - Whether the endpoint controls are present.
   * @returns Endpoint buttons bound to the current Root.
   */
  function Endpoints({ selected }: { readonly selected: boolean }) {
    const refs = useConnectorEndpointInput(inputRoot, selected, input, detach);
    return selected ? (
      <>
        <button ref={refs.source} />
        <button ref={refs.target} />
      </>
    ) : null;
  }
  try {
    act(() => view.render(<Endpoints selected />));
    const buttons = container.querySelectorAll("button");
    act(() => buttons[0]!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    act(() => buttons[1]!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(input.mock.calls.map(([key]) => key)).toEqual(["source", "target"]);
    act(() => view.render(<Endpoints selected={false} />));
    expect(detach).toHaveBeenCalledTimes(1);
    act(() => buttons[0]!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(input).toHaveBeenCalledTimes(2);
  } finally {
    act(() => view.unmount());
    inputRoot.detach();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

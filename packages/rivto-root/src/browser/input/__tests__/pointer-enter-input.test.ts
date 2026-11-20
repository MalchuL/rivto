import { BrowserInputListeners } from "../browser-input-listeners";

it("normalizes pointer entry on the attached occurrence", () => {
  const root = document.createElement("div");
  const listeners = new BrowserInputListeners();
  const receive = jest.fn();
  listeners.register({ type: "pointerenter", target: "root", capture: false }, receive);
  const detach = listeners.attach(root);
  root.dispatchEvent(new MouseEvent("pointerenter", { clientX: 12, clientY: 23 }));
  expect(receive).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "pointerenter",
      clientX: 12,
      clientY: 23,
    }),
  );
  expect(receive.mock.calls[0][0]).not.toHaveProperty("raw");
  detach();
});

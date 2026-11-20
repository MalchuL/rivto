import { BrowserInputListeners } from "../browser-input-listeners";

it("copies the attached document's current visibility without exposing the document", () => {
  const listeners = new BrowserInputListeners();
  const root = document.createElement("div");
  const received = jest.fn();
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(true);
  listeners.register({ type: "visibilitychange", target: "document", capture: false }, received);
  const detach = listeners.attach(root);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(received).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  expect(received.mock.calls[0]![0]).not.toHaveProperty("document");
  detach();
  hidden.mockRestore();
});

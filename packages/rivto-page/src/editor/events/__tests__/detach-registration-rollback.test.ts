import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorEvents } from "../block-editor-events";

it("preserves an existing detach listener when its duplicate registration fails", () => {
  const failure = new Error("cleanup ownership failed");
  let attempts = 0;
  const events = new BlockEditorEvents({
    assertActive: () => {},
    registerCleanup: (release) => {
      attempts += 1;
      if (attempts === 2) {
        throw failure;
      }
      return release;
    },
  });
  const listener = jest.fn();
  const stop = events.onDetach(listener);
  expect(() => events.onDetach(listener)).toThrow(failure);
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  try {
    const detach = events.attach(root);
    detach();
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    root.detach();
    element.remove();
  }
});

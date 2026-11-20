import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorEvents } from "../block-editor-events";

it("retains the replacement group when the old observer is replaced during registration", () => {
  const dispatcher = new BlockEditorEvents({
    assertActive: () => {},
    registerCleanup: (release) => release,
  });
  const firstRoot = new BrowserInputRoot(document.createElement("div"));
  const secondRoot = new BrowserInputRoot(document.createElement("div"));
  const staleRelease = jest.fn();
  const currentRelease = jest.fn();
  const firstObserver = { observe: jest.fn(), dispose: jest.fn() };
  const secondObserver = { observe: jest.fn(() => currentRelease), dispose: jest.fn() };
  jest.spyOn(firstRoot, "createInputObserver").mockReturnValue(firstObserver);
  jest.spyOn(secondRoot, "createInputObserver").mockReturnValue(secondObserver);
  const detachFirst = dispatcher.attach(firstRoot);
  let detachSecond: (() => void) | undefined;
  firstObserver.observe.mockImplementation(() => {
    detachFirst();
    detachSecond = dispatcher.attach(secondRoot);
    return staleRelease;
  });
  try {
    const release = dispatcher.register("click", { type: "click", priority: 0 }, () => "continue");
    expect(firstObserver.dispose).toHaveBeenCalledTimes(1);
    expect(secondObserver.observe).toHaveBeenCalledTimes(1);
    expect(staleRelease).toHaveBeenCalledTimes(1);
    expect(currentRelease).not.toHaveBeenCalled();
    detachFirst();
    release();
    expect(currentRelease).toHaveBeenCalledTimes(1);
  } finally {
    detachSecond?.();
    firstRoot.detach();
    secondRoot.detach();
  }
});

import { BrowserInputRoot } from "../../input/browser-input-root";
import { inputElementIdentity } from "../../input/input-element-identity";

it.each(["detach", "disconnect", "reparent", "adopt"] as const)(
  "stops document offset delivery when the region becomes unavailable: %s",
  (change) => {
    const element = document.createElement("div");
    const host = document.createElement("div");
    element.append(host);
    document.body.append(element);
    const root = new BrowserInputRoot(element);
    const callback = jest.fn();
    const region = root.captureRegionByIdentity(inputElementIdentity(host))!;
    const dispose = region.observeDocumentOffsetAndFollowEnd(callback);
    try {
      expect(callback).toHaveBeenCalledTimes(1);
      if (change === "detach") {
        root.detach();
      } else if (change === "disconnect") {
        element.remove();
      } else if (change === "reparent") {
        document.body.append(host);
      } else {
        document.implementation.createHTMLDocument("other").body.append(element);
      }
      window.dispatchEvent(new Event("resize"));
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
      root.detach();
      host.remove();
      element.remove();
    }
  },
);

it("does not install observers when initial delivery detaches the occurrence", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
  const add = jest.spyOn(window, "addEventListener");
  try {
    const dispose = region.observeDocumentOffsetAndFollowEnd(() => root.detach());
    expect(add).not.toHaveBeenCalled();
    dispose();
  } finally {
    add.mockRestore();
    root.detach();
    element.remove();
  }
});

it("does not follow the document end after its Root detaches with a frame pending", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
  const frame = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  const dispose = region.observeDocumentOffsetAndFollowEnd(jest.fn());
  try {
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(frame).toHaveBeenCalledTimes(1);
    root.detach();
    frame.mock.calls[0]![0](0);
    expect(scroll).not.toHaveBeenCalled();
  } finally {
    dispose();
    root.detach();
    frame.mockRestore();
    cancel.mockRestore();
    scroll.mockRestore();
    element.remove();
  }
});

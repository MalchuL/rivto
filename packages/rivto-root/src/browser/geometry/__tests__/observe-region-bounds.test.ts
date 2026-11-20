import { BrowserInputRoot } from "../../input/browser-input-root";
import { inputElementIdentity } from "../../input/input-element-identity";

it("observes initial bounds, ancestor scrolling, and window resizing until detached", () => {
  const root = document.createElement("div");
  const regionElement = document.createElement("div");
  root.append(regionElement);
  const occurrence = new BrowserInputRoot(root);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(regionElement))!;
  const measure = jest.spyOn(regionElement, "getBoundingClientRect");
  const observer = jest.fn();
  const release = region.observeBounds(observer);
  try {
    expect(observer).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(observer).toHaveBeenCalledTimes(3);
    occurrence.detach();
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(observer).toHaveBeenCalledTimes(3);
    release();
    release();
    measure.mockClear();
    window.dispatchEvent(new Event("scroll"));
    expect(measure).not.toHaveBeenCalled();
  } finally {
    release();
    measure.mockRestore();
    occurrence.detach();
  }
});

it("removes an earlier listener if later observation setup fails", () => {
  const root = document.createElement("div");
  const occurrence = new BrowserInputRoot(root);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(root))!;
  const originalAdd = window.addEventListener.bind(window);
  const add = jest
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "resize") {
        throw new Error("resize setup failed");
      }
      originalAdd(type, listener, options);
    });
  const remove = jest.spyOn(window, "removeEventListener");
  try {
    expect(() => region.observeBounds(() => {})).toThrow("resize setup failed");
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
  } finally {
    add.mockRestore();
    remove.mockRestore();
    occurrence.detach();
  }
});

it("does not publish when ownership checking releases the observation", () => {
  const root = document.createElement("div");
  const occurrence = new BrowserInputRoot(root);
  let releaseDuringCheck = false;
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(root), () => {
    if (releaseDuringCheck) {
      release();
    }
    return true;
  })!;
  const observer = jest.fn();
  const release = region.observeBounds(observer);
  try {
    expect(observer).toHaveBeenCalledTimes(1);
    releaseDuringCheck = true;
    window.dispatchEvent(new Event("scroll"));
    expect(observer).toHaveBeenCalledTimes(1);
  } finally {
    release();
    occurrence.detach();
  }
});

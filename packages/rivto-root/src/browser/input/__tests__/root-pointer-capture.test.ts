import { BrowserInputListeners } from "../browser-input-listeners";

it("releases the originating capture without releasing a newer remount capture", () => {
  const element = document.createElement("div");
  element.setPointerCapture = jest.fn();
  element.hasPointerCapture = jest.fn(() => true);
  element.releasePointerCapture = jest.fn();
  const listeners = new BrowserInputListeners();
  const releases: Array<() => void> = [];
  const inputs: Array<() => (() => void) | undefined> = [];
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    inputs.push(event.captureRootPointer);
    const release = event.captureRootPointer();
    if (release) {
      releases.push(release);
    }
  });
  const dispatch = () => {
    const event = new Event("pointerdown");
    Object.defineProperty(event, "pointerId", { value: 7 });
    element.dispatchEvent(event);
  };
  const detachFirst = listeners.attach(element);
  dispatch();
  detachFirst();
  expect(inputs[0]()).toBeUndefined();
  const detachSecond = listeners.attach(element);
  dispatch();
  releases[0]();
  expect(element.releasePointerCapture).not.toHaveBeenCalled();
  detachSecond();
  releases[1]();
  releases[1]();
  expect(element.setPointerCapture).toHaveBeenCalledTimes(2);
  expect(element.releasePointerCapture).toHaveBeenCalledTimes(1);
  expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
});

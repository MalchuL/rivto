import type { PointerInput } from "../../../events/types";
import { BrowserInputListeners } from "../../input/browser-input-listeners";

it("stops edge scrolling when either the borrowed occurrence or listener detaches", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const listeners = new BrowserInputListeners();
  let input: PointerInput<"pointerdown"> | undefined;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    input = event;
  });
  const frames: FrameRequestCallback[] = [];
  const frame = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const hit = jest.fn(() => root);
  const previousHit = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  const detach = listeners.attach(root);
  try {
    root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    let active = true;
    const session = input!.createAutoScroll(jest.fn(), () => active);
    session.update({ x: 5, y: 5 });
    active = false;
    frames.shift()!(0);
    expect(hit).not.toHaveBeenCalled();
    active = true;
    session.update({ x: 5, y: 5 });
    detach();
    frames.shift()!(0);
    expect(hit).not.toHaveBeenCalled();
    session.stop();
  } finally {
    detach();
    frame.mockRestore();
    if (previousHit) {
      Object.defineProperty(document, "elementFromPoint", previousHit);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    root.remove();
  }
});

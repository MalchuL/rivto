import type { PointerAutoScroll } from "../../../events/types";
import { BrowserInputListeners } from "../../input/browser-input-listeners";

it("uses an uncaptured normalized target to skip idle scroll frames", () => {
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.append(target);
  document.body.append(root);
  const listeners = new BrowserInputListeners();
  let scroll: PointerAutoScroll | undefined;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    scroll = event.createAutoScroll(
      () => {},
      () => true,
    );
  });
  listeners.register({ type: "pointermove", target: "root", capture: false }, (event) => {
    scroll!.update({ x: 300, y: 300 }, event.target ?? undefined);
  });
  const frame = jest.spyOn(window, "requestAnimationFrame");
  const detach = listeners.attach(root);
  try {
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(frame).not.toHaveBeenCalled();
  } finally {
    scroll?.stop();
    detach();
    frame.mockRestore();
    root.remove();
  }
});

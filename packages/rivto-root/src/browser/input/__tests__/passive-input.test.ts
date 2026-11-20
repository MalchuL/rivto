import { BrowserInputListeners } from "../browser-input-listeners";

it("preserves passive and non-passive default prevention across remounts", () => {
  const root = document.createElement("div");
  const listeners = new BrowserInputListeners();
  const delivered: string[] = [];
  listeners.register({ type: "wheel", target: "root", capture: false, passive: true }, (input) => {
    input.preventDefault();
    delivered.push("passive");
  });
  const detach = listeners.attach(root);
  const passive = new WheelEvent("wheel", { bubbles: true, cancelable: true });
  root.dispatchEvent(passive);
  expect(passive.defaultPrevented).toBe(false);
  detach();
  listeners.register({ type: "wheel", target: "root", capture: false }, (input) => {
    input.preventDefault();
    delivered.push("active");
  });
  const detachAgain = listeners.attach(root);
  try {
    const active = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    root.dispatchEvent(active);
    expect(active.defaultPrevented).toBe(true);
    expect(delivered).toEqual(["passive", "passive", "active"]);
  } finally {
    detachAgain();
  }
});

it("shares a dispatch identity across passive and active listener groups", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const listeners = new BrowserInputListeners({ trackDispatch: true });
  const identities: Array<object | undefined> = [];
  listeners.register({ type: "wheel", target: "root", capture: false, passive: true }, (_, id) => {
    identities.push(id);
  });
  listeners.register({ type: "wheel", target: "root", capture: false }, (_, id) => {
    identities.push(id);
  });
  const detach = listeners.attach(root);
  try {
    root.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }));
    expect(identities).toHaveLength(2);
    expect(identities[0]).toBeDefined();
    expect(identities[0]).toBe(identities[1]);
  } finally {
    detach();
    root.remove();
  }
});

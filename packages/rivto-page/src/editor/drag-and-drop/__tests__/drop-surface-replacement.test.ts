import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { DropSurfaceRegistry } from "../drop-surface-registry";

it("does not route an old root after the same receiver is registered on another root", () => {
  const registry = new DropSurfaceRegistry();
  const first = document.createElement("div");
  const second = document.createElement("div");
  const receiver = {};
  document.body.append(first, second);
  const releaseFirst = registry.register(new BrowserInputRoot(first), receiver);
  const releaseSecond = registry.register(new BrowserInputRoot(second), receiver);
  try {
    expect(registry.resolve(captureTestInputHit(first))).toBeNull();
    expect(registry.resolve(captureTestInputHit(second))).toBe(receiver);
    releaseFirst();
    expect(registry.resolve(captureTestInputHit(second))).toBe(receiver);
  } finally {
    releaseFirst();
    releaseSecond();
    first.remove();
    second.remove();
  }
});

import { retainPointerDispatchBoundary } from "../pointer-dispatch-boundary";

it("keeps a replacement boundary when an older installation releases", () => {
  const target = document.createElement("div");
  const originalAdd = target.addEventListener.bind(target);
  let replacement: ReturnType<typeof retainPointerDispatchBoundary> | undefined;
  let replacing = true;
  const add = jest.spyOn(target, "addEventListener").mockImplementation((type, listener, options) => {
    originalAdd(type, listener, options);
    if (replacing) {
      replacing = false;
      replacement = retainPointerDispatchBoundary(target, "pointermove");
    }
  });
  const first = retainPointerDispatchBoundary(target, "pointermove");
  try {
    first.release();
    const later = retainPointerDispatchBoundary(target, "pointermove");
    try {
      expect(later.listener).toBe(replacement?.listener);
      expect(add).toHaveBeenCalledTimes(2);
    } finally {
      later.release();
    }
  } finally {
    first.release();
    replacement?.release();
    add.mockRestore();
  }
});

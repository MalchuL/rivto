import { Canvas } from "../canvas";

test("rolls back a new pin when notifying visible subscribers fails", () => {
  const canvas = new Canvas({ overscan: 0 });
  canvas.setViewport(100, 100);
  canvas.setElements([
    { id: "far", frame: { x: 1000, y: 0, width: 100, height: 100 }, rotation: 0, zIndex: 0 },
    { id: "other", frame: { x: 1200, y: 0, width: 100, height: 100 }, rotation: 0, zIndex: 0 },
  ]);
  const releaseOther = canvas.pin(["other"]);
  let fail = true;
  const unsubscribe = canvas.visible.subscribe(() => {
    if (fail) {
      fail = false;
      throw new Error("visibility notification failed");
    }
  });
  try {
    expect(() => canvas.pin(["far"])).toThrow("visibility notification failed");
    expect(canvas.visible.get()).not.toContain("far");
    expect(canvas.visible.get()).toContain("other");
    const release = canvas.pin(["far"]);
    expect(canvas.visible.get()).toContain("far");
    release();
    expect(canvas.visible.get()).not.toContain("far");
  } finally {
    unsubscribe();
    releaseOther();
    canvas.dispose();
  }
});

test("retains both failures when a pin rollback notification also fails", () => {
  const canvas = new Canvas({ overscan: 0 });
  canvas.setViewport(100, 100);
  canvas.setElements([
    { id: "far", frame: { x: 1000, y: 0, width: 100, height: 100 }, rotation: 0, zIndex: 0 },
  ]);
  const errors = [new Error("pin notification"), new Error("rollback notification")];
  let calls = 0;
  const unsubscribe = canvas.visible.subscribe(() => {
    throw errors[calls++];
  });
  try {
    let failure: unknown;
    try {
      canvas.pin(["far"]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (failure instanceof AggregateError) {
      expect(failure.errors).toEqual(errors);
    }
    expect(calls).toBe(2);
    expect(canvas.visible.get()).not.toContain("far");
  } finally {
    unsubscribe();
    canvas.dispose();
  }
});

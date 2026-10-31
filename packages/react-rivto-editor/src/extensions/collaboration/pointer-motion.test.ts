import { createPointerMotion } from "./pointer-motion";

/**
 * Provides a deterministic animation clock and media preference for the real controller.
 *
 * @param smoothingMs - EMA time constant under test; defaults to the extension default.
 * @returns Pointer controller, painted coordinates, and explicit frame/preference controls.
 */
function fixture(smoothingMs = 20) {
  let time = 0;
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const listeners = new Set<() => void>();
  const preference = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  const element = {
    style: { transform: "" },
    ownerDocument: {
      defaultView: {
        matchMedia: () => preference,
        performance: { now: () => time },
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          frames.set(++sequence, callback);
          return sequence;
        },
        cancelAnimationFrame: (id: number) => frames.delete(id),
      },
    },
  };
  return {
    motion: createPointerMotion(element as unknown as HTMLElement, smoothingMs),
    point: () => element.style.transform.match(/-?[\d.]+/g)!.map(Number),
    pending: () => frames.size,
    listeners: () => listeners.size,
    advance: (elapsed: number) => {
      time += elapsed;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
    reduce: () => {
      preference.matches = true;
      listeners.forEach((listener) => listener());
    },
  };
}

test("retargets the interpolated point without snapping, including reversals and rest", () => {
  const f = fixture();
  f.motion.update(0, 0);
  f.motion.update(120, 60);
  expect(f.point()).toEqual([0, 0]);
  f.advance(16);
  const first = f.point();
  expect(first[0]).toBeGreaterThan(0);
  expect(first[0]).toBeLessThan(120);
  f.motion.update(-40, -20);
  expect(f.point()).toEqual(first);
  expect(f.pending()).toBe(1);
  f.advance(16);
  expect(f.point()[0]).toBeLessThan(first[0]!);
  for (let frame = 0; frame < 30; frame++) {
    f.advance(16);
  }
  expect(f.pending()).toBe(0);
  expect(f.point()[0]).not.toBe(-40);
  expect(Math.abs(f.point()[0]! + 40)).toBeLessThan(0.25);
  const stopped = f.point();
  f.advance(1000);
  expect(f.point()).toEqual(stopped);
  f.motion.dispose();
});

test("uses elapsed time rather than the display refresh rate", () => {
  const slow = fixture();
  const fast = fixture();
  for (const f of [slow, fast]) {
    f.motion.update(0, 0);
    f.motion.update(120, 60);
  }
  for (let frame = 0; frame < 6; frame++) {
    slow.advance(100 / 6);
  }
  for (let frame = 0; frame < 12; frame++) {
    fast.advance(100 / 12);
  }
  expect(slow.point()[0]).toBeCloseTo(fast.point()[0]!, 8);
  slow.motion.dispose();
  fast.motion.dispose();
});

test("reduced motion jumps immediately and disposal releases pending animation", () => {
  const f = fixture();
  f.motion.update(0, 0);
  f.motion.update(120, 60);
  f.reduce();
  expect(f.point()).toEqual([120, 60]);
  expect(f.pending()).toBe(0);
  f.motion.update(40, 20);
  expect(f.point()).toEqual([40, 20]);
  f.motion.dispose();
  expect(f.listeners()).toBe(0);
  const moving = fixture();
  moving.motion.update(0, 0);
  moving.motion.update(120, 60);
  moving.motion.dispose();
  moving.advance(100);
  expect(moving.point()).toEqual([0, 0]);
  expect(moving.pending()).toBe(0);
});

test("zero smoothing places every target immediately without scheduling frames", () => {
  const f = fixture(0);
  f.motion.update(0, 0);
  f.motion.update(120, -60);
  expect(f.point()).toEqual([120, -60]);
  expect(f.pending()).toBe(0);
  f.motion.update(-10, 30);
  expect(f.point()).toEqual([-10, 30]);
  expect(f.pending()).toBe(0);
  f.motion.dispose();
});

test.each([10, 80, 250])("uses the configured %i ms exponential time constant", (smoothingMs) => {
  const f = fixture(smoothingMs);
  f.motion.update(0, 0);
  f.motion.update(100, 50);
  f.advance(smoothingMs);
  expect(f.point()[0]).toBeCloseTo(100 * (1 - Math.exp(-1)), 8);
  expect(f.point()[1]).toBeCloseTo(50 * (1 - Math.exp(-1)), 8);
  f.motion.dispose();
});

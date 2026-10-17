import { collaborationExtension } from "./extension";

const user = { id: "vlad", name: "Vlad", color: "#7c3aed" };

for (const option of ["pointerThrottleMs", "pointerSmoothingMs"] as const) {
  test.each([-1, NaN, Infinity, -Infinity])(`rejects invalid ${option}: %s`, (value) => {
    expect(() => collaborationExtension({ user, [option]: value })).toThrow();
  });
}

test("rejects pointer intervals that overflow browser timers", () => {
  expect(() => collaborationExtension({ user, pointerThrottleMs: 2_147_483_648 })).toThrow();
});

test("accepts omitted timing, zero timing and independent custom timing", () => {
  expect(() => collaborationExtension({ user })).not.toThrow();
  expect(() =>
    collaborationExtension({ user, pointerThrottleMs: 0, pointerSmoothingMs: 0 }),
  ).not.toThrow();
  expect(() =>
    collaborationExtension({ user, pointerThrottleMs: 100, pointerSmoothingMs: 80 }),
  ).not.toThrow();
});

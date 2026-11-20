import { HeldKeyBinding, HeldKeys } from "../held-keys";

it("clears modifiers and notifies other observers when a reset observer throws", () => {
  const held = new HeldKeys();
  const control = new HeldKeyBinding(["Control"]);
  held.reconcile({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false });
  const failure = new Error("held-state observer failed");
  const observed: boolean[] = [];
  held.subscribe(() => {
    throw failure;
  });
  held.subscribe(() => observed.push(control.matches(held)));
  let error: unknown;
  try {
    held.reset();
  } catch (caught) {
    error = caught;
  }
  expect(control.matches(held)).toBe(false);
  expect(observed.at(-1)).toBe(false);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors.flatMap((item: AggregateError) => item.errors)).toEqual([
    failure,
    failure,
  ]);
});

it("notifies every observer after modifier reconciliation even when one fails", () => {
  const held = new HeldKeys();
  const other = jest.fn();
  held.subscribe(() => {
    throw new Error("held-state observer failed");
  });
  held.subscribe(other);
  expect(() =>
    held.reconcile({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
  ).toThrow(AggregateError);
  expect(other).toHaveBeenCalledTimes(1);
  expect(new HeldKeyBinding(["Control"]).matches(held)).toBe(true);
});

it("retains key updates and notifies other observers when one fails", () => {
  const held = new HeldKeys();
  const other = jest.fn();
  held.subscribe(() => {
    throw new Error("held-state observer failed");
  });
  held.subscribe(other);
  expect(() =>
    held.update(
      {
        key: "a",
        code: "KeyA",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      },
      "keydown",
    ),
  ).toThrow(AggregateError);
  expect(other).toHaveBeenCalledTimes(1);
  expect(new HeldKeyBinding(["a"]).matches(held)).toBe(true);
});

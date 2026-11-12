import { Listeners } from "@chulane/rivto-utils";

test("a stale unsubscribe cannot remove a replacement event channel", () => {
  const listeners = new Listeners<{ changed: void }>();
  const calls: string[] = [];
  const first = () => calls.push("first");
  const second = () => calls.push("second");
  const unsubscribe = listeners.subscribe("changed", first);
  listeners.clear("changed");
  listeners.subscribe("changed", second);
  unsubscribe();
  unsubscribe();
  listeners.emit("changed");
  expect(calls).toEqual(["second"]);
});

test("duplicate subscriptions retain the existing set semantics", () => {
  const listeners = new Listeners<{ changed: void }>();
  let calls = 0;
  const callback = () => calls++;
  const first = listeners.subscribe("changed", callback);
  const second = listeners.subscribe("changed", callback);
  expect(listeners.listenerCount).toBe(1);
  first();
  second();
  listeners.emit("changed");
  expect(calls).toBe(0);
  expect(listeners.size).toBe(0);
});

test("a duplicate handle still removes the callback while its channel remains active", () => {
  const listeners = new Listeners<{ changed: void }>();
  const calls: string[] = [];
  const callback = () => calls.push("duplicate");
  listeners.subscribe("changed", () => calls.push("other"));
  const first = listeners.subscribe("changed", callback);
  const second = listeners.subscribe("changed", callback);
  first();
  listeners.subscribe("changed", callback);
  second();
  listeners.emit("changed");
  expect(calls).toEqual(["other"]);
});

test("clearing during delivery keeps the current listener snapshot", () => {
  const listeners = new Listeners<{ changed: void }>();
  const calls: string[] = [];
  const first = listeners.subscribe("changed", () => {
    calls.push("first");
    listeners.clear();
  });
  const second = listeners.subscribe("changed", () => calls.push("second"));
  listeners.emit("changed");
  first();
  second();
  listeners.emit("changed");
  expect(calls).toEqual(["first", "second"]);
});

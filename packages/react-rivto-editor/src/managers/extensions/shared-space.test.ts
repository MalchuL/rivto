import { SharedSpace } from "./shared-space";

/** Creates an idempotent lifecycle registration for the isolated space tests. */
function createSpace(): SharedSpace {
  return new SharedSpace((release) => {
    let active = true;
    return () => {
      if (active) {
        active = false;
        release();
      }
    };
  });
}

test("reservations retain shared identity and dispose on the last release", () => {
  const space = createSpace();
  expect(space.getSet("key")).toBeUndefined();
  const first = space.reserve("key", "set");
  const second = space.reserve("key", "set");
  const set = space.getSet<string>("key")!;
  expect(space.getSet("key")).toBe(set);
  expect(() => space.reserve("key", "map")).toThrow(/reserved/);
  first();
  first();
  expect(space.getSet("key")).toBe(set);
  second();
  expect(space.getSet("key")).toBeUndefined();
  expect(() => set.has("x")).toThrow(/disposed/);
  const replacement = space.reserve("key", "map");
  expect(space.getMap("key")).toBeDefined();
  replacement();
});

test("observes a key across reservation, mutation and final release", () => {
  const space = createSpace();
  const changes: number[] = [];
  const unsubscribe = space.subscribe("watched", () => changes.push(space.revision));
  const other = space.reserve("other", "value");
  const release = space.reserve("watched", "set");
  const set = space.getSet<string>("watched")!;
  set.add("one");
  set.add("one");
  set.delete("one");
  release();
  expect(changes).toHaveLength(3);
  unsubscribe();
  other();
  expect(changes).toHaveLength(3);
});

test("sets and maps count claims and notify only observable changes", () => {
  const space = createSpace();
  const releaseSet = space.reserve("set", "set");
  const set = space.getSet<string>("set")!;
  const events: number[] = [];
  set.subscribe(() => events.push(set.revision));
  set.add("x");
  set.add("x");
  set.delete("x");
  expect(set.has("x")).toBe(true);
  set.delete("x");
  expect(events).toEqual([1, 2]);
  const releaseMap = space.reserve("map", "map");
  const map = space.getMap<string, string>("map")!;
  map.set("x", "red");
  map.set("x", "blue");
  map.delete("x");
  expect(map.get("x")).toBe("blue");
  map.delete("x");
  expect(map.has("x")).toBe(false);
  releaseSet();
  releaseMap();
});

test("arrays, values and functions notify and reject use after disposal", () => {
  const space = createSpace();
  const releases = [
    space.reserve("array", "array"),
    space.reserve("value", "value"),
    space.reserve("function", "function"),
  ];
  const array = space.getArray<number>("array")!;
  const value = space.getValue<number>("value")!;
  const fn = space.getFunction<() => string>("function")!;
  let notifications = 0;
  array.subscribe(() => notifications++);
  array.splice(0, 0, 1, 2);
  expect(array.values()).toEqual([1, 2]);
  expect(notifications).toBe(1);
  value.set(1);
  expect(value.get()).toBe(1);
  fn.set(() => "first");
  fn.set(() => "second");
  expect(fn.get()?.()).toBe("second");
  releases.forEach((release) => release());
  expect(() => array.values()).toThrow(/disposed/);
  expect(() => value.get()).toThrow(/disposed/);
  expect(() => fn.get()).toThrow(/disposed/);
});

import { EventDispatcher } from "../event-dispatcher";

it("shares a snapshot only for phases with the same dispatch identity", () => {
  const dispatcher = new EventDispatcher<{ input: string }>();
  const seen: string[] = [];
  const remove = dispatcher.register({ id: "old", type: "input" }, () => {
    seen.push("old");
  });
  const identity = {};
  const first = dispatcher.begin(identity);
  remove();
  dispatcher.register({ id: "new", type: "input" }, () => {
    seen.push("new");
  });
  expect(dispatcher.begin(identity)).toBe(first);
  first.dispatch("input", "later phase");
  expect(seen).toEqual([]);
  dispatcher.begin({}).dispatch("input", "nested event");
  dispatcher.begin().dispatch("input", "unidentified event");
  expect(seen).toEqual(["new", "new"]);
});

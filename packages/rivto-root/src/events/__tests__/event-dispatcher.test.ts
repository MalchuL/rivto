import { EventDispatcher } from "../event-dispatcher";

interface Events {
  readonly ping: { readonly value: number };
  readonly message: { readonly text: string };
}

it("orders typed handlers, lets observers run after claims, and stops later handlers", () => {
  const events = new EventDispatcher<Events>();
  const seen: string[] = [];
  events.register({ id: "low", type: "ping", priority: 0 }, () => {
    seen.push("low");
  });
  events.register({ id: "claim", type: "ping", priority: 10 }, ({ value }) => {
    seen.push(`claim:${value}`);
    return "handled";
  });
  events.observe({ id: "observer", type: "ping", priority: 0 }, () => {
    seen.push("observer");
  });
  expect(events.dispatch("ping", { value: 7 })).toBe("handled");
  expect(seen).toEqual(["observer", "claim:7"]);
});

it("defers additions, skips removals, and protects replacement registrations from stale disposers", () => {
  const events = new EventDispatcher<Events>();
  const seen: string[] = [];
  const removeLater = events.register({ id: "later", type: "ping" }, () => {
    seen.push("old");
  });
  let installed = false;
  events.register({ id: "first", type: "ping", priority: 1 }, () => {
    removeLater();
    if (!installed) {
      installed = true;
      events.register({ id: "later", type: "ping" }, () => {
        seen.push("new");
      });
    }
  });
  events.dispatch("ping", { value: 1 });
  expect(seen).toEqual([]);
  removeLater();
  events.dispatch("ping", { value: 2 });
  expect(seen).toEqual(["new"]);
});

it("supports independent custom event types and rejects invalid identities and priorities", () => {
  const events = new EventDispatcher<Events>();
  const seen: string[] = [];
  const remove = events.register({ id: "message", type: "message" }, ({ text }) => {
    seen.push(text);
  });
  expect(() => events.register({ id: "message", type: "ping" }, () => {})).toThrow();
  expect(() => events.register({ id: "", type: "ping" }, () => {})).toThrow();
  expect(() => events.register({ id: "bad", type: "ping", priority: NaN }, () => {})).toThrow();
  expect(events.dispatch("message", { text: "hello" })).toBe("continue");
  remove();
  remove();
  events.dispatch("message", { text: "ignored" });
  expect(seen).toEqual(["hello"]);
});

it("retains one registration snapshot across event phases and still runs observers after a claim", () => {
  const events = new EventDispatcher<Events>();
  const seen: string[] = [];
  const remove = events.register({ id: "early", type: "message" }, () => {
    seen.push("early");
  });
  events.observe({ id: "observer", type: "message" }, () => {
    seen.push("observer");
  });
  const delivery = events.begin();
  remove();
  events.register({ id: "late", type: "message" }, () => {
    seen.push("late");
  });
  delivery.observe("message", { text: "first" });
  expect(delivery.dispatch("message", { text: "first" })).toBe("continue");
  expect(seen).toEqual(["observer"]);
  events.dispatch("message", { text: "next" });
  expect(seen).toEqual(["observer", "observer", "late"]);
});

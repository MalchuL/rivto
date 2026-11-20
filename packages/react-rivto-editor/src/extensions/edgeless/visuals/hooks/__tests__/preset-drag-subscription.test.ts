import { subscribePresetDrag } from "../preset-drag-subscription";
import type { PresetDragSubscriptions } from "../types";

it("rolls back earlier registrations when tool subscription fails", () => {
  const failure = new Error("tool subscription failed");
  const releases: string[] = [];
  const tools: PresetDragSubscriptions = {
    reactPanel: {
      keyboard: {
        register: () => () => {
          releases.push("keyboard");
        },
      },
      subscribeDeactivation: () => () => {
        releases.push("deactivation");
      },
    },
    subscribe: () => {
      throw failure;
    },
  };
  expect(() =>
    subscribePresetDrag(
      tools,
      () => false,
      () => false,
      () => {},
    ),
  ).toThrow(failure);
  expect(releases).toEqual(["keyboard", "deactivation"]);
});

it("attempts every cleanup and cancels even when a subscription fails", () => {
  const failure = new Error("keyboard cleanup failed");
  const releases: string[] = [];
  const tools: PresetDragSubscriptions = {
    reactPanel: {
      keyboard: {
        register: () => () => {
          throw failure;
        },
      },
      subscribeDeactivation: () => () => {
        releases.push("deactivation");
      },
    },
    subscribe: () => () => {
      releases.push("tools");
    },
  };
  const release = subscribePresetDrag(
    tools,
    () => {
      releases.push("cancel");
      return true;
    },
    () => false,
    () => {},
  );
  expect(release).toThrow(AggregateError);
  expect(releases).toEqual(["deactivation", "tools", "cancel"]);
  expect(release).not.toThrow();
});

import { subscribeToolGestureCancellation } from "../tool-gesture-cancellation";
import type { ToolGestureTools } from "../types";

it("releases the keyboard registration if deactivation setup fails", () => {
  const setup = new Error("deactivation setup failed");
  let releases = 0;
  const tools: ToolGestureTools = {
    reactPanel: {
      keyboard: {
        register: () => () => {
          releases += 1;
        },
      },
      subscribeDeactivation: () => {
        throw setup;
      },
    },
  };
  expect(() =>
    subscribeToolGestureCancellation(
      tools,
      () => false,
      () => false,
    ),
  ).toThrow(setup);
  expect(releases).toBe(1);
});

it("attempts both subscription cleanups when one fails", () => {
  const failure = new Error("keyboard cleanup failed");
  let deactivationReleased = false;
  const tools: ToolGestureTools = {
    reactPanel: {
      keyboard: {
        register: () => () => {
          throw failure;
        },
      },
      subscribeDeactivation: () => () => {
        deactivationReleased = true;
      },
    },
  };
  const release = subscribeToolGestureCancellation(
    tools,
    () => false,
    () => false,
  );
  expect(release).toThrow(AggregateError);
  expect(deactivationReleased).toBe(true);
});

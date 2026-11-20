import { HeldKeys } from "@chulane/rivto-root";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorEvents } from "../../events/block-editor-events";
import { BlockKeyboardTransport } from "../block-keyboard-transport";

/**
 * Creates real Page event registrations with injectable ownership failures.
 *
 * @param setupFailureAt - Registration number that rejects ownership, or zero.
 * @param cleanupFailureAt - Registration number whose cleanup throws, or zero.
 * @returns Transport, held state, ordered cleanup record, and injected failures.
 */
function createFixture(setupFailureAt: number, cleanupFailureAt: number) {
  let registrations = 0;
  const released: number[] = [];
  const setupFailure = new Error("keyboard registration failed");
  const cleanupFailure = new Error("keyboard cleanup failed");
  const owner = {
    assertActive: jest.fn(),
    registerCleanup: (release: () => void) => {
      const id = ++registrations;
      if (id === setupFailureAt) {
        throw setupFailure;
      }
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        released.push(id);
        release();
        if (id === cleanupFailureAt) {
          throw cleanupFailure;
        }
      };
    },
  };
  const events = new BlockEditorEvents(owner);
  const held = new HeldKeys();
  const transport = new BlockKeyboardTransport(events, held);
  return { events, transport, held, released, setupFailure, cleanupFailure };
}

it("rolls back all earlier routes when held-state registration fails", () => {
  const fixture = createFixture(9, 0);
  const reset = jest.spyOn(fixture.held, "reset");
  expect(() => fixture.transport.connect(() => false)).toThrow(fixture.setupFailure);
  expect(fixture.released).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  expect(reset).toHaveBeenCalledTimes(1);
  const disconnect = fixture.transport.connect(() => false);
  disconnect();
});

it("retains setup and rollback failures while releasing all earlier routes", () => {
  const fixture = createFixture(9, 8);
  try {
    fixture.transport.connect(() => false);
    throw new Error("Expected setup to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      fixture.setupFailure,
      fixture.cleanupFailure,
    ]);
  }
  expect(fixture.released).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
});

it("retains a held-state reset failure alongside setup and cleanup failures", () => {
  const fixture = createFixture(9, 8);
  const resetFailure = new Error("held-state reset failed");
  jest.spyOn(fixture.held, "reset").mockImplementation(() => {
    throw resetFailure;
  });
  try {
    fixture.transport.connect(() => false);
    throw new Error("Expected setup to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      fixture.setupFailure,
      fixture.cleanupFailure,
      resetFailure,
    ]);
  }
  expect(fixture.released).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
});

it("removes a detach observer when its cleanup ownership fails", () => {
  const fixture = createFixture(11, 0);
  const reset = jest.spyOn(fixture.held, "reset");
  expect(() => fixture.transport.connect(() => false)).toThrow(fixture.setupFailure);
  expect(fixture.released).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  try {
    const detach = fixture.events.attach(root);
    detach();
    expect(reset).toHaveBeenCalledTimes(1);
  } finally {
    root.detach();
    element.remove();
  }
});

it("disconnects every route and resets held state once when cleanup fails", () => {
  const fixture = createFixture(0, 8);
  const reset = jest.spyOn(fixture.held, "reset");
  const disconnect = fixture.transport.connect(() => false);
  expect(disconnect).toThrow(AggregateError);
  expect(fixture.released).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  expect(reset).toHaveBeenCalledTimes(1);
  expect(disconnect).not.toThrow();
  expect(reset).toHaveBeenCalledTimes(1);
});

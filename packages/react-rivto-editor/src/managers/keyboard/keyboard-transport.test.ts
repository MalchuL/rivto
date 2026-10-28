const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { ReactKeyboardTransport } from "./keyboard-transport";

it("releases earlier routes when a later registration fails", () => {
  const failure = new Error("third route failed");
  const first = jestApi.fn();
  const second = jestApi.fn();
  const register = jestApi
    .fn()
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second)
    .mockImplementationOnce(() => {
      throw failure;
    });
  const transport = new ReactKeyboardTransport({ register });
  expect(() => transport.connect(() => false)).toThrow(failure);
  expect(second).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
});

it("retains setup and rollback errors while attempting every earlier route", () => {
  const failure = new Error("third route failed");
  const cleanupFailure = new Error("second cleanup failed");
  const first = jestApi.fn();
  const second = jestApi.fn(() => {
    throw cleanupFailure;
  });
  const register = jestApi
    .fn()
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second)
    .mockImplementationOnce(() => {
      throw failure;
    });
  const transport = new ReactKeyboardTransport({ register });
  try {
    transport.connect(() => false);
    throw new Error("Expected setup to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toContain(failure);
    expect((error as AggregateError).errors).toContain(cleanupFailure);
  }
  expect(first).toHaveBeenCalledTimes(1);
});

it("disconnects every route in reverse order once even when one release throws", () => {
  const seen: number[] = [];
  const failure = new Error("release failed");
  let count = 0;
  const register = jestApi.fn(() => {
    const id = ++count;
    return () => {
      seen.push(id);
      if (id === 3) {
        throw failure;
      }
    };
  });
  const disconnect = new ReactKeyboardTransport({ register }).connect(() => false);
  expect(disconnect).toThrow(AggregateError);
  expect(seen).toEqual([4, 3, 2, 1]);
  expect(disconnect).not.toThrow();
  expect(seen).toEqual([4, 3, 2, 1]);
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DragHandle } from "./drag-handle";

let host: HTMLDivElement;
let root: Root;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

/**
 * Dispatches pointer input in jsdom without a native PointerEvent constructor.
 *
 * @param target - Handle or window receiving this pointer phase.
 * @param type - Pointer event name.
 * @param x - Viewport X coordinate in CSS pixels.
 * @param y - Viewport Y coordinate in CSS pixels, default 100.
 * @param pointerId - Pointer identity, default the active primary pointer.
 * @returns All synchronous pointer observers have received the event.
 */
function pointer(target: EventTarget, type: string, x: number, y = 100, pointerId = 1): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
  });
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
  act(() => {
    target.dispatchEvent(event);
  });
}

it("does not open after reaching 8px and returning, but permits the next click and keyboard activation", () => {
  const open = jest.fn();
  act(() =>
    root.render(
      <>
        <DragHandle onOpen={open} />
        <input type="checkbox" />
      </>,
    ),
  );
  const handle = host.querySelector("button")!;
  pointer(handle, "pointerdown", 100);
  pointer(window, "pointermove", 108);
  pointer(window, "pointermove", 100);
  pointer(window, "pointerup", 100);
  act(() => {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  expect(open).not.toHaveBeenCalled();
  host.querySelector("input")!.click();
  expect(host.querySelector("input")!.checked).toBe(true);
  act(() => {
    handle.click();
  });
  expect(open).toHaveBeenCalledTimes(1);
  pointer(handle, "pointerdown", 100);
  pointer(window, "pointerup", 100);
  act(() => {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  expect(open).toHaveBeenCalledTimes(2);
});

it.each([
  [undefined, 7, 0, true],
  [undefined, 8, 0, false],
  [undefined, 4, 4, true],
  [undefined, 6, 6, false],
  [16, 15, 0, true],
  [16, 16, 0, false],
  [64, 48, 0, true],
] as const)("uses threshold=%s for excursion (%s,%s), opens=%s", (threshold, dx, dy, opens) => {
  const open = jest.fn();
  act(() => root.render(<DragHandle onOpen={open} clickMovementThreshold={threshold} />));
  const handle = host.querySelector("button")!;
  pointer(handle, "pointerdown", 100);
  pointer(window, "pointermove", 100 + dx, 100 + dy);
  pointer(window, "pointermove", 100);
  pointer(window, "pointerup", 100);
  act(() => {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  expect(open).toHaveBeenCalledTimes(opens ? 1 : 0);
});

it("measures maximum excursion rather than accumulated travel and ignores unrelated pointers", () => {
  const open = jest.fn();
  act(() => root.render(<DragHandle onOpen={open} clickMovementThreshold={32} />));
  const handle = host.querySelector("button")!;
  pointer(handle, "pointerdown", 100);
  pointer(window, "pointermove", 200, 100, 2);
  pointer(window, "pointerup", 200, 100, 2);
  for (const x of [120, 80, 120, 80, 100]) {
    pointer(window, "pointermove", x);
  }
  pointer(window, "pointerup", 100);
  act(() => {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  expect(open).toHaveBeenCalledTimes(1);
});

it.each(["pointerup", "pointercancel", "blur", "unmount", "threshold"])(
  "releases temporary window observers on %s",
  (ending) => {
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    act(() => root.render(<DragHandle />));
    const handle = host.querySelector("button")!;
    expect(add).not.toHaveBeenCalled();
    pointer(handle, "pointerdown", 100);
    expect(add).toHaveBeenCalledTimes(4);
    if (ending === "unmount") {
      act(() => root.render(null));
    } else if (ending === "blur") {
      act(() => {
        window.dispatchEvent(new Event("blur"));
      });
    } else if (ending === "threshold") {
      pointer(window, "pointermove", 108);
    } else {
      pointer(window, ending, 100);
    }
    for (const [type, listener, options] of add.mock.calls) {
      expect(remove).toHaveBeenCalledWith(type, listener, options);
    }
  },
);

it("ignores movement after a lost release and checks the actual release excursion", () => {
  const open = jest.fn();
  act(() => root.render(<DragHandle onOpen={open} />));
  const handle = host.querySelector("button")!;
  pointer(handle, "pointerdown", 100);
  const move = new MouseEvent("pointermove", {
    bubbles: true,
    clientX: 200,
    clientY: 100,
    buttons: 0,
  });
  Object.defineProperty(move, "pointerId", { value: 1 });
  act(() => {
    window.dispatchEvent(move);
  });
  act(() => {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  expect(open).toHaveBeenCalledTimes(1);
  pointer(handle, "pointerdown", 100);
  pointer(window, "pointerup", 108);
  act(() => {
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  expect(open).toHaveBeenCalledTimes(1);
});

it.each([0, -1, NaN, Infinity])("rejects an invalid click movement threshold %s", (threshold) => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => act(() => root.render(<DragHandle clickMovementThreshold={threshold} />))).toThrow(
    RangeError,
  );
});

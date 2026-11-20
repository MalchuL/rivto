/** @jest-environment ./jest-browser-environment.mjs */
import { attachTestBrowserEvents } from "../../../../../test-utils/attach-test-browser-events";
import { BrowserEvents } from "@chulane/rivto-root/browser";
import { acquirePresetPointer } from "../preset-pointer-subscription";

it("rolls back earlier observations when pointer subscription setup fails", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, root);
  const original = Object.getOwnPropertyDescriptor(window, "addEventListener");
  const add = window.addEventListener.bind(window);
  Object.defineProperty(window, "addEventListener", {
    configurable: true,
    /**
     * Rejects the fixture's pointer-up listener while preserving other listeners.
     *
     * @param type - Native listener name.
     * @param listener - Callback to install.
     * @param options - Browser listener options.
     * @returns The browser listener is installed unless this is pointer-up.
     * @throws The fixture setup failure for pointer-up.
     */
    value(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ) {
      if (type === "pointerup") {
        throw new Error("pointerup setup failed");
      }
      add(type, listener, options);
    },
  });
  const handlers = {
    /**
     * Observes movement without changing the fixture.
     *
     * @returns No fixture state changes.
     */
    move() {},
    /**
     * Observes completion without changing the fixture.
     *
     * @returns No fixture state changes.
     */
    end() {},
  };
  let captureReleased = 0;
  const input = {
    clientX: 0,
    clientY: 0,
    pointerId: 7,
    button: 0,
    shiftKey: false,
    altKey: false,
    /**
     * Captures the fixture pointer and records its rollback.
     *
     * @returns Disposer recording release of the capture.
     */
    capture() {
      return () => {
        captureReleased += 1;
      };
    },
    /**
     * Rejects preview creation because setup must fail before a preview exists.
     *
     * @returns Never returns.
     * @throws If the fixture unexpectedly creates a preview.
     */
    createPreview(): never {
      throw new Error("unexpected preview");
    },
  };
  try {
    expect(() => acquirePresetPointer({ events }, input, handlers, "fixture")).toThrow(
      "pointerup setup failed",
    );
    expect(captureReleased).toBe(1);
  } finally {
    if (original) {
      Object.defineProperty(window, "addEventListener", original);
    } else {
      Reflect.deleteProperty(window, "addEventListener");
    }
  }
  try {
    let deliveries = 0;
    const release = events.observe(
      { id: "fixture.move", type: "pointermove", target: "window", capture: true },
      () => {
        deliveries += 1;
      },
    );
    window.dispatchEvent(new Event("pointermove"));
    expect(deliveries).toBe(1);
    release();
  } finally {
    detach();
    root.remove();
  }
});

it("does not subscribe when the originating target can no longer be captured", () => {
  const events = new BrowserEvents();
  const input = {
    clientX: 0,
    clientY: 0,
    pointerId: 7,
    button: 0,
    shiftKey: false,
    altKey: false,
    /**
     * Reports that the originating target is unavailable.
     *
     * @returns Undefined because no capture can be acquired.
     */
    capture() {
      return undefined;
    },
    /**
     * Rejects preview creation because capture was not acquired.
     *
     * @returns Never returns.
     * @throws If the fixture unexpectedly creates a preview.
     */
    createPreview(): never {
      throw new Error("unexpected preview");
    },
  };
  const handlers = {
    /**
     * Observes movement without changing the fixture.
     *
     * @returns No fixture state changes.
     */
    move() {},
    /**
     * Observes completion without changing the fixture.
     *
     * @returns No fixture state changes.
     */
    end() {},
  };
  expect(acquirePresetPointer({ events }, input, handlers, "fixture")).toBeUndefined();
  const release = events.observe(
    { id: "fixture.move", type: "pointermove", target: "window", capture: true },
    () => {},
  );
  release();
});

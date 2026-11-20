import type {
  BrowserListenerCapture,
  BrowserListenerRoot,
  BrowserRoutedEventFactory,
} from "../../index";

it("requires only an attachment check when selecting a listener occurrence", () => {
  const root: BrowserListenerRoot = { isAttached: () => true };
  const capture: BrowserListenerCapture = (occurrence) => {
    // @ts-expect-error A listener capture cannot control focus through its borrowed Root.
    const focus = occurrence.focus;
    expect(focus).toBeUndefined();
    expect(occurrence.isAttached()).toBe(true);
    return undefined;
  };
  expect(capture(root)).toBeUndefined();
});

it("does not give a routed event factory browser cancellation", () => {
  const factory: BrowserRoutedEventFactory<void> = (
    _group,
    _identity,
    _capture,
    _event,
    control,
  ) => {
    // @ts-expect-error Cancellation belongs to the routed event owner, not panel routing.
    const cancel = control.preventDefault;
    void cancel;
  };
  expect(factory).toBeDefined();
});

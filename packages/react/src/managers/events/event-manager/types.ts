/** Callback used by DOM and keyboard event registrations. */
export type EditorEventHandler<EventValue> = (
  event: EventValue
) => boolean | void;

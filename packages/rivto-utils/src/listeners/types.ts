/** Listener callback selected from one event payload type. */
export type ListenerCallback<Value> = [Value] extends [void] ? () => void : (value: Value) => void;

/** Emit arguments selected from one event payload type. */
export type ListenerArguments<Value> = [Value] extends [void] ? [] : [value: Value];

/** Internal callback shape used to store differently typed named events. */
export type StoredListener = (...args: never[]) => void;

/** Parsed exact shortcut used internally by KeyboardManager. */
export interface ParsedShortcut {
  readonly source: string;
  readonly key: string;
  readonly modifier: "primary" | "ctrl" | "meta" | "none";
  readonly alt: boolean;
  readonly shift: boolean;
}

/** Normalizes one browser key name for portable shortcut comparison. */
const normalizeKey = (key: string): string => {
  let normalized: string;
  if (key === " ") normalized = "Space";
  else if (key.length === 1) normalized = key.toLowerCase();
  else normalized = `${key[0]?.toUpperCase()}${key.slice(1)}`;
  return normalized;
};

/** Resolves a layout-independent letter from a physical keyboard code. */
const letterFromCode = (code: string): string | undefined =>
  /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase();

/** Parses and validates one exact, single-stroke shortcut. */
export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+").filter(Boolean);
  const key = normalizeKey(parts.pop() ?? "");
  if (!key) throw new Error(`Invalid keyboard shortcut: ${shortcut}`);
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  for (const modifier of modifiers) {
    if (!["primary", "ctrl", "control", "meta", "cmd", "command", "alt", "shift"].includes(modifier)) {
      throw new Error(`Unknown keyboard modifier ${modifier} in ${shortcut}`);
    }
  }
  const primary = modifiers.has("primary");
  const ctrl = modifiers.has("ctrl") || modifiers.has("control");
  const meta = modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command");
  if ([primary, ctrl, meta].filter(Boolean).length > 1) {
    throw new Error(`Primary, Ctrl, and Meta cannot be combined in ${shortcut}`);
  }
  return {
    source: [
      primary ? "Primary" : ctrl ? "Ctrl" : meta ? "Meta" : "",
      modifiers.has("alt") ? "Alt" : "",
      modifiers.has("shift") ? "Shift" : "",
      key,
    ].filter(Boolean).join("+"),
    key,
    modifier: primary ? "primary" : ctrl ? "ctrl" : meta ? "meta" : "none",
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
  };
}

/** Removes a modifier's own flag when the modifier key itself is the key. */
function eventModifiers(event: globalThis.KeyboardEvent) {
  return {
    ctrl: event.key === "Control" ? false : event.ctrlKey,
    meta: event.key === "Meta" ? false : event.metaKey,
    alt: event.key === "Alt" ? false : event.altKey,
    shift: event.key === "Shift" ? false : event.shiftKey,
  };
}

/** Tests one parsed shortcut against an exact native modifier state. */
export function matchesShortcut(
  shortcut: ParsedShortcut,
  event: globalThis.KeyboardEvent,
): boolean {
  const modifiers = eventModifiers(event);
  const logicalKey = normalizeKey(event.key);
  const physicalKey = shortcut.modifier === "none" ? undefined : letterFromCode(event.code);
  if (shortcut.key !== logicalKey && shortcut.key !== physicalKey) return false;
  if (shortcut.alt !== modifiers.alt || shortcut.shift !== modifiers.shift) return false;
  if (shortcut.modifier === "primary") return modifiers.ctrl !== modifiers.meta;
  if (shortcut.modifier === "ctrl") return modifiers.ctrl && !modifiers.meta;
  if (shortcut.modifier === "meta") return modifiers.meta && !modifiers.ctrl;
  return !modifiers.ctrl && !modifiers.meta;
}

/** Returns the canonical portable description of a native keyboard event. */
export function shortcutFromKeyboardEvent(event: globalThis.KeyboardEvent): string {
  const modifiers = eventModifiers(event);
  const key = modifiers.ctrl !== modifiers.meta
    ? letterFromCode(event.code) ?? normalizeKey(event.key)
    : normalizeKey(event.key);
  return [
    modifiers.ctrl !== modifiers.meta ? "Primary" : modifiers.ctrl ? "Ctrl+Meta" : "",
    modifiers.alt ? "Alt" : "",
    modifiers.shift ? "Shift" : "",
    key,
  ].filter(Boolean).join("+");
}

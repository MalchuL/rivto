import type { EditorMode } from "@chulane/rivto";
import type { EditorEvent } from "./editor-event";

/** Native listener realm supported by the active editor surface. */
export type DOMEventTarget = "surface" | "document" | "window";

/** Optional resolved presentation boundary required by a registration. */
export type DOMEventScope = "surface" | "block" | "content";

/** Native event map selected from the listener attachment realm. */
export type DOMEventMap<Target extends DOMEventTarget> =
  Target extends "document" ? DocumentEventMap :
  Target extends "window" ? WindowEventMap :
  HTMLElementEventMap;

/** Native event names valid for one attachment realm. */
export type DOMEventName<Target extends DOMEventTarget> =
  Extract<keyof DOMEventMap<Target>, string>;

/** Declarative DOM registration with stable identity and optional filtering. */
export interface DOMEventDefinition<
  Target extends DOMEventTarget = "surface",
  Type extends DOMEventName<Target> = DOMEventName<Target>,
> {
  /** Unique identity within the DOM registry. */
  readonly id: string;
  /** Native event type valid for target. */
  readonly type: Type;
  /** Attachment realm; defaults to the active surface. */
  readonly target?: Target;
  /** Resolved boundary which must contain the native target. */
  readonly scope?: DOMEventScope;
  /** Editor modes in which this registration participates. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** Native capture option. */
  readonly capture?: boolean;
  /** Native passive option. */
  readonly passive?: boolean;
  /** Dynamic availability predicate evaluated immediately before the handler. */
  readonly when?: (event: EditorEvent<Target, Type>) => boolean;
}

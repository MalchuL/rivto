import type { InputRoot } from "@chulane/rivto-root";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Local click eligibility; no editor event or native click is consumed. */
export interface DragHandleClick {
  /**
   * Starts tracking one primary press and replaces any unfinished local observation.
   *
   * @param event - Handle pointer-down input whose owner window supplies movement.
   * @returns The press origin is captured and temporary window observers are installed.
   */
  onPointerDown(event: ReactPointerEvent<HTMLButtonElement>): void;
  /**
   * Preserves keyboard activation while rejecting a pointer click after excessive travel.
   *
   * @param detail - Native click count; zero identifies keyboard or programmatic activation.
   * @returns Whether the handle may request navigation for this click.
   */
  allowsClick(detail: number): boolean;
}

/** Pointer identity and viewport origin captured at the start of a handle press. */
export interface DragHandlePointerOrigin {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** One handle press and the occurrence whose replacement ends its observations. */
export interface DragHandleTracking {
  readonly occurrence: Pick<InputRoot, "isAttached" | "observeWindowInput"> | undefined;
  /** Disposer for the active press and any standalone Root it owns. */
  readonly release: () => void;
}

import type { ReactNode } from "react";
import type {
  CanvasToolEntry,
  CanvasToolGroupEntry,
  CanvasToolRegistration,
} from "./tool-registry";

/** Application tool metadata with React-renderable icon content. */
export interface ReactCanvasToolEntry extends CanvasToolEntry {
  readonly icon?: ReactNode;
}

/** Application group metadata with React-renderable icon content. */
export interface ReactCanvasToolGroupEntry extends CanvasToolGroupEntry {
  readonly icon?: ReactNode;
}

/** Default independent tool factory with optional React icon presentation. */
export interface ReactCanvasToolRegistration extends CanvasToolRegistration, ReactCanvasToolEntry {}

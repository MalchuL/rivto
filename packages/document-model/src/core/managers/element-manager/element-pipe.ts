import type { Pipe, PipeProcessor } from "../../../utils/pipe";
import { PIPE_INTERNAL_PRIORITY_MIN } from "../../../utils/pipe";
import type { ElementInput } from "../../types";
import {
  normalizeElementFrame,
  normalizeElementProps,
  normalizeElementZIndex,
} from "./utils";

/** Stable id for the built-in element frame processor. */
export const ELEMENT_FRAME_PROCESSOR_ID = "rivto.element.frame";
/** Stable id for the built-in element stacking-order processor. */
export const ELEMENT_Z_INDEX_PROCESSOR_ID = "rivto.element.z-index";
/** Stable id for the built-in element props processor. */
export const ELEMENT_PROPS_PROCESSOR_ID = "rivto.element.props";

/**
 * Context forwarded to every element pipe processor.
 *
 * Element processors currently receive no extra placement data. The object
 * slot exists so later steps can share host context without changing the pipe type.
 */
export type ElementPipeContext = Record<string, never>;

/** One element validation or transform step registered on an element pipe. */
export type ElementProcessor = PipeProcessor<ElementInput, ElementPipeContext>;

/** Priority-ordered pipeline that processes portable element instances. */
export type ElementPipe = Pipe<ElementInput, ElementPipeContext>;

/** Built-in frame processor applied before plugin element steps. */
export const ELEMENT_FRAME_PROCESSOR: ElementProcessor = {
  id: ELEMENT_FRAME_PROCESSOR_ID,
  priority: PIPE_INTERNAL_PRIORITY_MIN,
  processor: (element) => ({ ...element, frame: normalizeElementFrame(element.frame) }),
};

/** Built-in stacking-order processor applied before plugin element steps. */
export const ELEMENT_Z_INDEX_PROCESSOR: ElementProcessor = {
  id: ELEMENT_Z_INDEX_PROCESSOR_ID,
  priority: PIPE_INTERNAL_PRIORITY_MIN + 10,
  processor: (element) => ({ ...element, zIndex: normalizeElementZIndex(element.zIndex) }),
};

/** Built-in props processor applied before plugin element steps. */
export const ELEMENT_PROPS_PROCESSOR: ElementProcessor = {
  id: ELEMENT_PROPS_PROCESSOR_ID,
  priority: PIPE_INTERNAL_PRIORITY_MIN + 20,
  processor: (element) => ({ ...element, props: normalizeElementProps(element.props) }),
};

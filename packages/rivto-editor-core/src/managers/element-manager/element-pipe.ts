/** Defines editor-owned element processor contracts. */
import type { ElementInput } from "@chulane/document-model";
import type { PipeProcessor } from "../../utils/pipe";

/** Element processors currently require no operation context. */
export type ElementPipeContext = Record<string, never>;

/** One editor-owned element validation or transformation step. */
export type ElementProcessor = PipeProcessor<ElementInput, ElementPipeContext>;

/**
 * Evaluates a multiline math block with mathjs.
 *
 * Each non-empty line is evaluated in order in one parser scope, so later
 * lines can use names assigned above. The displayed value is the last line's
 * result. Nothing here writes back into the document.
 *
 * @module
 */
import { all, create } from "mathjs";

const math = create(all);

math.import({
  import: () => {
    throw new Error("Function import is disabled");
  },
  createUnit: () => {
    throw new Error("Function createUnit is disabled");
  },
}, { override: true });

/** Result of evaluating one math block's source. */
export interface MathEvaluation {
  /** Formatted last value. Empty when the source is blank or evaluation failed. */
  readonly value: string;
  /** mathjs message when a line cannot be evaluated. */
  readonly error: string | null;
}

/** Formats a mathjs value for the result column. */
function formatMathValue(value: unknown): string {
  try {
    return math.format(value, { precision: 14 });
  } catch {
    return String(value);
  }
}

/**
 * Evaluates every non-empty line and returns the last value.
 *
 * Blank source is a valid empty result. A syntax or undefined-symbol error
 * leaves the value empty and returns the library message.
 *
 * @param source - Multiline expression stored on the block.
 * @returns The formatted value or an error message.
 */
export function evaluateMathSource(source: string): MathEvaluation {
  if (source.trim() === "") return { value: "", error: null };
  const parser = math.parser();
  let last: unknown;
  try {
    for (const line of source.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      last = parser.evaluate(line);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid expression";
    return { value: "", error: message };
  }
  if (last === undefined) return { value: "", error: null };
  return { value: formatMathValue(last), error: null };
}

/**
 * Evaluates a multiline math block with mathjs.
 *
 * Each non-empty line is evaluated in order in one parser scope, so later
 * lines can use names assigned above. Each source line has its own result;
 * a failed line reports its error while later lines retain the existing scope.
 * Nothing here writes back into the document.
 *
 * @module
 */
import { all, create } from "mathjs";

const math = create(all);

math.import(
  {
    import: () => {
      throw new Error("Function import is disabled");
    },
    createUnit: () => {
      throw new Error("Function createUnit is disabled");
    },
  },
  { override: true },
);

/** Result of evaluating one source line in a math block. */
export interface MathEvaluation {
  /** Formatted value; empty for a blank line or a failed evaluation. */
  readonly value: string;
  /** mathjs message when this line cannot be evaluated. */
  readonly error: string | null;
}

/**
 * Formats a mathjs value for the result column.
 *
 * @param value - Value produced by the mathjs parser.
 * @returns A formatted value, falling back to its string representation.
 */
function formatMathValue(value: unknown): string {
  try {
    return math.format(value, { precision: 14 });
  } catch {
    return String(value);
  }
}

/**
 * Evaluates each source line in order and preserves blank lines in the result.
 *
 * All non-empty lines share a parser scope. An invalid line reports its error
 * without preventing later lines from using variables assigned earlier.
 *
 * @param source - Multiline expression stored on the block.
 * @returns One formatted value or error for each source line, including blank lines.
 */
export function evaluateMathSource(source: string): readonly MathEvaluation[] {
  const parser = math.parser();
  return source.split(/\r?\n/).map((line) => {
    if (line.trim() === "") {
      return { value: "", error: null };
    }
    try {
      const value = parser.evaluate(line);
      return { value: value === undefined ? "" : formatMathValue(value), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid expression";
      return { value: "", error: message };
    }
  });
}

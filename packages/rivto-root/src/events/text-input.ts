import type { TextInputData } from "./types";

/**
 * Copies editing data into a browser-independent snapshot.
 *
 * Missing operation and composition fields use empty and false defaults;
 * missing inserted text becomes null. Later changes to the source do not
 * change the returned values.
 *
 * @param input - Editing fields supplied by the browser or another input source.
 * @returns Detached editing data with defaults for missing fields.
 */
export function captureTextInputData(input: Partial<TextInputData>): TextInputData {
  return {
    inputType: input.inputType ?? "",
    data: input.data ?? null,
    isComposing: input.isComposing ?? false,
  };
}

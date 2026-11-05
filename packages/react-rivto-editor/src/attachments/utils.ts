/** Browser-safe byte access for attachment extensions using their own providers. @module */

/**
 * Rejects empty references and script URI schemes before attachment resolution.
 *
 * @param uri - Provider or persisted reference, including optional surrounding whitespace.
 * @returns The trimmed reference.
 * @throws If the reference is empty or uses a blocked script scheme.
 */
export function validateBinaryUri(uri: string): string {
  const value = uri.trim();
  if (!value || /^(?:javascript|vbscript):/i.test(value)) {
    throw new TypeError("Binary provider returned an unsafe URI");
  }
  return value;
}

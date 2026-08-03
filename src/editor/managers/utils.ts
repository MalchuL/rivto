/**
 * Validates an unknown command payload as a non-array object.
 *
 * @param value - Unknown payload supplied through the command registry.
 * @returns Payload represented as a string-keyed record.
 * @throws {Error} When the payload is not an object record.
 */
export function commandPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Command payload must be an object");
  }
  return value as Record<string, unknown>;
}

/**
 * Validates one unknown command field as a string.
 *
 * @param value - Unknown field value to validate.
 * @param name - Field name included in validation errors.
 * @returns Validated string value.
 * @throws {Error} When the value is not a string.
 */
export function commandString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

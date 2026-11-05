/**
 * Escapes text for inclusion in portable HTML text or attributes.
 *
 * @param value - Untrusted text to escape.
 * @returns Text with HTML-sensitive characters replaced by entities.
 */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    // Replace each HTML-sensitive character with its matching entity.
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

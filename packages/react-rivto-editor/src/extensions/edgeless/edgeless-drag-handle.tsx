/**
 * Shared left-edge grab chrome for selected edgeless frames.
 *
 * Pure visual control — no object id. Mount it inside the moved frame
 * (block card, visual, or group bound) so transform preview moves it with
 * the parent and nothing else has to reconcile its position.
 */
export function EdgelessDragHandle({ label }: { readonly label: string }) {
  return (
    <button
      type="button"
      className="edgeless-drag-handle"
      data-edgeless-drag-handle="true"
      aria-label={label}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

/**
 * Application-owned navigation record selecting roots in the block and element trees.
 *
 * The host persists Panel IDs, navigation, and titles independently of document
 * snapshots. Null roots create no records. Several Panels can display the same
 * roots; edits then affect their shared document data. A missing non-null root
 * remains selected rather than falling back to document roots, allowing undo to
 * restore the original view. Element coordinates are not changed by opening a Panel.
 */
export interface Panel {
  /** Stable application identity for this Panel, separate from the document identity. */
  id: string;
  /** Document whose runtime must be passed to EditorPanel. */
  documentId: string;
  /** Null displays document blocks; an ID displays that block's children, excluding the block itself. */
  rootBlockId: string | null;
  /** Null displays document element roots; an element ID displays its descendants, excluding that container. */
  rootElementId: string | null;
}

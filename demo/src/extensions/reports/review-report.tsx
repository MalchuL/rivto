/**
 * Standalone React extension for editable Review block and canvas reports.
 *
 * The extension owns presentation, type registration, canvas validation, and
 * Save orchestration. Hosts inject persistence; the editor continues to own
 * only the portable evidence payload and can reproduce it with `editor.load()`.
 *
 * @module
 */
import type { DocumentEditorAPI, EditorElementNode } from "@chulane/rivto";
import {
  BLOCK_TEXT_METADATA_KEY,
  BlockText,
  blockExtension,
  elementExtension,
  editorControlProps,
  useBlockEditing,
  useEditorSelection,
  usePanel,
  type ReactEditorExtension,
} from "@chulane/rivto-react/authoring";
import { useState, type ChangeEvent } from "react";
import {
  REVIEW_REPORT_TYPE,
  captureBlockReview,
  captureElementReviewSnapshot,
  reviewBlockDefinition,
  reviewBlockPropsSchema,
  reviewElementPropsSchema,
  type ReviewBlockProps,
  type ReviewElementProps,
  type SaveReviewReport,
} from "./review-report-model";
import "./review-report.css";

const REVIEW_BLOCK_CLASS = "review-report-block";
const REVIEW_ELEMENT_CLASS = "review-report-element";
const REVIEW_PROBLEM_CLASS = "review-report-problem";
const REVIEW_CONTROLS_CLASS = "review-report-controls";
const REVIEW_STATUS_CLASS = "review-report-status";
const REVIEW_PREVIEW_CLASS = "review-report-preview";
const REVIEW_INCLUDE_CLASS = "review-report-include";

interface ReviewControlsProps {
  above: number;
  below: number;
  savedAt: string | null;
  snapshot: unknown;
  saving: boolean;
  error: string | null;
  includeReportBlock?: boolean;
  /**
   * Updates the number of preceding blocks included in the review snapshot.
   *
   * @param value - Number of blocks to include above the report.
   */
  onAboveChange(value: number): void;
  /**
   * Updates the number of following blocks included in the review snapshot.
   *
   * @param value - Number of blocks to include below the report.
   */
  onBelowChange(value: number): void;
  /**
   * Updates whether the report block itself is included in the snapshot.
   *
   * @param value - Whether the snapshot includes the report block.
   */
  onIncludeReportBlockChange?(value: boolean): void;
  /**
   * Requests saving the current review report and its snapshot.
   */
  onSave(): void;
  /**
   * Requests restoring the review snapshot into the demo.
   */
  onRestore(): void;
}

/**
 * Commits a non-negative integer from a Review number input when it is valid.
 *
 * @param event - Change event from a number input.
 * @param update - Callback receiving the valid integer.
 * @returns A valid value is passed to the callback; invalid values are ignored.
 */
function updateNumber(event: ChangeEvent<HTMLInputElement>, update: (value: number) => void): void {
  const value = Number(event.currentTarget.value);
  if (Number.isInteger(value) && value >= 0) {
    update(value);
  }
}

/**
 * Renders the capture window's preceding and following item inputs.
 *
 * @param props - Current window sizes and their change callbacks.
 * @returns Accessible number inputs for the capture window.
 */
function ReviewWindowInputs(
  props: Pick<ReviewControlsProps, "above" | "below" | "onAboveChange" | "onBelowChange">,
) {
  return (
    <>
      <label>
        Above
        <input
          aria-label="Review items above"
          type="number"
          min={0}
          step={1}
          value={props.above}
          onChange={(event) => updateNumber(event, props.onAboveChange)}
        />
      </label>
      <label>
        Below
        <input
          aria-label="Review items below"
          type="number"
          min={0}
          step={1}
          value={props.below}
          onChange={(event) => updateNumber(event, props.onBelowChange)}
        />
      </label>
    </>
  );
}

/**
 * Renders the shared window controls, Save state, and collapsed JSON preview.
 *
 * @param props - Current capture values and mutations supplied by an owner.
 * @returns Shared accessible Review controls.
 */
function ReviewControls(props: ReviewControlsProps) {
  return (
    <div {...editorControlProps} className={REVIEW_CONTROLS_CLASS}>
      <ReviewWindowInputs
        above={props.above}
        below={props.below}
        onAboveChange={props.onAboveChange}
        onBelowChange={props.onBelowChange}
      />
      {props.includeReportBlock !== undefined && props.onIncludeReportBlockChange && (
        <label className={REVIEW_INCLUDE_CLASS}>
          <input
            aria-label="Include Review block in snapshot"
            type="checkbox"
            checked={props.includeReportBlock}
            onChange={(event) => props.onIncludeReportBlockChange?.(event.currentTarget.checked)}
          />
          Include report block
        </label>
      )}
      <button type="button" disabled={props.saving} onClick={props.onSave}>
        {props.saving ? "Saving…" : "Save context"}
      </button>
      {props.snapshot != null && (
        <button type="button" disabled={props.saving} onClick={props.onRestore}>
          Restore snapshot
        </button>
      )}
      {props.savedAt && (
        <span className={REVIEW_STATUS_CLASS}>
          Saved {new Date(props.savedAt).toLocaleString()}
        </span>
      )}
      {props.error && <span role="alert">{props.error}</span>}
      {props.snapshot != null && (
        <details className={REVIEW_PREVIEW_CLASS}>
          <summary>Snapshot JSON</summary>
          <pre>{JSON.stringify(props.snapshot, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

/**
 * Tracks an asynchronous Review save and exposes any failure to the controls.
 *
 * The current render's operation is used when save is invoked. Concurrent calls
 * from a render that is already saving are ignored.
 *
 * @param operation - Captures, persists and commits one report.
 * @returns Save state, the last failure message and a save callback.
 */
function useReviewSave(operation: () => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, save };
}

interface ReviewBlockSavePanel {
  readonly document: DocumentEditorAPI;
  readonly blocks: Pick<ReturnType<typeof usePanel>["blocks"], "getBlockNode" | "updateBlock">;
}

/**
 * Captures and persists a block report, then commits its snapshot metadata.
 *
 * @param panel - Borrowed panel exposing the document and required block operations.
 * @param blockId - Review block to capture.
 * @param saveReport - Host callback that persists the captured report.
 * @returns Resolves after the saved snapshot metadata is committed.
 * @throws If the block is missing, its properties are invalid, or capture or persistence fails.
 */
async function saveBlockReview(
  panel: ReviewBlockSavePanel,
  blockId: string,
  saveReport: SaveReviewReport,
): Promise<void> {
  const live = panel.blocks.getBlockNode(blockId);
  if (!live) {
    throw new Error("Review block no longer exists");
  }
  const liveProps = reviewBlockPropsSchema.parse(live.props);
  const capture = captureBlockReview(
    panel.document,
    blockId,
    liveProps.blocksAbove,
    liveProps.blocksBelow,
    liveProps.includeReportBlock,
  );
  const savedAt = new Date().toISOString();
  await saveReport({
    kind: "block",
    reportId: blockId,
    problem: live.content,
    savedAt,
    ...capture,
  });
  panel.blocks.updateBlock(blockId, { props: { snapshot: capture.snapshot, savedAt } });
}

interface ReviewBlockRendererProps {
  readonly blockId: string;
  readonly saveReport: SaveReviewReport;
}

/**
 * Renders one Review leaf block and captures its root-level context on demand.
 *
 * @param props - Stable block identity and host persistence callback.
 * @param props.blockId - ID of the persisted Review block.
 * @param props.saveReport - Host callback that persists a captured report.
 * @returns Editable problem statement and report controls, or null after deletion.
 */
function ReviewBlock({ blockId, saveReport }: ReviewBlockRendererProps) {
  const panel = usePanel();
  const editing = useBlockEditing<ReviewBlockProps>(blockId);
  const { saving, error, save } = useReviewSave(() => saveBlockReview(panel, blockId, saveReport));
  if (!editing.block) {
    return null;
  }
  const props = reviewBlockPropsSchema.parse(editing.block.props);

  return (
    <section className={REVIEW_BLOCK_CLASS} data-review-report={blockId}>
      <BlockText
        attributes={editing.attributes}
        className={REVIEW_PROBLEM_CLASS}
        label="Review problem"
        data-placeholder="Describe the problem"
      />
      <div {...editing.preventTextEditingAttributes}>
        <ReviewControls
          above={props.blocksAbove}
          below={props.blocksBelow}
          savedAt={props.savedAt}
          snapshot={props.snapshot}
          saving={saving}
          error={error}
          includeReportBlock={props.includeReportBlock}
          onAboveChange={(blocksAbove) => editing.operations.setProp("blocksAbove", blocksAbove)}
          onBelowChange={(blocksBelow) => editing.operations.setProp("blocksBelow", blocksBelow)}
          onIncludeReportBlockChange={(includeReportBlock) =>
            editing.operations.setProp("includeReportBlock", includeReportBlock)
          }
          onSave={() => void save()}
          onRestore={() => panel.document.load(props.snapshot!)}
        />
      </div>
    </section>
  );
}

interface ReviewElementSavePanel {
  readonly document: DocumentEditorAPI;
  readonly elements: Pick<
    ReturnType<typeof usePanel>["elements"],
    "getElementNode" | "updateElement"
  >;
}

/**
 * Captures and persists a canvas report, then commits its snapshot metadata.
 *
 * @param panel - Borrowed panel exposing the document and required element operations.
 * @param elementId - Review element to capture.
 * @param saveReport - Host callback that persists the captured report.
 * @returns Resolves after the saved snapshot metadata is committed.
 * @throws If the element is missing, its properties are invalid, or capture or persistence fails.
 */
async function saveElementReview(
  panel: ReviewElementSavePanel,
  elementId: string,
  saveReport: SaveReviewReport,
): Promise<void> {
  const live = panel.elements.getElementNode(elementId);
  if (!live) {
    throw new Error("Review element no longer exists");
  }
  const liveProps = reviewElementPropsSchema.parse(live.props);
  const snapshot = captureElementReviewSnapshot(
    panel.document,
    elementId,
    liveProps.elementsAbove,
    liveProps.elementsBelow,
  );
  const savedAt = new Date().toISOString();
  await saveReport({
    kind: "element",
    reportId: elementId,
    problem: liveProps.problem,
    savedAt,
    snapshot,
  });
  panel.elements.updateElement(elementId, { props: { snapshot, savedAt } });
}

interface ReviewElementRendererProps {
  readonly element: EditorElementNode;
  readonly saveReport: SaveReviewReport;
}

/**
 * Renders one first-class Review element in the edgeless plane.
 *
 * @param props - Persisted element and injected report writer.
 * @param props.element - Current Review element snapshot.
 * @param props.saveReport - Host callback that persists a captured report.
 * @returns Review content with the same Save UX as the block; the registered element host owns positioning and selection slots.
 */
function ReviewElement({ element, saveReport }: ReviewElementRendererProps) {
  const panel = usePanel();
  const selection = useEditorSelection();
  const selected = selection?.elements?.includes(element.id) ?? false;
  const props = reviewElementPropsSchema.parse(element.props);

  /**
   * Applies a property patch to this element through its panel.
   *
   * @param patch - Properties to update on the persisted element.
   * @returns The panel has applied the property patch.
   */
  const update = (patch: Partial<ReviewElementProps>): void => {
    panel.elements.updateElement(element.id, { props: patch });
  };

  const { saving, error, save } = useReviewSave(() =>
    saveElementReview(panel, element.id, saveReport),
  );

  return (
    <section
      className={REVIEW_ELEMENT_CLASS}
      data-review-report={element.id}
      data-selected={selected || undefined}
    >
      <textarea
        {...editorControlProps}
        className={REVIEW_PROBLEM_CLASS}
        aria-label="Review problem"
        placeholder="Describe the problem"
        value={props.problem}
        onChange={(event) => update({ problem: event.currentTarget.value })}
      />
      <ReviewControls
        above={props.elementsAbove}
        below={props.elementsBelow}
        savedAt={props.savedAt}
        snapshot={props.snapshot}
        saving={saving}
        error={error}
        onAboveChange={(elementsAbove) => update({ elementsAbove })}
        onBelowChange={(elementsBelow) => update({ elementsBelow })}
        onSave={() => void save()}
        onRestore={() => panel.document.load(props.snapshot!)}
      />
    </section>
  );
}

/**
 * Creates the standalone Review report extension pair.
 *
 * @param options - Host persistence callback; no filesystem behavior enters the editor.
 * @returns Separate block and canvas extensions sharing one host callback.
 */
export function reviewReportExtensions(options: {
  readonly saveReport: SaveReviewReport;
}): readonly ReactEditorExtension[] {
  return [
    blockExtension({
      definition: {
        ...reviewBlockDefinition,
        metadata: { [BLOCK_TEXT_METADATA_KEY]: true },
      },
      render: ({ blockId }) => <ReviewBlock blockId={blockId} saveReport={options.saveReport} />,
      slashCommand: {
        title: "Review report",
        group: "Turn into",
        keywords: ["report", "context", "snapshot"],
      },
    }),
    elementExtension({
      definition: {
        type: REVIEW_REPORT_TYPE,
        validate: (props) => reviewElementPropsSchema.parse(props),
      },
      render: ({ element }) => <ReviewElement element={element} saveReport={options.saveReport} />,
    }),
  ];
}

export {
  REVIEW_REPORT_TYPE,
  createReviewBlockInput,
  createReviewElementInput,
  reviewBlockDefinition,
} from "./review-report-model";
export type {
  ReviewBlockProps,
  ReviewElementProps,
  ReviewReport,
  SaveReviewReport,
} from "./review-report-model";

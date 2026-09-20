/**
 * Standalone React extension for editable Review block and canvas reports.
 *
 * The extension owns presentation, type registration, canvas validation, and
 * Save orchestration. Hosts inject persistence; the editor continues to own
 * only the portable evidence payload and can reproduce it with `editor.load()`.
 *
 * @module
 */
import {
  ElementSlots,
  blockExtension,
  useBlockEditing,
  useEditorMode,
  useEditorRoot,
  useEditorSelection,
  useElements,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import type { EditorElement, RivtoEditorApi } from "@chulane/rivto";
import { createPortal } from "react-dom";
import {
  useState,
  type ChangeEvent,
} from "react";
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
const REVIEW_ELEMENT_LAYER_CLASS = "review-report-element-layer";
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
  onAboveChange(value: number): void;
  onBelowChange(value: number): void;
  onIncludeReportBlockChange?(value: boolean): void;
  onSave(): void;
  onRestore(): void;
}

/**
 * Renders the shared window controls, Save state, and collapsed JSON preview.
 *
 * @param props - Current capture values and mutations supplied by an owner.
 * @returns Shared accessible Review controls.
 */
function ReviewControls(props: ReviewControlsProps) {
  /** Commits a valid non-negative integer from a number input. */
  const updateNumber = (
    event: ChangeEvent<HTMLInputElement>,
    update: (value: number) => void,
  ): void => {
    const value = Number(event.currentTarget.value);
    if (Number.isInteger(value) && value >= 0) update(value);
  };

  return (
    <div className={REVIEW_CONTROLS_CLASS}>
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
 * Renders one Review leaf block and captures its root-level context on demand.
 *
 * @param props - Stable block identity and host persistence callback.
 * @returns Editable problem statement and report controls, or null after deletion.
 */
function ReviewBlock({
  editor,
  blockId,
  saveReport,
}: {
  readonly editor: RivtoEditorApi;
  readonly blockId: string;
  readonly saveReport: SaveReviewReport;
}) {
  const editing = useBlockEditing<ReviewBlockProps>(blockId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editing.block) return null;
  const props = reviewBlockPropsSchema.parse(editing.block.props);

  /** Exports current state, then commits snapshot metadata as one undo item. */
  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const live = editor.blocks.getBlockNode(blockId);
      if (!live) throw new Error("Review block no longer exists");
      const liveProps = reviewBlockPropsSchema.parse(live.props);
      const capture = captureBlockReview(
        editor,
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
      editor.blocks.updateBlock(blockId, { props: { snapshot: capture.snapshot, savedAt } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={REVIEW_BLOCK_CLASS} data-review-report={blockId}>
      <div
        {...editing.attributes}
        className={REVIEW_PROBLEM_CLASS}
        role="textbox"
        aria-label="Review problem"
        aria-multiline="true"
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
          onAboveChange={(blocksAbove) => editing.setProp("blocksAbove", blocksAbove)}
          onBelowChange={(blocksBelow) => editing.setProp("blocksBelow", blocksBelow)}
          onIncludeReportBlockChange={(includeReportBlock) => (
            editing.setProp("includeReportBlock", includeReportBlock)
          )}
          onSave={() => void save()}
          onRestore={() => editor.load(props.snapshot!)}
        />
      </div>
    </section>
  );
}

/**
 * Renders one first-class Review element in the edgeless plane.
 *
 * @param props - Persisted element and injected report writer.
 * @returns Positioned canvas frame with the same Save UX as the block.
 */
function ReviewElement({
  editor,
  element,
  selected,
  saveReport,
}: {
  readonly editor: RivtoEditorApi;
  readonly element: EditorElement;
  readonly selected: boolean;
  readonly saveReport: SaveReviewReport;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const props = reviewElementPropsSchema.parse(element.props);

  /** Applies one validated persisted property patch to this element. */
  const update = (patch: Partial<ReviewElementProps>): void => {
    editor.elements.updateElement(element.id, { props: patch });
  };

  /** Exports current state, then commits snapshot metadata as one undo item. */
  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const live = editor.elements.getElement(element.id);
      if (!live) throw new Error("Review element no longer exists");
      const liveProps = reviewElementPropsSchema.parse(live.props);
      const snapshot = captureElementReviewSnapshot(
        editor,
        element.id,
        liveProps.elementsAbove,
        liveProps.elementsBelow,
      );
      const savedAt = new Date().toISOString();
      await saveReport({
        kind: "element",
        reportId: element.id,
        problem: liveProps.problem,
        savedAt,
        snapshot,
      });
      editor.elements.updateElement(element.id, { props: { snapshot, savedAt } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={REVIEW_ELEMENT_CLASS}
      data-edgeless-object-kind="review"
      data-edgeless-object-id={element.id}
      data-review-report={element.id}
      data-selected={selected || undefined}
      style={{
        left: element.frame.x,
        top: element.frame.y,
        width: element.frame.width,
        height: element.frame.height,
        zIndex: element.zIndex,
      }}
    >
      <textarea
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
        onRestore={() => editor.load(props.snapshot!)}
      />
      <ElementSlots element={element} selected={selected} />
    </section>
  );
}

/**
 * Portals Review elements into the existing edgeless plane.
 *
 * @param props - Host persistence callback shared by every rendered report.
 * @returns Portal contents in edgeless mode, otherwise null.
 */
function ReviewElementLayer({ editor, saveReport }: {
  readonly editor: RivtoEditorApi;
  readonly saveReport: SaveReviewReport;
}) {
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
  const elements = useElements();
  const selection = useEditorSelection();
  const plane = root?.querySelector<HTMLElement>("[data-edgeless-plane]") ?? null;
  if (mode !== "edgeless" || !plane) return null;
  const selected = new Set(selection?.elements ?? []);
  return createPortal(
    <div className={REVIEW_ELEMENT_LAYER_CLASS}>
      {elements.filter(({ type }) => type === REVIEW_REPORT_TYPE).map((element) => (
        <ReviewElement
          key={element.id}
          editor={editor}
          element={element}
          selected={selected.has(element.id)}
          saveReport={saveReport}
        />
      ))}
    </div>,
    plane,
  );
}

/**
 * Creates the standalone Review report extension pair.
 *
 * @param options - Host persistence callback; no filesystem behavior enters the editor.
 * @returns Separate block and canvas extensions sharing one host callback.
 */
export function reviewReportExtensions(options: {
  readonly editor: RivtoEditorApi;
  readonly saveReport: SaveReviewReport;
}): readonly ReactEditorExtension[] {
  return [
    blockExtension({
      definition: reviewBlockDefinition,
      render: ({ blockId }) => (
        <ReviewBlock editor={options.editor} blockId={blockId} saveReport={options.saveReport} />
      ),
      slashCommand: {
        title: "Review report",
        group: "Turn into",
        keywords: ["report", "context", "snapshot"],
      },
    }),
    {
      id: "demo.review-report.elements",
      setup: (reactEditor) => {
        reactEditor.extensions.mount(() => (
          <ReviewElementLayer editor={options.editor} saveReport={options.saveReport} />
        ));
        return reactEditor.elements.registerProcessor({
          id: "demo.review-report.props",
          priority: 0,
          processor: (element) => element.type === REVIEW_REPORT_TYPE
            ? { ...element, props: reviewElementPropsSchema.parse(element.props) }
            : element,
        });
      },
    },
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

/**
 * Inserts the demo HTML blocks and canvas widgets into a fresh notebook.
 *
 * @module
 */
import type { DocumentEditorAPI } from "@chulane/rivto";
import { separatorBlockFactory } from "@chulane/rivto-react/block-factories";
import { HTML_BLOCK_TYPE, HTML_ELEMENT_TYPE, UNSAFE_HTML_BLOCK_TYPE } from "@chulane/rivto-react";
import { HTML_BLOCK_SAMPLES, HTML_ELEMENT_SAMPLES } from "./samples";
import { UNSAFE_HTML_SAMPLES } from "./unsafe-samples";

/** Borrowed operations used while the notebook is still empty of history. */
interface HtmlSeedEditor {
  /** Creates the canvas label beside the HTML elements. */
  readonly commands: Pick<DocumentEditorAPI["commands"], "execute">;
  /** Inserts HTML blocks and observes changes to the seeded Pomodoro. */
  readonly blocks: Pick<
    DocumentEditorAPI["blocks"],
    "insertBlock" | "getInsertionDestinationAfter" | "getBlockNode" | "subscribeBlockNode"
  >;
  /** Inserts the block card and the HTML elements. */
  readonly elements: Pick<DocumentEditorAPI["elements"], "insertElement">;
}

/** Canvas card that holds the HTML section without covering the weekend plan. */
const HTML_BLOCK_CARD_FRAME = { x: 60, y: 980, width: 560, height: 1600 };

/** Browser storage key for the timer in the demo notebook, which is reseeded on each open. */
const POMODORO_STORAGE_KEY = "rivto-demo:journal:pomodoro";

/**
 * Reads the timer props saved by the demo host on this browser origin.
 *
 * @returns The stored duration and start time, or undefined when storage or the saved fields are unavailable.
 */
function readPomodoroProps() {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(POMODORO_STORAGE_KEY) ?? "null");
    if (
      saved &&
      typeof saved === "object" &&
      "timer" in saved &&
      typeof saved.timer === "number" &&
      "startedAt" in saved &&
      (saved.startedAt === null || typeof saved.startedAt === "number")
    ) {
      return { timer: saved.timer, startedAt: saved.startedAt };
    }
  } catch {
    // The notebook still opens when browser storage is unavailable or malformed.
  }
  return undefined;
}

/**
 * Saves changes to the seeded timer so the demo can restore them on its next open.
 *
 * The core block manager releases this subscription when the demo editor is destroyed.
 *
 * @param blocks - Borrowed block reads and subscriptions from the demo editor.
 * @param blockId - ID of the seeded Pomodoro in this document instance.
 * @returns A subscription is attached to the timer node; storage is written only when timer props change.
 */
function persistPomodoroProps(
  blocks: Pick<HtmlSeedEditor["blocks"], "getBlockNode" | "subscribeBlockNode">,
  blockId: string,
): void {
  let previous = blocks.getBlockNode(blockId)?.props;
  blocks.subscribeBlockNode(blockId, () => {
    const props = blocks.getBlockNode(blockId)?.props;
    if (!props || (previous?.timer === props.timer && previous?.startedAt === props.startedAt)) {
      return;
    }
    previous = props;
    try {
      window.localStorage.setItem(
        POMODORO_STORAGE_KEY,
        JSON.stringify({ timer: props.timer, startedAt: props.startedAt ?? null }),
      );
    } catch {
      // The live timer remains usable when the browser blocks storage.
    }
  });
}

/**
 * Inserts the HTML heading, widgets, and their canvas card before the notebook.
 *
 * The card is placed below the existing plans. Page mode still shows these
 * blocks first because they are the first root blocks.
 *
 * The section ends with a separator so the notebook cards stay independent.
 * The seeded Pomodoro restores and saves its timer props through the demo host.
 *
 * @param editor - Editor whose document receives the section.
 * @returns Id of the separator after the HTML blocks.
 * @throws If a block or element insertion fails.
 */
export function appendHtmlBlockSection(editor: HtmlSeedEditor): string {
  const heading = editor.blocks.insertBlock({
    type: "paragraph",
    content: "## HTML widgets",
  });
  let afterId = heading.id;
  for (const sample of HTML_BLOCK_SAMPLES) {
    const isPomodoro = sample.sample === "pomodoro";
    const created = editor.blocks.insertBlock(
      {
        type: HTML_BLOCK_TYPE,
        content: sample.html,
        props: isPomodoro ? { ...sample.props, ...readPomodoroProps() } : sample.props,
        ...(sample.listProps ? { listProps: sample.listProps } : {}),
      },
      editor.blocks.getInsertionDestinationAfter(afterId),
    );
    if (isPomodoro) {
      persistPomodoroProps(editor.blocks, created.id);
    }
    afterId = created.id;
  }
  afterId = appendUnsafeHtmlSamples(editor, afterId);
  editor.elements.insertElement({
    type: "block",
    frame: HTML_BLOCK_CARD_FRAME,
    zIndex: 6,
    props: { startBlockId: heading.id, endBlockId: afterId },
  });
  return editor.blocks.insertBlock(
    separatorBlockFactory.createEmptyBlock(),
    editor.blocks.getInsertionDestinationAfter(afterId),
  ).id;
}

/**
 * Adds each unsafe example after a dedicated previous-sibling target.
 *
 * @param editor - Editor inserting blocks into the demo document.
 * @param afterId - Last block already inserted in the section.
 * @returns ID of the final unsafe example.
 * @throws If inserting either block fails.
 */
function appendUnsafeHtmlSamples(editor: HtmlSeedEditor, afterId: string): string {
  for (const sample of UNSAFE_HTML_SAMPLES) {
    const previous = editor.blocks.insertBlock(
      { type: "paragraph", content: sample.previous },
      editor.blocks.getInsertionDestinationAfter(afterId),
    );
    const widget = editor.blocks.insertBlock(
      { type: UNSAFE_HTML_BLOCK_TYPE, content: sample.html, props: { label: sample.label } },
      editor.blocks.getInsertionDestinationAfter(previous.id),
    );
    afterId = widget.id;
  }
  return afterId;
}

/**
 * Places the rotating circle and the other HTML elements beside the picnic plan.
 *
 * @param editor - Editor whose canvas receives the elements.
 * @returns The label and HTML elements have been inserted.
 * @throws If a visual command or element insertion fails.
 */
export function seedHtmlElements(editor: HtmlSeedEditor): void {
  editor.commands.execute("edgeless.visual.create", {
    kind: "text",
    text: "HTML elements",
    frame: { x: 2140, y: 8, width: 280, height: 32 },
    fontSize: 22,
    color: "#151522",
  });
  for (const [index, sample] of HTML_ELEMENT_SAMPLES.entries()) {
    editor.elements.insertElement({
      type: HTML_ELEMENT_TYPE,
      frame: sample.frame,
      zIndex: 40 + index,
      props: { ...sample.props, html: sample.html },
    });
  }
}

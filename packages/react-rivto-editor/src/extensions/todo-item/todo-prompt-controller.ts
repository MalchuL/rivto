import type { EditorViewApi } from "../../editor-view/types";
import type { EditorRuntime } from "../../editor/editor-runtime";
import { restoreDOMSelection, saveDOMSelection } from "../../managers";
import { TODO_PROMPT_CLASS } from "./todo-item-classes";
import { TODO_ITEM_BLOCK_TYPE, createTodoItemProps, matchPrompt, type PromptMatch, type TodoItemStatus } from "./todo-item-model";

interface TodoCandidate extends PromptMatch {
  readonly editor: EditorViewApi;
  readonly blockId: string;
  readonly contentElement: HTMLElement;
}

/**
 * Replaces prompt decoration without changing text or the current DOM range.
 *
 * @param element - Plain-text editable host to update.
 * @param prompt - Matching leading token, or undefined to clear decoration.
 * @returns No value.
 */
const decoratePrompt = (element: HTMLElement, prompt?: string): void => {
  const text = element.textContent ?? "";
  const current = element.querySelector<HTMLElement>(`.${TODO_PROMPT_CLASS}`);
  if ((!prompt && !current) || (prompt && current?.textContent === prompt && current === element.firstChild)) return;
  const selection = saveDOMSelection(element);
  element.textContent = text;
  if (prompt) {
    const tail = element.firstChild;
    const promptNode = element.ownerDocument.createElement("span");
    promptNode.className = TODO_PROMPT_CLASS;
    promptNode.textContent = prompt;
    if (tail) {
      tail.textContent = text.slice(prompt.length);
      element.insertBefore(promptNode, tail);
    } else {
      element.append(promptNode);
    }
  }
  restoreDOMSelection(element, selection);
};

/** Owns leading-token decoration and conversion in the active document view. */
export class TodoPromptController {
  private candidate: TodoCandidate | undefined;
  private active = false;
  /** @param editorRuntime - Runtime receiving events. @param prompts - Validated token-to-status lookup. */
  constructor(private readonly editorRuntime: EditorRuntime, private readonly prompts: ReadonlyMap<string, TodoItemStatus>) {}
  /** Clears candidate markup and tracking without touching persisted text. */
  private clearCandidate = (): void => {
    if (this.candidate) decoratePrompt(this.candidate.contentElement);
    this.candidate = undefined;
  };

  /** Converts the tracked candidate after revalidating its latest content. */
  private convertCandidate = (): void => {
    const current = this.candidate;
    if (!current) return;
    this.candidate = undefined;
    if (!current.contentElement.isConnected) return;
    const editor = current.editor;

    const block = editor.runtime.blocks.getBlockNode(current.blockId);
    const match = block ? matchPrompt(block.content, this.prompts) : undefined;
    if (!block || block.type === TODO_ITEM_BLOCK_TYPE || !match) {
      decoratePrompt(current.contentElement);
      return;
    }
    const owned = createTodoItemProps();
    editor.runtime.history.batchUpdates(() => {
      editor.runtime.blocks.setBlockType(current.blockId, TODO_ITEM_BLOCK_TYPE);
      editor.runtime.blocks.updateBlock(current.blockId, {
        content: block.content.slice(match.prompt.length).replace(/^\s+/, ""),
        props: { ...owned, status: match.status },
      });
    });

  };

  /** Installs delegated prompt handlers and returns their cleanup. */
  setup(): () => void {
    this.active = true;
    const disposers = [
      this.editorRuntime.events.register({
        id: "todo-item.input",
        type: "input",
        scope: "content",
      }, ({ blockId, contentElement, editorView: editor }) => {
        if (!blockId || !contentElement) return false;
        queueMicrotask(() => {
          if (!this.active) return;
          const block = editor.runtime.blocks.getBlockNode(blockId);
          if (!block || block.type === TODO_ITEM_BLOCK_TYPE) return;
          const match = matchPrompt(contentElement.textContent ?? "", this.prompts);
          if (!match) {
            if (this.candidate?.blockId === blockId) this.clearCandidate();
            return;
          }
          if (this.candidate && this.candidate.blockId !== blockId) this.convertCandidate();
          this.candidate = { editor, blockId, contentElement, ...match };
          decoratePrompt(contentElement, match.prompt);
        });
        return false;
      }),
      this.editorRuntime.events.register({
        id: "todo-item.focus-out",
        type: "focusout",
        scope: "content",
      }, ({ raw: event, root, blockId, blockElement }) => {
        // OS overlays such as Win+Space can transiently blur the document.
        if (!root.ownerDocument.hasFocus()) return false;
        if (this.candidate?.blockId !== blockId) return false;
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !blockElement?.contains(next)) this.convertCandidate();
        return false;
      }),
      this.editorRuntime.events.register({
        id: "todo-item.pointer-down",
        type: "pointerdown",
        target: "document",
        capture: true,
      }, ({ blockId }) => {
        if (this.candidate && this.candidate.blockId !== blockId) this.convertCandidate();
        return false;
      }),
      this.editorRuntime.events.register({
        id: "todo-item.selection-change",
        type: "selectionchange",
        target: "document",
      }, ({ root, editorView }) => {
        // A lost browser range is not an editor navigation while the OS owns focus.
        if (!root.ownerDocument.hasFocus()) return false;
        const activeBlockId = editorView.selection.readDOM()?.focusBlockId;
        if (this.candidate && activeBlockId !== this.candidate.blockId) this.convertCandidate();
        return false;
      }),
    ];
    return () => {
      this.active = false;
      this.clearCandidate();
      disposers.reverse().forEach((dispose) => dispose());
    };
  }
}

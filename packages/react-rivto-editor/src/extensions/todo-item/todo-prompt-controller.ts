import type { ReactEditorExtensionApi } from "../../editor/types";
import type { EditorEvent } from "../../managers/events/editor-event";
import { TODO_PROMPT_CLASS } from "./todo-item-classes";
import {
  TODO_ITEM_BLOCK_TYPE,
  createTodoItemProps,
  matchPrompt,
  type TodoItemStatus,
} from "./todo-item-model";
import type { TodoCandidate } from "./types";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../../constants";

/** Owns leading-token decoration and conversion in the active document view. */
export class TodoPromptController {
  private candidate: TodoCandidate | undefined;
  private active = false;

  /**
   * Creates a prompt controller over an existing event runtime.
   *
   * @param reactEditor - Runtime receiving events.
   * @param prompts - Validated token-to-status lookup.
   */
  constructor(
    private readonly reactEditor: ReactEditorExtensionApi,
    private readonly prompts: ReadonlyMap<string, TodoItemStatus>,
  ) {}

  /**
   * Installs delegated prompt handlers and retains their cleanup.
   *
   * @returns Disposer removing registrations and clearing candidate decoration.
   * @throws Propagates registration or cleanup failures.
   */
  setup(): () => void {
    this.active = true;
    const disposers = [
      this.reactEditor.events.register(
        { id: "todo-item.input", type: "input", scope: "content" },
        this.onInput,
      ),
      this.reactEditor.events.register(
        { id: "todo-item.focus-out", type: "focusout", scope: "content" },
        this.onFocusOut,
      ),
      this.reactEditor.events.register(
        { id: "todo-item.pointer-down", type: "pointerdown", target: "document", capture: true },
        this.onPointerDown,
      ),
      this.reactEditor.events.register(
        { id: "todo-item.selection-change", type: "selectionchange", target: "document" },
        this.onSelectionChange,
      ),
    ];
    return () => {
      this.active = false;
      this.clearCandidate();
      disposers.reverse().forEach((dispose) => dispose());
    };
  }

  /**
   * Defers prompt matching until the content edit has completed.
   *
   * @param event - Content input and its exact registration capability.
   * @returns False so other input handlers continue.
   */
  private readonly onInput = (event: EditorEvent<"surface", "input">): boolean => {
    const {
      blockId,
      contentInput: content,
      inputRoot,
      inputRegistration,
      reactPanel: editor,
    } = event;
    if (!blockId || !content) {
      return false;
    }
    queueMicrotask(() => {
      if (
        !this.active ||
        !inputRegistration.isCurrent(inputRoot) ||
        content.readAncestorAttribute(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE) !== blockId
      ) {
        return;
      }
      const block = editor.blocks.getBlockNode(blockId);
      if (!block || block.type === TODO_ITEM_BLOCK_TYPE) {
        return;
      }
      const match = matchPrompt(content.readText(), this.prompts);
      if (!this.active || !inputRegistration.isCurrent(inputRoot)) {
        return;
      }
      if (!match) {
        const candidate = this.candidate;
        if (
          candidate &&
          candidate.blockId === blockId &&
          candidate.inputRoot === inputRoot &&
          candidate.inputRegistration === inputRegistration
        ) {
          this.clearCandidate();
        } else if (
          candidate &&
          candidate.blockId === blockId &&
          !candidate.inputRegistration.isCurrent(candidate.inputRoot)
        ) {
          this.clearCandidate();
        }
        return;
      }
      if (
        this.candidate &&
        (this.candidate.blockId !== blockId ||
          this.candidate.inputRoot !== inputRoot ||
          this.candidate.inputRegistration !== inputRegistration)
      ) {
        this.convertCandidate();
      }
      if (
        !this.active ||
        !inputRegistration.isCurrent(inputRoot) ||
        content.readAncestorAttribute(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE) !== blockId
      ) {
        return;
      }
      this.candidate = { editor, blockId, content, inputRoot, inputRegistration, ...match };
      content.decoratePrefix(match.prompt, TODO_PROMPT_CLASS);
    });
    return false;
  };

  /**
   * Converts a candidate when focus leaves its owning block.
   *
   * @param event - Focus transition and its receiving occurrence.
   * @returns False so other focus handlers continue.
   */
  private readonly onFocusOut = (event: EditorEvent<"surface", "focusout">): boolean => {
    const { inputRoot, inputRegistration, blockId, isFocusWithinBlock } = event;
    // OS overlays such as Win+Space can transiently blur the document.
    if (!inputRoot.isDocumentFocused()) {
      return false;
    }
    const candidate = this.candidate;
    if (
      !candidate ||
      candidate.blockId !== blockId ||
      candidate.inputRoot !== inputRoot ||
      candidate.inputRegistration !== inputRegistration
    ) {
      return false;
    }
    if (!isFocusWithinBlock?.()) {
      this.convertCandidate();
    }
    return false;
  };

  /**
   * Converts a candidate when a pointer enters another block or occurrence.
   *
   * @param event - Document pointer-down and its receiving occurrence.
   * @returns False so pointer dispatch continues.
   */
  private readonly onPointerDown = (event: EditorEvent<"document", "pointerdown">): boolean => {
    const { blockId, inputRoot, inputRegistration } = event;
    if (
      this.candidate &&
      (this.candidate.blockId !== blockId ||
        this.candidate.inputRoot !== inputRoot ||
        this.candidate.inputRegistration !== inputRegistration)
    ) {
      this.convertCandidate();
    }
    return false;
  };

  /**
   * Converts a candidate when the owned browser selection moves elsewhere.
   *
   * @param event - Document selection change and its receiving occurrence.
   * @returns False so selection observers continue.
   */
  private readonly onSelectionChange = (
    event: EditorEvent<"document", "selectionchange">,
  ): boolean => {
    const { inputRoot, inputRegistration, reactPanel } = event;
    // A lost browser range is not an editor navigation while the OS owns focus.
    if (!inputRoot.isDocumentFocused()) {
      return false;
    }
    const activeBlockId = reactPanel.selection.readDOM()?.focusBlockId;
    if (
      this.candidate &&
      (activeBlockId !== this.candidate.blockId ||
        this.candidate.inputRoot !== inputRoot ||
        this.candidate.inputRegistration !== inputRegistration)
    ) {
      this.convertCandidate();
    }
    return false;
  };

  /**
   * Removes candidate markup and forgets it without changing persisted text.
   *
   * A stale candidate is cleaned only if its original host can be revalidated
   * through the panel's current registration. A replaced host is never rewritten.
   *
   * @returns The candidate is forgotten; its decoration is cleared when ownership remains valid.
   * @throws Propagates browser lookup, decoration, or selection failures.
   */
  private readonly clearCandidate = (): void => {
    const candidate = this.candidate;
    if (!candidate) {
      return;
    }
    if (
      candidate.inputRegistration.isCurrent(candidate.inputRoot) &&
      candidate.content.isConnected() &&
      candidate.content.readAncestorAttribute(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE) ===
        candidate.blockId &&
      candidate.inputRegistration.isCurrent(candidate.inputRoot)
    ) {
      candidate.content.decoratePrefix(undefined, TODO_PROMPT_CLASS);
      this.candidate = undefined;
      return;
    }
    const currentRoot = candidate.editor.inputRoot;
    const currentRegistration = candidate.editor.inputRegistration;
    if (!currentRoot || !currentRegistration?.isCurrent(currentRoot)) {
      this.candidate = undefined;
      return;
    }
    const currentContent = candidate.editor.selection.contentInput(candidate.blockId);
    if (
      currentContent?.isSameHost(candidate.content) &&
      currentRegistration.isCurrent(currentRoot) &&
      candidate.editor.inputRegistration === currentRegistration &&
      candidate.editor.inputRoot === currentRoot
    ) {
      currentContent.decoratePrefix(undefined, TODO_PROMPT_CLASS);
    }
    this.candidate = undefined;
  };

  /**
   * Converts the tracked candidate after revalidating its latest content.
   *
   * @returns The candidate is cleared and, if still valid, converted in one batch.
   * @throws Propagates document mutation, decoration, or selection failures.
   */
  private readonly convertCandidate = (): void => {
    const current = this.candidate;
    if (!current) {
      return;
    }
    if (
      !current.inputRegistration.isCurrent(current.inputRoot) ||
      !current.content.isConnected() ||
      current.content.readAncestorAttribute(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE) !==
        current.blockId
    ) {
      this.clearCandidate();
      return;
    }
    const editor = current.editor;
    const block = editor.blocks.getBlockNode(current.blockId);
    const match = block ? matchPrompt(block.content, this.prompts) : undefined;
    if (!current.inputRegistration.isCurrent(current.inputRoot)) {
      this.clearCandidate();
      return;
    }
    this.candidate = undefined;
    if (!block || block.type === TODO_ITEM_BLOCK_TYPE || !match) {
      current.content.decoratePrefix(undefined, TODO_PROMPT_CLASS);
      return;
    }
    const owned = createTodoItemProps();
    editor.batchUpdates(() => {
      editor.blocks.setBlockType(current.blockId, TODO_ITEM_BLOCK_TYPE);
      editor.blocks.updateBlock(current.blockId, {
        content: block.content.slice(match.prompt.length).replace(/^\s+/, ""),
        props: { ...owned, status: match.status },
      });
    });
  };
}

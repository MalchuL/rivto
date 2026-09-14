/**
 * Focused persistence and lifecycle tests for the comments extension.
 *
 * UI placement is covered by Playwright; these tests keep the collaborative
 * thread model, undo behavior, author semantics, and anchor cleanup fast.
 *
 * @module
 */
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { commentsExtension } from ".";

describe("commentsExtension", () => {
  test("persists attributed threads, replies, edits, and resolved state", () => {
    const editor = createTestCoreEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Discuss me" });
    const elementId = editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 10, y: 20, width: 100, height: 80 },
      zIndex: 0,
    });
    const comments = commentsExtension({ author: { id: "user-1", name: "Ada" } });
    const reactEditor = createReactEditor({ editor, extensions: [comments] });

    const threadId = comments.createThread([
      { type: "block", id: blockId },
      { type: "element", id: elementId },
    ], "Root note");
    const replyId = comments.addReply(threadId, "First reply");
    comments.editMessage(threadId, replyId, "Edited reply");
    editor.history.clear();
    comments.setResolved(threadId);

    expect(comments.getThreads()).toEqual([expect.objectContaining({
      id: threadId,
      resolved: true,
      anchors: [{ type: "block", id: blockId }, { type: "element", id: elementId }],
      messages: [
        expect.objectContaining({ content: "Root note", author: { id: "user-1", name: "Ada" } }),
        expect.objectContaining({ id: replyId, content: "Edited reply", author: { id: "user-1", name: "Ada" } }),
      ],
    })]);
    expect(editor.dump().pluginData?.["rivto.comments"]).toHaveProperty(threadId);

    editor.undo();
    expect(comments.getThreads()[0]?.resolved).toBe(false);
    reactEditor.destroy();
    expect(() => comments.getThreads()).toThrow(/not installed/);
    editor.destroy();
  });

  test("omits anonymous authors and removes orphaned anchors", () => {
    const editor = createTestCoreEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    const comments = commentsExtension();
    const reactEditor = createReactEditor({ editor, extensions: [comments] });
    const threadId = comments.createThread([
      { type: "block", id: first },
      { type: "block", id: second },
    ], "Anonymous");

    expect(comments.getThreads()[0]?.messages[0]?.author).toBeUndefined();
    editor.blocks.removeBlock(first);
    expect(comments.getThreads()[0]?.anchors).toEqual([{ type: "block", id: second }]);
    editor.blocks.removeBlock(second);
    expect(comments.getThreads()).toEqual([]);
    expect(editor.dump().pluginData?.["rivto.comments"]).not.toHaveProperty(threadId);

    reactEditor.destroy();
    editor.destroy();
  });

  test("registers a block-local slash entry and rejects links or empty content", () => {
    const editor = createTestCoreEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" });
    const comments = commentsExtension();
    const reactEditor = createReactEditor({ editor, extensions: [comments] });

    expect(reactEditor.slashCommands.getAll({ blockId })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "comment.create", title: "Comment" }),
    ]));
    expect(() => comments.createThread([{ type: "link" as "block", id: "missing" }], "No"))
      .toThrow(/block or element anchors/);
    expect(() => comments.createThread([{ type: "block", id: blockId }], "  ")).toThrow(/content/);

    reactEditor.destroy();
    editor.destroy();
  });
});

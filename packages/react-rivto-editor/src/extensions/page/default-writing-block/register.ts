/**
 * Runtime registration for the host-provided default writing block.
 *
 * @module
 */
import type { EditorBlockInput } from "@chulane/rivto";
import { createElement } from "react";
import { MarkdownContent } from "../../../blocks/markdown";
import type { BlockRenderer, ReactBlockSlashCommand } from "../../../managers";
import type { ReactEditor } from "../../../types";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./constants";
import type { DefaultWritingBlockOptions } from "./types";
import { resolveIsEmptyBlock } from "./utils";

/**
 * Installs writing factories, rendering, and slash conversion.
 *
 * @param reactEditor - Runtime receiving the writing-block registration.
 * @param options - Host-provided writing-block configuration.
 * @returns Cleanup for every installed writing-block facility.
 */
export function registerDefaultWritingBlock(
  reactEditor: ReactEditor,
  options: DefaultWritingBlockOptions,
): () => void {
  const type = options.type ?? DEFAULT_WRITING_BLOCK_TYPE;
  const title = options.title ?? "Paragraph";
  const createDefaultBlock = options.createDefaultBlock
    ?? ((): EditorBlockInput => ({ type, content: "" }));
  const isEmptyBlock = resolveIsEmptyBlock(options.isEmptyBlock, type);
  const slashCommand: ReactBlockSlashCommand = {
    title: "Markdown",
    group: "Turn into",
    keywords: [DEFAULT_WRITING_BLOCK_TYPE, "text"],
    ...options.slashCommand,
  };
  const render: BlockRenderer = options.render
    ?? (options.onMarkdownLinkClick
      ? (props) => createElement(MarkdownContent, { ...props, onLinkClick: options.onMarkdownLinkClick })
      : MarkdownContent);
  const restoreWriting = reactEditor.installDefaultWriting({ createDefaultBlock, isEmptyBlock });
  const unregisterBlock = reactEditor.blocks.register({
    definition: { type, title },
    render,
    slashCommand,
  });
  return () => {
    restoreWriting();
    unregisterBlock();
  };
}

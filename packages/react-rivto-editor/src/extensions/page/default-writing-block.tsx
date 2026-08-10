import type { EditorBlockInput } from "@chulane/rivto";
import { MarkdownContent } from "../../blocks/markdown";
import type { BlockRenderer, ReactBlockSlashCommand, ReactEditorExtension } from "../../managers";
import type { MarkdownLinkClick } from "../../types";
import {
  resolveIsEmptyBlock,
  type CreateDefaultBlock,
  type IsEmptyBlock,
} from "./empty-block";

export type { CreateDefaultBlock } from "./empty-block";

/**
 * Persisted native type installed by {@link defaultWritingBlockExtension} when
 * `type` is omitted.
 *
 * This module is the only place allowed to hardcode that string. Hosts and
 * plugins may import the constant for seed data or type checks; keyboard and
 * insert paths should still use `createDefaultBlock` / `isEmptyBlock` from the
 * runtime rather than closing over this value inside shared helpers.
 */
export const DEFAULT_WRITING_BLOCK_TYPE = "paragraph";

/** Configuration for the default writing block installed by React hosts. */
export interface DefaultWritingBlockOptions {
  /**
   * Persisted native type. Defaults to {@link DEFAULT_WRITING_BLOCK_TYPE}.
   */
  readonly type?: string;
  /** Human-readable name used by accessible UI and slash conversion. */
  readonly title?: string;
  /** Content renderer; defaults to Markdown. */
  readonly render?: BlockRenderer;
  /** Overrides fields of the built-in slash “turn into” conversion. */
  readonly slashCommand?: Partial<ReactBlockSlashCommand>;
  /** Factory used by Enter, trailing insert, separator follow-up, etc. */
  readonly createDefaultBlock?: CreateDefaultBlock;
  /**
   * Predicate for empty-block keyboard behavior.
   *
   * When `null` or omitted, uses empty content of {@link type}.
   */
  readonly isEmptyBlock?: IsEmptyBlock | null;
  /** Observes Markdown links and may prevent browser navigation for local routing. */
  readonly onMarkdownLinkClick?: (context: MarkdownLinkClick) => void;
}

/**
 * Registers the host writing block (definition, renderer, slash) and installs
 * `ReactEditor.createDefaultBlock` / `ReactEditor.isEmptyBlock`.
 *
 * This is the single React-layer place allowed to default the writing type to
 * {@link DEFAULT_WRITING_BLOCK_TYPE}. Downstream extensions read factories from
 * the runtime or receive them as arguments.
 */
export function defaultWritingBlockExtension(
  options: DefaultWritingBlockOptions = {},
): ReactEditorExtension {
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
      ? (props) => <MarkdownContent {...props} onLinkClick={options.onMarkdownLinkClick} />
      : MarkdownContent);

  return {
    id: "block.default-writing",
    setup: (reactEditor) => {
      reactEditor.installDefaultWriting({ createDefaultBlock, isEmptyBlock });
      return reactEditor.blocks.register({
        definition: { type, title },
        render,
        slashCommand,
      });
    },
  };
}

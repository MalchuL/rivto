/** Configuration and empty-block contracts for the default writing block. */
import type { EditorBlockInput } from "@chulane/rivto";
import type { BlockRenderer, ReactBlockSlashCommand } from "../../../../managers";
import type { MarkdownLinkClick } from "../../../../types";

/** Minimal block shape used by empty-block keyboard predicates. */
export interface EmptyBlockCandidate {
  readonly type: string;
  readonly content: string;
}

/** Host or built-in predicate for empty writing-block keyboard behavior. */
export type IsEmptyBlock = (block: EmptyBlockCandidate) => boolean;

/** Creates a detachable writing-block insert payload. */
export type CreateDefaultBlock = () => EditorBlockInput;

/** Configuration for the default writing block installed by React hosts. */
export interface DefaultWritingBlockOptions {
  /** Persisted native type. Defaults to the built-in paragraph type. */
  readonly type?: string;
  /** Human-readable name used by accessible UI and slash conversion. */
  readonly title?: string;
  /** Content renderer; defaults to Markdown. */
  readonly render?: BlockRenderer;
  /** Overrides fields of the built-in slash “turn into” conversion. */
  readonly slashCommand?: Partial<ReactBlockSlashCommand>;
  /** Factory used by Enter, trailing insert, separator follow-up, etc. */
  readonly createDefaultBlock?: CreateDefaultBlock;
  /** Predicate for empty-block keyboard behavior. */
  readonly isEmptyBlock?: IsEmptyBlock | null;
  /** Observes Markdown links and may prevent browser navigation for local routing. */
  readonly onMarkdownLinkClick?: (context: MarkdownLinkClick) => void;
}

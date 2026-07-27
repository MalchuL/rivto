import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { EditorBlock } from "@chulane/rivto";

/** Properties accepted by the stable DOM container for one editor block. */
export interface BlockViewProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Detached block snapshot whose identity and native type mark the container. */
  readonly block: EditorBlock;
  /** Content and nested block containers chosen by the active surface. */
  readonly children?: ReactNode;
  /**
   * Whether the active surface considers this complete block selected.
   *
   * This is presentation input, not selection storage. BlockView reflects it
   * as `data-block-selected` for CSS and delegated DOM integrations.
   */
  readonly isSelected?: boolean;
}

/**
 * Renders the stable DOM boundary for one editor block.
 *
 * BlockView owns only the DOM contract shared by every surface: a block ID,
 * block type, optional selection marker, forwarded ref, and ordinary div
 * attributes. Stable data attributes let delegated events and future plugins
 * locate a block without coupling them to CSS classes or renderer components.
 *
 * The component deliberately receives a detached block snapshot instead of
 * reading editor context. The active surface remains responsible for resolving
 * blocks, selecting a content renderer, arranging children, and deciding what
 * selection means in its mode. BlockView does not recurse, edit text, install
 * events, render handles, apply layout, or choose visual styles.
 *
 * `data-block-id`, `data-block-type`, and `data-block-selected` are controlled by
 * BlockView and therefore cannot be replaced through the remaining div props.
 * The selection marker is omitted when false so presence selectors such as
 * `[data-block-selected]` remain useful. The ref points to the actual block div for
 * focus management, geometry measurement, and DOM selection integration.
 *
 * @example
 * ```tsx
 * <BlockView block={block} isSelected={isSelected} className="paragraph">
 *   <ParagraphContent blockId={block.id} />
 * </BlockView>
 * ```
 */
export const BlockView = forwardRef<HTMLDivElement, BlockViewProps>(
  function BlockView({ block, children, isSelected = false, ...attributes }, ref) {
    return (
      <div
        {...attributes}
        ref={ref}
        data-block-id={block.id}
        data-block-type={block.type}
        data-block-selected={isSelected ? "true" : undefined}
      >
        {children}
      </div>
    );
  },
);

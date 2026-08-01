/**
 * Surface-to-extension boundary for rendering the structural shell of a block.
 *
 * Surfaces prepare semantic slots; extensions may replace the shell without
 * acquiring responsibility for renderer lookup or recursive traversal.
 *
 * @module
 */
import type { EditorBlock as Block } from "@chulane/rivto";
import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
  type RefCallback,
} from "react";
import { useEditorMode, useReactEditor } from "../hooks";

/**
 * Stable slots used by a surface to render one block shell.
 *
 * The shell owns renderer placement and recursive child traversal. It is
 * created exactly once, beneath every registered decorator.
 */
export interface BlockShellProps {
  /** Latest detached block snapshot resolved by the active surface. */
  readonly block: Block;
  /** Presentation state forwarded only to the surface-owned BlockView shell. */
  readonly isSelected: boolean;
  /** Renderer output for the block's own content, excluding descendants. */
  readonly content: ReactNode;
  /** Surface-owned controls, such as the page collapse toggle. */
  readonly controls?: ReactNode;
  /** Already-rendered descendants positioned according to surface policy. */
  readonly children?: ReactNode;
}

/**
 * Props received by each ordered block decorator.
 *
 * Decorators may add handles, overlays, React context boundaries, or measurement, but must
 * render `children` exactly once. They do not choose content renderers or
 * traverse descendants.
 */
export interface BlockWrapperProps {
  /** Latest detached block snapshot resolved by the active surface. */
  readonly block: Block;
  /** Next decorator, or the surface shell at the end of the chain. */
  readonly children: ReactNode;
}

/** React component decorating an already-rendered block layer. */
export type BlockWrapperComponent = ComponentType<BlockWrapperProps>;

/** Props used by the runtime-resolving BlockWrapper component. */
export interface BlockWrapperSlotProps extends BlockShellProps {
  /** Surface-owned rendering used when no extension contributes a wrapper. */
  readonly fallback: ComponentType<BlockShellProps>;
}

/** Ref callbacks contributed by decorators and ultimately attached to BlockView. */
const BlockElementRefContext = createContext<RefCallback<HTMLDivElement> | undefined>(undefined);

/** Properties for adding one decorator-owned BlockView ref callback. */
export interface BlockElementRefProviderProps {
  /** Callback notified with the stable BlockView DOM node and later null. */
  readonly elementRef: RefCallback<HTMLDivElement>;
  /** Remaining decorator chain and surface shell. */
  readonly children: ReactNode;
}

/**
 * Composes one decorator's DOM ref with refs from every outer decorator.
 *
 * Context keeps decorator composition DOM-free. The surface shell attaches the
 * final callback to its single BlockView, allowing multiple extensions to observe
 * the same stable element without cloning children or adding layout wrappers.
 *
 * @param props - Decorator callback and the remaining render chain.
 * @returns A context boundary that emits no DOM element.
 */
export function BlockElementRefProvider({
  elementRef,
  children,
}: BlockElementRefProviderProps) {
  const parentRef = useContext(BlockElementRefContext);
  const composedRef = useMemo<RefCallback<HTMLDivElement>>(
    () => (element) => {
      parentRef?.(element);
      elementRef(element);
    },
    [elementRef, parentRef],
  );
  return (
    <BlockElementRefContext.Provider value={composedRef}>
      {children}
    </BlockElementRefContext.Provider>
  );
}

/**
 * Resolves the composed decorator ref for the surface-owned BlockView.
 *
 * @returns Callback to forward to BlockView, or undefined without ref-using
 * decorators.
 */
export function useBlockElementRef(): RefCallback<HTMLDivElement> | undefined {
  return useContext(BlockElementRefContext);
}

/**
 * Prevents one block's decorator refs from leaking into recursive child blocks.
 *
 * Surfaces place this boundary around their rendered descendants. Each child
 * then establishes an independent decorator chain and ref composition scope.
 *
 * @param props - Recursively rendered surface children.
 * @returns A DOM-free context reset.
 */
export function BlockElementRefBoundary({
  children,
}: {
  readonly children?: ReactNode;
}) {
  return (
    <BlockElementRefContext.Provider value={undefined}>
      {children}
    </BlockElementRefContext.Provider>
  );
}

/**
 * Composes the active mode's decorators around one surface-owned block shell.
 *
 * Registration order defines nesting: the first registered decorator is
 * outermost, and the last is closest to the shell. Changing editor mode
 * immediately selects that mode's ordered wrapper list.
 *
 * @param props - Prepared block slots and the surface-owned fallback component.
 * @returns The shell wrapped by every registered decorator in stable order.
 */
export function BlockWrapper({
  fallback: Fallback,
  block,
  isSelected,
  ...slots
}: BlockWrapperSlotProps) {
  const reactEditor = useReactEditor();
  const { mode } = useEditorMode();
  const wrappers = reactEditor.surfaces.getBlockWrappers(mode);
  let result: ReactNode = (
    <Fallback block={block} isSelected={isSelected} {...slots} />
  );

  for (let index = wrappers.length - 1; index >= 0; index -= 1) {
    const Wrapper = wrappers[index]!;
    result = (
      <Wrapper block={block}>
        {result}
      </Wrapper>
    );
  }
  return result;
}

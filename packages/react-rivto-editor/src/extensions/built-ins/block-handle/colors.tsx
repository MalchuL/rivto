import { Input } from "../../../components/ui/input";
import { DropdownMenuLabel } from "../../../components/ui/dropdown-menu";
import { CheckIcon, PaletteIcon, SlashIcon } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { ReactEditorApi } from "../../../editor/types";
import type { BlockContextMenuContext } from "../../../managers/block-context-menu/types";
import { assertBlockMenuTargets } from "../../../managers/block-context-menu/targets";

import { Slider } from "../../../components/ui/slider";
import {
  BLOCK_BACKGROUND_COLORS,
  BLOCK_PALETTE_COLORS,
  formatBlockBackground,
  parseBlockBackground,
} from "../../../blocks/background-color";
import { isBlockStyle } from "../../../blocks/block-style";

/**
 * Reads a block's explicit background color for the menu.
 *
 * @param context - Panel owning the captured block.
 * @param id - Block whose local style is read.
 * @returns Palette value or an empty string when no supported background exists.
 */
function readBackground(context: BlockContextMenuContext, id: string): string {
  const value = context.reactPanel.page.getNode(id).getStyle().background?.color;
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase() === "#00000000" ? "transparent" : value;
}

/**
 * Checks that updating backgrounds cannot replace a non-record style value.
 *
 * @param context - Panel and targets captured by the current menu.
 * @returns Every target has an absent or object-shaped style.
 * @throws If a target has a non-record style that cannot be merged safely.
 */
function assertBackgroundStyles(context: BlockContextMenuContext): void {
  for (const id of context.blockIds) {
    const style = context.reactPanel.blocks.getBlockNode(id)?.listProps.style;
    if (style !== undefined && !isBlockStyle(style)) {
      throw new Error("Cannot update a non-object block style");
    }
  }
}

/**
 * Updates one captured block's background without replacing its other style properties.
 *
 * @param context - Captured panel and targets.
 * @param id - Block to update within that panel.
 * @param color - Palette value or custom color with alpha.
 * @returns The block style has been updated through its owning manager.
 * @throws If the block is unavailable or the update fails.
 */
function writeBackground(context: BlockContextMenuContext, id: string, color: string): void {
  const node = context.reactPanel.page.getNode(id);
  const style = node.getStyle();
  node.setStyle({
    ...style,
    background: {
      ...(typeof style.background === "object" &&
      style.background !== null &&
      !Array.isArray(style.background)
        ? style.background
        : {}),
      color: color === "transparent" ? "#00000000" : color,
    },
  });
}

/** Background swatches exposed in the block menu, in display order. */
const VISIBLE_BACKGROUND_COLORS = BLOCK_BACKGROUND_COLORS.filter(
  (color) => color && color !== "gray",
);

/**
 * Routes Tab between the background controls and ordinary menu items.
 *
 * @param event - Native key event captured on the owning menu.
 * @param group - Background controls within the menu.
 * @param menu - Menu owning the captured event and ordinary items.
 * @returns Focus moves when the event is an unmodified Tab in this menu.
 */
function routeBackgroundTab(event: KeyboardEvent, group: HTMLElement, menu: HTMLElement): void {
  if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest('[role="menu"]') !== menu) {
    return;
  }
  const controls = Array.from(
    group.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [role="slider"]:not([data-disabled])',
    ),
  );
  if (!controls.length) {
    return;
  }
  const index = controls.indexOf(target);
  let next: HTMLElement | undefined;
  if (index === -1) {
    next = event.shiftKey ? controls.at(-1) : controls[0];
  } else {
    next = controls[index + (event.shiftKey ? -1 : 1)];
    if (!next) {
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([data-disabled]), [role="menuitemcheckbox"]:not([data-disabled])',
        ),
      ).filter((item) => item.closest('[role="menu"]') === menu);
      next = event.shiftKey ? items.at(-1) : items[0];
    }
  }
  if (next) {
    event.preventDefault();
    event.stopPropagation();
    next.focus();
  }
}

/**
 * Lets Tab reach background controls without adding them to menu arrow navigation.
 *
 * The listener belongs to the enclosing menu and is removed with this control.
 * Shift+Tab visits the same controls in reverse; leaving the group returns focus
 * to an ordinary menu item. Nested menus keep their own keyboard behavior.
 *
 * @returns Ref for the background group whose controls participate in Tab navigation.
 */
function useBackgroundKeyboard() {
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const group = groupRef.current;
    const menu = group?.closest<HTMLElement>('[role="menu"]');
    if (!group || !menu) {
      return;
    }
    const routeTab = (event: KeyboardEvent) => routeBackgroundTab(event, group, menu);
    menu.addEventListener("keydown", routeTab, true);
    return () => menu.removeEventListener("keydown", routeTab, true);
  }, []);
  return groupRef;
}

/** Menu-owned pending custom-color update. */
interface BackgroundColorInput {
  /**
   * Queues the latest color for the next animation frame.
   *
   * @param color - Persistable color including its alpha.
   * @returns The pending update has been scheduled.
   * @throws If captured block targets are unavailable.
   */
  schedule(color: string): void;
  /**
   * Commits the pending color, if its captured targets still exist.
   *
   * @returns The pending update is applied or discarded for stale targets.
   */
  flush(): void;
}

/**
 * Coalesces native picker input into at most one document update per animation frame.
 *
 * Pending colors flush before other color controls and when the menu unmounts.
 * Missing targets discard the pending update rather than modifying other blocks.
 *
 * @param context - Captured panel and target IDs owned by the current menu.
 * @returns Functions for scheduling and flushing the latest custom color.
 */
function useBackgroundColorInput(context: BlockContextMenuContext): BackgroundColorInput {
  const current = useRef(context);
  current.current = context;
  const pending = useRef<string | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const flush = useCallback(() => {
    if (frame.current !== undefined) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
    const color = pending.current;
    pending.current = undefined;
    const { reactPanel, blockIds } = current.current;
    if (color === undefined || blockIds.some((id) => !reactPanel.blocks.hasBlock(id))) {
      return;
    }
    assertBackgroundStyles(current.current);
    reactPanel.batchUpdates(() => {
      for (const id of blockIds) {
        writeBackground(current.current, id, color);
      }
    });
  }, []);
  useEffect(() => () => flush(), [flush]);
  return {
    /**
     * Queues the latest picker value for the next frame.
     *
     * @param color - Persistable color including its alpha.
     * @returns The pending update has been scheduled.
     * @throws If a captured target is unavailable.
     */
    schedule(color) {
      assertBlockMenuTargets(current.current);
      pending.current = color;
      if (frame.current === undefined) {
        frame.current = requestAnimationFrame(flush);
      }
    },
    flush,
  };
}

/**
 * Checks whether every target uses the same custom color and alpha.
 *
 * @param values - Persisted backgrounds in target order.
 * @param color - Six-digit custom picker color to compare.
 * @param alpha - Alpha percentage that every target must share.
 * @returns True when each target's color and alpha match.
 */
function allMatchCustomColor(values: string[], color: string, alpha: number): boolean {
  return values.every((value) => {
    const parsed = parseBlockBackground(value);
    return parsed?.color.toLowerCase() === color.toLowerCase() && parsed?.alpha === alpha;
  });
}

/**
 * Reads captured block colors for React's external-store comparison.
 *
 * @param context - Captured target IDs and the panel used to read them.
 * @returns Comma-separated colors in target order; missing blocks or overrides contribute an empty string.
 */
function readBackgroundColors(context: BlockContextMenuContext): string {
  return context.blockIds.map((id) => readBackground(context, id)).join(",");
}

/**
 * Subscribes to the persisted background values captured by the menu.
 *
 * @param context - Panel and target IDs whose current colors are read.
 * @returns Comma-separated colors in target order, updated after document changes.
 */
function useBlockBackgroundColors(context: BlockContextMenuContext): string {
  const snapshot = () => readBackgroundColors(context);
  return useSyncExternalStore(
    (listener) => context.reactPanel.editor.subscribe(listener),
    snapshot,
    snapshot,
  );
}

/**
 * Renders inline background swatches for the captured explicit block targets.
 *
 * Subscribes to editor changes and derives the pressed swatch from all target
 * background values; mixed selections have no pressed swatch. Activation rechecks
 * target existence and batches color updates. Preset and custom selections keep
 * the menu open for further changes. No color sets an explicit
 * transparent background; new colored containers have an explicit initial color.
 * Descendant overrides are not rewritten.
 *
 * @param context - Panel and target IDs captured when the menu opened.
 * @returns A labeled group of color controls reachable with Tab.
 */
function BlockBackgroundColors(context: BlockContextMenuContext) {
  const colorInput = useBackgroundColorInput(context);
  const groupRef = useBackgroundKeyboard();
  const [palette, setPalette] = useState<Readonly<Record<string, string>>>(BLOCK_PALETTE_COLORS);
  useLayoutEffect(() => {
    const group = groupRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const painter = canvas.getContext("2d");
    if (!group || !painter) {
      return;
    }
    const next = { ...BLOCK_PALETTE_COLORS };
    for (const button of group.querySelectorAll<HTMLButtonElement>("[data-background-token]")) {
      const token = button.dataset.backgroundToken;
      if (!token || token === "transparent") {
        continue;
      }
      painter.clearRect(0, 0, 1, 1);
      painter.fillStyle = getComputedStyle(button).backgroundColor;
      painter.fillRect(0, 0, 1, 1);
      const bytes = painter.getImageData(0, 0, 1, 1).data;
      next[token] =
        `#${Array.from(bytes.slice(0, 3), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    setPalette(next);
  }, [groupRef]);
  const colors = useBlockBackgroundColors(context);
  const firstColor = colors.split(",")[0] ?? "";
  const background = parseBlockBackground(firstColor);
  const customColor =
    background?.color.startsWith("#") &&
    !Object.values(palette).includes(background.color.toLowerCase())
      ? background.color
      : "#d1d5db";
  const customSelected =
    !!background?.color.startsWith("#") &&
    !Object.values(palette).includes(background.color.toLowerCase()) &&
    allMatchCustomColor(colors.split(","), customColor, background.alpha);
  return (
    <div ref={groupRef} role="group" aria-label="Block background">
      <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
        Background
      </DropdownMenuLabel>
      <div className="block-color-swatches">
        {VISIBLE_BACKGROUND_COLORS.map((color, index) => (
          <Fragment key={color}>
            {index === 1 && (
              <CustomBackgroundColor
                value={customColor}
                selected={customSelected}
                alpha={background?.alpha ?? 100}
                colorInput={colorInput}
              />
            )}
            <BackgroundColorSwatch
              context={context}
              color={color}
              alpha={background?.alpha ?? 100}
              palette={palette}
              flushPendingColor={colorInput.flush}
            />
          </Fragment>
        ))}
      </div>
      <BackgroundAlpha
        context={context}
        value={background?.alpha ?? 100}
        color={background?.color}
        flushPendingColor={colorInput.flush}
      />
    </div>
  );
}

/** Inputs for the custom color control. */
interface CustomBackgroundColorProps {
  /** Current six-digit color, or the picker fallback. */
  readonly value: string;
  /** Whether all captured blocks use this custom color. */
  readonly selected: boolean;
  /** Alpha percentage retained when choosing a new custom color. */
  readonly alpha: number;
  /** Frame-coalesced document updates owned by the background menu. */
  readonly colorInput: BackgroundColorInput;
}

/**
 * Opens a native color picker for the captured blocks without closing the menu.
 *
 * @param props - Current picker color and menu-owned update scheduler.
 * @param props.value - Current custom color or fallback for the picker.
 * @param props.selected - Whether every captured block uses the custom color.
 * @param props.alpha - Alpha percentage preserved when the color changes.
 * @param props.colorInput - Menu-owned scheduler that coalesces pending color updates.
 * @returns Keyboard-accessible picker with a local preview and batched target updates.
 */
function CustomBackgroundColor({ value, selected, alpha, colorInput }: CustomBackgroundColorProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div
      role="group"
      className="block-color-swatch block-color-custom"
      data-selected={selected || undefined}
      aria-label={selected ? "Custom color, selected" : "Custom color"}
      style={{ "--block-background": draft } as CSSProperties}
    >
      <PaletteIcon className="block-color-custom-palette" aria-hidden="true" />
      {selected && <CheckIcon className="block-color-custom-check" aria-hidden="true" />}
      <Input
        type="color"
        aria-label="Custom background color"
        value={draft}
        onInput={(event) => {
          const color = event.currentTarget.value;
          setDraft(color);
          colorInput.schedule(formatBlockBackground(color, alpha));
        }}
        onBlur={colorInput.flush}
      />
    </div>
  );
}

/** Inputs for one preset background swatch. */
interface BackgroundColorSwatchProps {
  /** Captured menu targets and their panel. */
  readonly context: BlockContextMenuContext;
  /** Preset token, including transparent for no color. */
  readonly color: string;
  /** Current alpha retained when selecting another preset. */
  readonly alpha: number;
  /** Current concrete values resolved from the visible palette. */
  readonly palette: Readonly<Record<string, string>>;
  /** Flushes a pending custom color before selecting the preset. */
  readonly flushPendingColor: () => void;
}

/**
 * Applies a preset background to the captured blocks while keeping the menu open.
 *
 * @param props - Captured menu context and preset color.
 * @param props.context - Panel and target IDs captured when the menu opened.
 * @param props.color - Palette token, including transparent for no color.
 * @param props.alpha - Alpha percentage preserved for preset colors.
 * @param props.palette - Concrete colors resolved from the current theme.
 * @param props.flushPendingColor - Commits pending custom color before the preset is applied.
 * @returns A focusable swatch reflecting whether all targets use the preset.
 */
function BackgroundColorSwatch({
  context,
  color,
  alpha,
  palette,
  flushPendingColor,
}: BackgroundColorSwatchProps) {
  const { reactPanel, blockIds } = context;
  const selected = blockIds.every((id) => {
    const current = readBackground(context, id);
    return (
      current === color || parseBlockBackground(current)?.color.toLowerCase() === palette[color]
    );
  });
  return (
    <button
      className="block-color-swatch"
      data-background-token={color}
      type="button"
      aria-label={color === "transparent" ? "No color" : color}
      title={color === "transparent" ? "No color" : color}
      aria-pressed={selected}
      style={
        {
          backgroundColor: "var(--block-background)",
          "--block-background":
            color !== "transparent" ? `var(--rivto-block-${color})` : "transparent",
        } as CSSProperties
      }
      onClick={() => {
        flushPendingColor();
        assertBlockMenuTargets(context);
        assertBackgroundStyles(context);
        reactPanel.batchUpdates(() => {
          for (const id of blockIds) {
            writeBackground(
              context,
              id,
              color === "transparent" ? color : formatBlockBackground(palette[color]!, alpha),
            );
          }
        });
      }}
    >
      {color === "transparent" && <SlashIcon aria-hidden="true" />}
      {color !== "transparent" && selected && <CheckIcon aria-hidden="true" />}
    </button>
  );
}

/** Inputs for the background alpha slider. */
interface BackgroundAlphaProps {
  /** Captured block targets and the panel owning their mutations. */
  readonly context: BlockContextMenuContext;
  /** Current alpha percentage. */
  readonly value: number;
  /** Current base color, or undefined when no color is selected. */
  readonly color: string | undefined;
  /** Flushes a pending custom color before changing its alpha. */
  readonly flushPendingColor: () => void;
}

/**
 * Adjusts the alpha of the captured blocks' background colors.
 *
 * @param props - Captured targets, current percentage, and availability.
 * @param props.context - Panel and IDs whose existing colors are updated.
 * @param props.value - Current alpha percentage from zero to one hundred.
 * @param props.color - Base color used for the gradient; absent colors disable adjustment.
 * @param props.flushPendingColor - Commits pending color before applying alpha.
 * @returns A keyboard-accessible slider and percentage readout.
 */
function BackgroundAlpha({ context, value, color, flushPendingColor }: BackgroundAlphaProps) {
  return (
    <div
      className="block-color-alpha"
      onKeyDown={(event) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
        ) {
          event.stopPropagation();
        }
      }}
      style={
        {
          "--block-alpha-color": color?.startsWith("#")
            ? color
            : `var(--rivto-block-${color || "gray"})`,
        } as CSSProperties
      }
    >
      <span>Opacity</span>
      <Slider
        aria-label="Background opacity"
        value={[value]}
        min={0}
        max={100}
        disabled={!color}
        onValueChange={([alpha]) => {
          if (alpha !== undefined) {
            flushPendingColor();
            updateBackgroundAlpha(context, alpha);
          }
        }}
      />
      <span className="block-color-alpha-value">{value}%</span>
    </div>
  );
}

/**
 * Applies one alpha percentage to each target's existing background color.
 *
 * @param context - Captured panel and block IDs, checked again before mutation.
 * @param alpha - Integer percentage emitted by the slider.
 * @returns The background updates have completed in one history batch.
 * @throws If a captured target is no longer valid or an update fails.
 */
function updateBackgroundAlpha(context: BlockContextMenuContext, alpha: number): void {
  const { reactPanel, blockIds } = context;
  assertBlockMenuTargets(context);
  assertBackgroundStyles(context);
  reactPanel.batchUpdates(() => {
    for (const id of blockIds) {
      const current = readBackground(context, id);
      const parsed = parseBlockBackground(current);
      if (parsed) {
        writeBackground(context, id, formatBlockBackground(parsed.color, alpha));
      }
    }
  });
}

/**
 * Registers the inline menu renderer for a block's persisted style background.
 *
 * The palette accepts BLOCK_BACKGROUND_COLORS and six/eight-digit hex colors and
 * palette colors with alpha. Missing backgrounds have no local override. The custom
 * contribution mounts swatches in the active menu rather than introducing a submenu.
 *
 * @param editor - Runtime owning menu contributions and the shared document.
 * @returns No value; the menu registration is owned by the extension lifecycle.
 * @throws If registration is rejected by the context-menu registry.
 */
export function registerBlockBackground(editor: ReactEditorApi): void {
  editor.blockContextMenu.register({
    id: "block.background",
    title: "Background",
    kind: "custom",
    order: 10,
    /**
     * Mounts the inline palette for the currently open menu.
     *
     * @param context - Captured panel targets and the owning menu's close callback.
     * @returns The subscribed background-color control.
     */
    render: (context) => <BlockBackgroundColors {...context} />,
  });
}

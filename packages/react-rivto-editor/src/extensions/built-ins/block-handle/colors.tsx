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
import type { BlockContextMenuRegistration } from "./types";
import type { BlockContextMenuContext } from "../../../managers/block-context-menu/types";
import { assertBlockMenuTargets } from "../../../managers/block-context-menu/targets";

import { Slider } from "../../../components/ui/slider";
import {
  DEFAULT_BLOCK_BACKGROUND_COLORS,
  DEFAULT_BLOCK_PALETTE_COLORS,
} from "../../../blocks/style/background-color-constants";
import {
  formatBlockBackground,
  parseBlockBackground,
} from "../../../blocks/style/background-color";
import { isBlockStyle } from "../../../blocks/style/block-style";

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
 * Updates the captured blocks in one history batch after checking that every style can be merged.
 *
 * Callers resolve target availability before requesting the write. The alpha slider derives
 * a color from each individual block so mixed selections retain their hues.
 *
 * @param context - Panel and ordered targets captured when the menu opened.
 * @param colorForBlock - Computes the color to persist, or returns undefined to skip that block.
 * @returns All applicable targets have received the color while preserving other style properties.
 * @throws If an existing style is not an object or a delegated block command fails.
 */
function updateBackgroundColors(
  context: BlockContextMenuContext,
  colorForBlock: (blockId: string) => string | undefined,
): void {
  const { reactPanel, blockIds } = context;
  // Check every target before the first write; batching does not roll back an earlier block.
  for (const blockId of blockIds) {
    const style = reactPanel.blocks.getBlockNode(blockId)?.listProps.style;
    if (style !== undefined && !isBlockStyle(style)) {
      throw new Error("Cannot update a non-object block style");
    }
  }
  reactPanel.batchUpdates(() => {
    for (const blockId of blockIds) {
      const color = colorForBlock(blockId);
      if (color === undefined) {
        continue;
      }
      // Address the block's page presentation through the panel that opened the menu.
      const node = reactPanel.page.getNode(blockId);
      const style = node.getStyle();
      const background = style.background;
      node.setStyle({
        ...style,
        background: {
          ...(background && typeof background === "object" && !Array.isArray(background)
            ? background
            : {}),
          color: color === "transparent" ? "#00000000" : color,
        },
      });
    }
  });
}

/** Background swatches exposed in the block menu, in display order. */
const VISIBLE_BACKGROUND_COLORS = DEFAULT_BLOCK_BACKGROUND_COLORS.filter(
  (color) => color && color !== "gray",
);

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
  // Flush the latest native picker input before another control edits the same blocks.
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
    updateBackgroundColors(current.current, () => color);
  }, []);
  useEffect(() => () => flush(), [flush]);
  const colorInput: BackgroundColorInput = {
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
  // Route Tab within the open menu while keeping arrow navigation on menu items.
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const group = groupRef.current;
    const menu = group?.closest<HTMLElement>('[role="menu"]');
    if (!group || !menu) {
      return;
    }
    const routeTab = (event: KeyboardEvent) => {
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
    };
    menu.addEventListener("keydown", routeTab, true);
    return () => menu.removeEventListener("keydown", routeTab, true);
  }, []);

  const [palette, setPalette] = useState<Readonly<Record<string, string>>>(
    DEFAULT_BLOCK_PALETTE_COLORS,
  );
  useLayoutEffect(() => {
    const group = groupRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const painter = canvas.getContext("2d");
    if (!group || !painter) {
      return;
    }
    const next = { ...DEFAULT_BLOCK_PALETTE_COLORS };
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
  const snapshot = () => context.blockIds.map((id) => readBackground(context, id)).join(",");
  const colors = useSyncExternalStore(
    (listener) => context.reactPanel.editor.subscribe(listener),
    snapshot,
    snapshot,
  );
  const colorValues = colors.split(",");
  const firstColor = colorValues[0] ?? "";
  const background = parseBlockBackground(firstColor);
  const isCustomColor =
    background !== undefined &&
    background.color.startsWith("#") &&
    !Object.values(palette).includes(background.color.toLowerCase());
  const customColor = isCustomColor ? background.color : "#d1d5db";
  const customSelected =
    isCustomColor &&
    colorValues.every((value) => {
      const parsed = parseBlockBackground(value);
      return (
        parsed?.color.toLowerCase() === customColor.toLowerCase() &&
        parsed?.alpha === background.alpha
      );
    });
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
  /**
   * Flushes a pending custom color before selecting the preset.
   *
   * @returns Any queued color update has been applied.
   */
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
  const selected = context.blockIds.every((id) => {
    const current = readBackground(context, id);
    // An inherited background has no parsed color, and the transparent token has no
    // palette entry. Comparing those two missing values would select “No color”.
    return (
      current === color ||
      (palette[color] !== undefined &&
        parseBlockBackground(current)?.color.toLowerCase() === palette[color])
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
        const backgroundColor =
          color === "transparent" ? color : formatBlockBackground(palette[color]!, alpha);
        updateBackgroundColors(context, () => backgroundColor);
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
  /**
   * Flushes a pending custom color before changing its alpha.
   *
   * @returns Any queued color update has been applied.
   */
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
            // Each target keeps its own hue while the slider sets the same alpha for all.
            assertBlockMenuTargets(context);
            updateBackgroundColors(context, (blockId) => {
              const background = parseBlockBackground(readBackground(context, blockId));
              return background ? formatBlockBackground(background.color, alpha) : undefined;
            });
          }
        }}
      />
      <span className="block-color-alpha-value">{value}%</span>
    </div>
  );
}

/**
 * Registers the inline menu renderer for a block's persisted style background.
 *
 * The palette accepts DEFAULT_BLOCK_BACKGROUND_COLORS and six/eight-digit hex colors and
 * palette colors with alpha. Missing backgrounds have no local override. The custom
 * contribution mounts swatches in the active menu rather than introducing a submenu.
 *
 * @param menu - Extension-scoped registration for the block menu contribution.
 * @returns No value; the menu registration is owned by the extension lifecycle.
 * @throws If registration is rejected by the context-menu registry.
 */
export function registerBlockBackground(menu: BlockContextMenuRegistration): void {
  menu.register({
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

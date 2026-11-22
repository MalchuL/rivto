import type { BlockStructuralContext, BlockStructuralOutcome } from "@chulane/rivto";
/**
 * Bento board view: a flat grid whose tiles cannot Tab-indent or Tab-outdent.
 *
 * Enter on an empty board inserts the first tile. Nested containers inside a
 * tile keep their own views. Drag may relocate a tile onto the page, add a
 * sibling tile, or use an inside target to nest one tile inside another. Tile
 * boundaries keep sibling placement while nested child lists use their own policy.
 *
 * @module
 */
import { ContainerBlockBehavior } from "../../../block-behaviors/container-block-behavior";
import type { BlockChildBehaviorContext } from "@chulane/rivto";
import type { BlockInput } from "@chulane/document-model";
import type { EditorBlockInput } from "@chulane/rivto";
import { isBlockStyle } from "../../../blocks/style/block-style";
import {
  BENTO_ORIGINAL_WIDTH_PLUGIN_ID,
  BENTO_WIDTH_PLUGIN_ID,
  BENTO_ORIGINAL_HEIGHT_PLUGIN_ID,
  BENTO_HEIGHT_PLUGIN_ID,
} from "./bento-constants";
import { normalizeResizeWidth } from "../block-resize/block-resize-size";

/** Persisted native type shared by Bento rendering and behavior applicability. */
export const BENTO_BLOCK_TYPE = "bento";

/**
 * Behavior registered for the `bento` block type.
 */
export class BentoBehavior extends ContainerBlockBehavior {
  /**
   * Keeps tile boundary drops at the board's direct-child level.
   *
   * @returns Sibling-only boundary placement without restricting inside drops.
   */
  childDropPlacement(): "siblings" {
    return "siblings";
  }

  /**
   * Selects this native container independently of the registration's owner.
   * @param context - Current block fields; the registry also supplies each moved source and receiving parent separately.
   * @returns True only for the BENTO_BLOCK_TYPE native type.
   */
  override isAvailable(context: BlockInput): boolean {
    return context.type === BENTO_BLOCK_TYPE;
  }
  /**
   * Preserves the fixed depth of direct structural children.
   *
   * This outline restriction does not prevent independently permitted dragging.
   * The handler rejects the complete requested group before child behavior runs.
   *
   * @param context - Current container fields and the live invoking panel.
   * @param ids - Complete child group requested by the outline operation.
   * @returns Rejected without mutating the document.
   */
  onChildIndent(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome {
    return "rejected";
  }
  /**
   * Keeps direct children within this container during outline outdent.
   *
   * This outline restriction does not prevent independently permitted dragging.
   * The handler rejects the complete requested group before child behavior runs.
   *
   * @param context - Current container fields and the live invoking panel.
   * @param ids - Complete child group requested by the outline operation.
   * @returns Rejected without mutating the document.
   */
  onChildOutdent(context: BlockStructuralContext, ids: readonly string[]): BlockStructuralOutcome {
    return "rejected";
  }

  /**
   * Saves a child's previous style dimensions and applies its Bento placement size.
   *
   * Imported blocks are first normalized by the Bento creation processor. This
   * hook then reapplies their saved Bento size when the destination is a Bento.
   *
   * @param context - Detached child and the parent transition being prepared.
   * @returns Child data with original dimensions and Bento preferences retained in plugin data.
   * @throws If existing style data cannot be safely merged.
   */
  onChildEnter(context: BlockChildBehaviorContext): EditorBlockInput {
    const { child } = context;
    const style = child.listProps?.style;
    if (style !== undefined && !isBlockStyle(style)) {
      throw new Error("Cannot apply Bento width to a non-object style");
    }
    const size = style?.size;
    if (size !== undefined && (typeof size !== "object" || size === null || Array.isArray(size))) {
      throw new Error("Cannot apply Bento width to a non-object size style");
    }
    const saved = child.pluginData?.[BENTO_ORIGINAL_WIDTH_PLUGIN_ID];
    let original: unknown = saved;
    if (!saved || typeof saved !== "object" || Array.isArray(saved) || !("present" in saved)) {
      original =
        size && Object.hasOwn(size, "width")
          ? { present: true, value: size.width }
          : { present: false };
    }
    const width = normalizeResizeWidth(child.pluginData?.[BENTO_WIDTH_PLUGIN_ID]);
    const originalHeight = child.pluginData?.[BENTO_ORIGINAL_HEIGHT_PLUGIN_ID] ?? {
      height: size && Object.hasOwn(size, "height") ? { value: size.height } : {},
      policy: size && Object.hasOwn(size, "heightPolicy") ? { value: size.heightPolicy } : {},
    };
    const savedHeight = child.pluginData?.[BENTO_HEIGHT_PLUGIN_ID];
    const height =
      savedHeight &&
      typeof savedHeight === "object" &&
      !Array.isArray(savedHeight) &&
      "height" in savedHeight &&
      typeof savedHeight.height === "string"
        ? {
            height: savedHeight.height,
            ...("heightPolicy" in savedHeight &&
            (savedHeight.heightPolicy === "grow" ||
              savedHeight.heightPolicy === "scroll" ||
              savedHeight.heightPolicy === "clip")
              ? { heightPolicy: savedHeight.heightPolicy }
              : {}),
          }
        : {};
    return {
      ...child,
      listProps: {
        ...child.listProps,
        style: { ...style, size: { ...size, ...height, width: `${width}px` } },
      },
      pluginData: {
        ...child.pluginData,
        [BENTO_WIDTH_PLUGIN_ID]: width,
        [BENTO_ORIGINAL_WIDTH_PLUGIN_ID]: original,
        [BENTO_ORIGINAL_HEIGHT_PLUGIN_ID]: originalHeight,
      },
    };
  }

  /**
   * Restores the style dimensions captured before this child entered Bento.
   *
   * @param context - Detached child and the parent transition being prepared.
   * @returns Child data with its original style dimensions restored, or unchanged legacy data.
   * @throws If existing style data cannot be safely merged.
   */
  onChildExit(context: BlockChildBehaviorContext): EditorBlockInput {
    return restoreBentoSize(context.child);
  }
}

/**
 * Restores active Bento dimension overrides on detached child data.
 *
 * This is also used when preparing copied or cut blocks before their destination
 * is known, so a pasted root does not retain a former container's width.
 * Cross-document imports use the same processor when Bento is installed in the
 * receiving editor; source onChildExit runs later and cannot update that copy.
 * Without saved original dimensions, this function leaves the child unchanged.
 *
 * @param child - Detached child carrying optional Bento dimension metadata.
 * @returns A copy with its previous style dimensions restored, or unchanged legacy data.
 * @throws If existing style data cannot be safely merged.
 */
export function restoreBentoSize(child: EditorBlockInput): EditorBlockInput {
  const original = child.pluginData?.[BENTO_ORIGINAL_WIDTH_PLUGIN_ID];
  const originalHeight = child.pluginData?.[BENTO_ORIGINAL_HEIGHT_PLUGIN_ID];
  const hasWidth =
    original &&
    typeof original === "object" &&
    !Array.isArray(original) &&
    "present" in original &&
    (original.present === false || (original.present === true && "value" in original));
  const hasHeight =
    originalHeight && typeof originalHeight === "object" && !Array.isArray(originalHeight);
  if (!hasWidth && !hasHeight) {
    return child;
  }
  const style = child.listProps?.style;
  if (
    !isBlockStyle(style) ||
    !style.size ||
    typeof style.size !== "object" ||
    Array.isArray(style.size)
  ) {
    throw new Error("Cannot restore Bento width from a non-object size style");
  }
  const size = { ...style.size };
  if (hasWidth) {
    if (original.present === true && "value" in original) {
      Object.assign(size, { width: original.value });
    } else {
      delete size.width;
    }
  }
  if (hasHeight) {
    for (const [key, field] of [
      ["height", "height"],
      ["heightPolicy", "policy"],
    ] as const) {
      const saved: unknown = Object.entries(originalHeight).find(([name]) => name === field)?.[1];
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        if ("value" in saved) {
          Object.assign(size, { [key]: saved.value });
        } else {
          delete size[key];
        }
      }
    }
  }
  return {
    ...child,
    listProps: { ...child.listProps, style: { ...style, size } },
    pluginData: {
      ...child.pluginData,
      ...(hasWidth ? { [BENTO_ORIGINAL_WIDTH_PLUGIN_ID]: null } : {}),
      ...(hasHeight ? { [BENTO_ORIGINAL_HEIGHT_PLUGIN_ID]: null } : {}),
    },
  };
}

/** Shared instance registered by {@link bentoExtension}. */
export const bentoBehavior = new BentoBehavior();

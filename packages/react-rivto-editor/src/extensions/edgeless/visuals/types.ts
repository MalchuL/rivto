import type {
  EdgelessFontOption,
  EdgelessStickerOption,
  OrphanConnectorBehavior,
} from "../../../elements/visuals/types";

/** Configuration accepted by {@link edgelessVisualsExtension}. */
export interface EdgelessVisualsOptions {
  readonly fonts?: readonly EdgelessFontOption[];
  readonly stickers?: readonly EdgelessStickerOption[];
  readonly orphanConnectors?: OrphanConnectorBehavior;
  readonly toolbar?: boolean;
}

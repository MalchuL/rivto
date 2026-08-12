import type {
  BlockDefinition,
  BlockListProps,
} from "@chulane/rivto";
import type { SlashCommandContext } from "../slash";
import type { BlockRenderer } from "./renderer-types";

/** Optional slash conversion installed with a React block registration. */
export interface ReactBlockSlashCommand {
  /** Stable command ID; defaults to `type.<block type>`. */
  readonly id?: string;
  /** User-visible command label. */
  readonly title: string;
  /** Optional menu group used by the slash popup. */
  readonly group?: string;
  /** Alternative normalized search terms. */
  readonly keywords?: readonly string[];
  /** Additional contextual condition evaluated after type eligibility. */
  readonly isAvailable?: (context: SlashCommandContext) => boolean;
}

/** Atomic model, renderer, and conversion registration for one block type. */
export interface ReactBlockRegistration {
  /** Framework-neutral definition registered with the core block registry. */
  readonly definition: BlockDefinition;
  /** React content renderer selected by all registered surfaces. */
  readonly render: BlockRenderer;
  /** Optional in-place conversion entry added to the shared slash manager. */
  readonly slashCommand?: ReactBlockSlashCommand;
  /** Whether root blocks of this type partition React's edgeless block elements. */
  readonly separatesBlockElements?: boolean;
}

/** React-owned defaults and semantic validation for opaque list properties. */
export interface ListPropsRegistration {
  /** Stable ID used for capability checks and duplicate prevention. */
  readonly id: string;
  /** Defaults shallowly merged in extension registration order. */
  readonly defaults?: BlockListProps;
  /** Accepts or rejects the complete resulting property record without transforming it. */
  readonly validate?: (candidate: BlockListProps) => boolean;
}

/** Best-effort result for one React block-mutation batch entry. */
export interface BlockMutationEntryResult {
  /** Zero-based position of the request in its input batch. */
  readonly index: number;
  /** Persisted block identifier supplied by the caller. */
  readonly id: string;
  /** Whether this individual request was committed or ignored. */
  readonly status: "applied" | "skipped";
  /** Reason for a skipped request; absent when applied. */
  readonly reason?: "missing" | "invalid";
}

/** Result preserving the position and outcome of every best-effort request. */
export interface BlockMutationResult {
  /** Entry results in the same order as the input batch. */
  readonly results: readonly BlockMutationEntryResult[];
}

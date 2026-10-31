import type { CSSProperties, ReactNode } from "react";

/** Typed CSS parameters inherited by structural blocks, controls, and slots. */
export interface BlockEditorTheme extends CSSProperties {
  /** Cursor while the configured block-selection binding is held; defaults to pointer. */
  readonly "--rivto-selection-cursor"?: CSSProperties["cursor"];
  /** Inset drop edge thickness in local CSS pixels; defaults to 12px, without changing layout. */
  readonly "--rivto-drop-target-size"?: string;
  /** Shared row padding, including its content and in-flow controls; defaults to 16px. */
  readonly "--rivto-block-padding"?: string;
  /** Spacing above outline children and between editor sections; defaults to 4px. Inset interaction edges use --rivto-drop-target-size independently of this spacing. */
  readonly "--rivto-block-gap"?: string;
  /** Logical indentation of a child group; defaults to 28px. */
  readonly "--rivto-block-indent"?: string;
  /** Inline inset in local pixels for horizontal insertion lines; defaults to zero. */
  readonly "--rivto-block-drop-line-inset"?: string;
  /** Extra pointer distance in local pixels before selecting child placement; defaults to zero. */
  readonly "--rivto-block-drop-child-offset"?: string;
  /** Gap between row slots/content and between controls; defaults to 4px. */
  readonly "--rivto-slot-gap"?: string;
  /** Minimum first-line height for the row and flow slots; defaults to 24px. */
  readonly "--rivto-default-block-height"?: string;
  /** Checkbox and collapse button size; defaults to 20px. */
  readonly "--rivto-block-control-size"?: string;
  /** Reserved numeric-marker width; defaults to 24px. */
  readonly "--rivto-block-marker-width"?: string;
  /** Minimum start-slot width; defaults to control size + marker width + slot gap. */
  readonly "--rivto-block-start-width"?: string;
  /** Selection outline color; defaults to #4868d8. */
  readonly "--rivto-block-selection"?: string;
  /** Background fill shared by a selected subtree and participating layout surfaces; omitted preserves their own backgrounds. */
  readonly "--rivto-block-selection-background"?: string;
  /** Block background corner radius; defaults to 10px. */
  readonly "--rivto-block-radius"?: string;
  /** Optional block border shorthand; defaults to none. */
  readonly "--rivto-block-border"?: string;
  /** Default block background used when the host supplies no color; defaults to white. */
  readonly "--rivto-background"?: string;
  /** Default editor foreground; defaults to #172033. */
  readonly "--rivto-block-foreground"?: string;
  /** Optional common block background override; inherited by blocks in the themed subtree. */
  readonly "--rivto-block-background"?: string;
}

/** Optional theme container around one or several autonomous block editors. */
export interface BlockEditorThemeProviderProps {
  /** CSS lengths/expressions and colors; omitted values use package stylesheet defaults. */
  readonly theme?: BlockEditorTheme;
  readonly children?: ReactNode;
}

/**
 * Applies public geometry and background parameters through ordinary DOM inheritance.
 *
 * Import the package stylesheet for defaults. A provider is optional; values can
 * also be set on an application theme ancestor. Nested providers override supplied
 * values and inherit the rest. This component does not bridge detached portals.
 *
 * @param props - Theme parameters and the editor subtree to customize.
 * @param props.theme - CSS lengths with units/expressions, colors, and optional container styles.
 * @param props.children - One or more editors or application wrappers receiving these variables.
 * @returns A theme container without subscribing to or recreating editor controllers.
 */
export function BlockEditorThemeProvider({ theme, children }: BlockEditorThemeProviderProps) {
  return <div style={theme}>{children}</div>;
}

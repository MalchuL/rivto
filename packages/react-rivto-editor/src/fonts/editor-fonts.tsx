import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { EdgelessFontOption } from "../elements/visuals/types";
import { DEFAULT_FONTS } from "../elements/visuals/presets";

/**
 * CSS custom property set on each panel root and consumed by block content wrappers.
 * Changing it updates inherited typography without rerendering every block renderer;
 * the panel restores the previous inline value when its root or configuration changes.
 */
export const EDITOR_CONTENT_FONT_PROPERTY = "--rivto-content-font-family";

/**
 * Application-owned font choices and the CSS family inherited by ordinary block content.
 * This is React presentation configuration, not persisted document metadata. Font files,
 * their loading, and any saved application preferences remain application-owned.
 */
export interface EditorFonts {
  /**
   * Complete available catalog; font files must be loaded by the application.
   * A provider requires at least one entry, with nonempty, unique fontFamily strings.
   * Built-ins are not appended. Treat the array and entries as immutable and replace
   * the array when changing choices; removal does not rewrite persisted element fonts.
   */
  readonly fonts: readonly EdgelessFontOption[];
  /**
   * CSS family stack of one catalog entry, including any browser fallbacks.
   * Must exactly match that entry's fontFamily string; array order does not select
   * the default. Ordinary blocks inherit it, while existing elements retain their
   * saved font and panel-local creation choices may override it for new elements.
   */
  readonly defaultFontFamily: string;
}

const EditorFontsContext = createContext<EditorFonts>({
  fonts: DEFAULT_FONTS,
  defaultFontFamily: DEFAULT_FONTS[0]!.fontFamily,
});

/** Properties for a shared, reactive application font configuration. */
export interface EditorFontsProviderProps extends EditorFonts {
  /** Panels, embeds, and custom renderers receiving this configuration. */
  readonly children?: ReactNode;
}

/**
 * Provides the complete font catalog to descendant editors without loading font files.
 *
 * Replace the fonts array to update mounted pickers. Changing the default updates
 * inherited block typography and unmodified creation defaults, without rewriting
 * persisted element fonts or adding document history. Nested providers are independent.
 * The nearest provider applies to panels and embeds in its React subtree, including
 * their portalled controls. Removing a font hides it from available choices; a saved
 * or remembered unlisted font remains visible as the current picker value.
 *
 * Code content retains its monospace styling and editor controls retain their UI
 * typography. Auto-height cards can remeasure and save derived heights when text
 * reflows; those measurements bypass undo history. Explicit renderer font styles
 * take precedence over inherited block typography.
 *
 * @param props - Catalog, default family, and editor subtree; built-ins are not appended.
 * @param props.fonts - Immutable complete catalog; replace the array to add, remove, or rename choices.
 * @param props.defaultFontFamily - Exact catalog family stack used for inherited block text and unmodified creation defaults.
 * @param props.children - Panels, embeds, or custom controls receiving the configuration.
 * @returns A DOM-free configuration boundary; it neither loads fonts nor creates editor runtimes.
 * @throws If the catalog is empty, contains empty or duplicate family strings, or excludes the default family string.
 */
export function EditorFontsProvider({
  fonts,
  defaultFontFamily,
  children,
}: EditorFontsProviderProps) {
  const value = useMemo(() => {
    const families = new Set(fonts.map((font) => font.fontFamily));
    if (
      fonts.length === 0 ||
      families.size !== fonts.length ||
      fonts.some((font) => !font.fontFamily.trim()) ||
      !families.has(defaultFontFamily)
    ) {
      throw new Error("Editor fonts require unique nonempty families and a default in the catalog");
    }
    return { fonts, defaultFontFamily };
  }, [fonts, defaultFontFamily]);
  return <EditorFontsContext.Provider value={value}>{children}</EditorFontsContext.Provider>;
}

/**
 * Reads application font choices for a custom block, element, or font control.
 *
 * Does not require a panel context. React consumers update when the nearest provider's
 * catalog or default changes. The returned configuration and catalog entries are shared;
 * treat them as read-only rather than editing them to change application settings.
 *
 * @returns Nearest provider configuration, or the built-in Sans/Serif/Mono catalog
 * and Sans default without a provider. Font files are not loaded by this hook.
 */
export function useEditorFonts(): EditorFonts {
  return useContext(EditorFontsContext);
}

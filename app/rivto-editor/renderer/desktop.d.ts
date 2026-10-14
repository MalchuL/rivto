/** Explicit renderer privileges exposed by the isolated Electron preload. */
export {};
declare global {
  interface Window {
    desktop: {
      /**
       * Opens the native document picker and reads the selected file.
       *
       * @returns Selected path, file name, and text, or null if the picker is cancelled.
       */
      open(): Promise<{ path: string; name: string; text: string } | null>;
      /**
       * Writes text through the native save dialog or the supplied path.
       *
       * @param input - Save path, suggested file name, and serialized text; markdown requests Markdown export.
       * @returns Saved path and file name, or null when saving is cancelled.
       */
      save(input: {
        path?: string;
        name: string;
        text: string;
        markdown?: boolean;
      }): Promise<{ path: string; name: string } | null>;
      /**
       * Asks whether to save, discard, or cancel replacement of the current document.
       *
       * @returns Native dialog button index used by the renderer to choose its next action.
       */
      confirmReplace(): Promise<number>;
      /**
       * Requests closing the native desktop window.
       */
      close(): Promise<void>;
      /**
       * Registers the renderer's handler for a native window-close request.
       *
       * @param callback - Callback invoked when the native window requests closing.
       * @returns A function that removes the handler.
       */
      onClose(callback: () => void): () => void;
    };
  }
}

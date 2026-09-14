/** Explicit renderer privileges exposed by the isolated Electron preload. */
export {};
declare global {
  interface Window {
    desktop: {
      open(): Promise<{ path: string; name: string; text: string } | null>;
      save(input: { path?: string; name: string; text: string; markdown?: boolean }): Promise<{ path: string; name: string } | null>;
      confirmReplace(): Promise<number>;
      close(): Promise<void>;
      onClose(callback: () => void): () => void;
    };
  }
}

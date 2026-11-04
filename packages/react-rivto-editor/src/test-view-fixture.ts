import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor } from "./test-utils";
import type { BinaryProvider } from "./attachments";

/** Mounted editor resources owned by one browser-environment test. */
interface TestViewFixture {
  readonly panel: ReturnType<typeof createTestReactEditor>;
  readonly container: HTMLDivElement;
  readonly root: Root;
  /**
   * Unmounts the view, releases test registrations, and destroys the editor.
   *
   * @param release - Optional registration cleanup to run after unmounting.
   * @returns A promise resolving after the editor and fixture globals are restored.
   */
  readonly dispose: (release?: () => void) => Promise<void>;
}

/**
 * Enables React's test environment and supplies jsdom's missing abort check.
 *
 * @returns A disposer restoring the previous global settings.
 */
function prepareBrowserTest(): () => void {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  const originalThrowIfAborted = Object.getOwnPropertyDescriptor(
    AbortSignal.prototype,
    "throwIfAborted",
  );
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  if (!originalThrowIfAborted) {
    Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
      configurable: true,
      /**
       * Provides jsdom's missing signal check for this fixture.
       *
       * @returns Completes when the signal is active.
       * @throws If the signal has been aborted.
       */
      value() {
        if (this.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
      },
    });
  }
  return () => {
    if (!originalThrowIfAborted) {
      Reflect.deleteProperty(AbortSignal.prototype, "throwIfAborted");
    }
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  };
}

/**
 * Creates a mounted-view fixture with its own editor and React root.
 *
 * The caller owns the returned fixture and must dispose it after the test.
 *
 * @returns A promise resolving to the panel, container, root, and cleanup operation.
 */
export async function createTestViewFixture(): Promise<TestViewFixture> {
  const restore = prepareBrowserTest();
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const container = document.createElement("div");
  const root = createRoot(container);
  return {
    panel,
    container,
    root,
    /**
     * Releases the mounted view and editor resources in ownership order.
     *
     * @param release - Optional registration cleanup to run after unmounting.
     * @returns A promise resolving once the editor and global settings are restored.
     */
    async dispose(release) {
      try {
        act(() => root.unmount());
        release?.();
        await panel.editor.destroy();
        await core.destroy();
      } finally {
        restore();
      }
    },
  };
}

/** Pending provider read and the signals passed to it. */
interface PendingBinaryRead {
  readonly provider: BinaryProvider;
  readonly signals: AbortSignal[];
}

/** Options for a provider used by mounted-view cancellation tests. */
interface PendingBinaryReadOptions {
  readonly skipFirstRead?: boolean;
}

/**
 * Creates a provider whose claimed reads reject when their signal is aborted.
 *
 * The first read may be left unclaimed so an image can use its browser URL before
 * a later copy starts the pending provider read.
 *
 * @param options - Whether the first read should be left unclaimed.
 * @returns The provider and the signals used for its pending reads.
 */
export function createPendingBinaryRead(options: PendingBinaryReadOptions = {}): PendingBinaryRead {
  const signals: AbortSignal[] = [];
  let reads = 0;
  return {
    signals,
    provider: {
      /**
       * Provides an unused stable URI to satisfy the storage contract.
       *
       * @returns A promise resolving to the fixture URI.
       */
      write: async () => "test:file",
      /**
       * Leaves the optional first read unclaimed and waits for cancellation thereafter.
       *
       * @param _uri - Reference supplied by the view.
       * @param context - Operation context containing the cancellation signal.
       * @returns A promise resolving to undefined for the optional first read; later reads reject on cancellation.
       * @throws When a pending read is aborted.
       */
      read: async (_uri, { signal }) => {
        if (++reads === 1 && options.skipFirstRead) {
          return undefined;
        }
        signals.push(signal);
        return new Promise<Blob>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            {
              once: true,
            },
          );
        });
      },
    },
  };
}

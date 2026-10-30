import type { CDPSession, Locator } from "@playwright/test";

/** Drives an empty editable's composition through Chromium or explicit DOM events. */
export class Composition {
  private started = false;
  private text = "";

  /**
   * Borrows one focused empty editable and an optional Chromium protocol session.
   *
   * Firefox uses explicit events to verify the editor contract, not an OS IME.
   * The caller owns the protocol session and detaches it after the test.
   *
   * @param content - Empty editable that retains focus throughout composition.
   * @param session - Chromium session; omitted for DOM-event integration coverage.
   */
  constructor(
    private readonly content: Locator,
    private readonly session?: Pick<CDPSession, "send">,
  ) {}

  /**
   * Replaces the candidate without asking the editor to persist intermediate text.
   *
   * @param text - Complete candidate replacing the previous composition range.
   * @returns Resolves after the browser has received the candidate and input events.
   * @throws Propagates browser input or evaluation failures.
   */
  async update(text: string): Promise<void> {
    if (this.session) {
      await this.session.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    } else {
      await this.content.evaluate(
        (element, { text, started }) => {
          if (!started) {
            element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
          }
          element.dispatchEvent(
            new CompositionEvent("compositionupdate", { bubbles: true, data: text }),
          );
          element.dispatchEvent(
            new InputEvent("beforeinput", {
              bubbles: true,
              inputType: "insertCompositionText",
              data: text,
              isComposing: true,
            }),
          );
          element.textContent = text;
          const selection = element.ownerDocument.getSelection()!;
          selection.selectAllChildren(element);
          selection.collapseToEnd();
          element.dispatchEvent(
            new InputEvent("input", { bubbles: true, data: text, isComposing: true }),
          );
        },
        { text, started: this.started },
      );
    }
    this.started = true;
    this.text = text;
  }

  /**
   * Ends composition with the current candidate or restores the initially empty text.
   *
   * @param cancel - Discards the candidate when true; otherwise commits it.
   * @returns Resolves after compositionend has reached the editable's handlers.
   * @throws Propagates browser input or evaluation failures.
   */
  async finish(cancel = false): Promise<void> {
    if (this.session) {
      if (cancel) {
        await this.session.send("Input.imeSetComposition", {
          text: "",
          selectionStart: 0,
          selectionEnd: 0,
        });
      } else {
        await this.session.send("Input.insertText", { text: this.text });
      }
    } else {
      if (cancel) {
        await this.update("");
      }
      await this.content.evaluate((element, text) => {
        element.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: text }),
        );
      }, this.text);
    }
    this.started = false;
    this.text = "";
  }
}

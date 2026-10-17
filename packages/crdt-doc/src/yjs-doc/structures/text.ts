import { BasicType, CRDTText, CRDTTextDelta } from "../../types";
import * as Y from "yjs";
import { YjsBasic } from "./basic";
import { YjsNotAttachedError } from "../error";

const NOT_ATTACHED_ERROR =
  "YjsText is not attached to a document. Add this text to any object that is attached to a document like a YjsMap or a YjsArray";
const IS_FROM_JSON_ERROR =
  NOT_ATTACHED_ERROR +
  " and this text was created from JSON. Add this text to any object that is attached to a document like a YjsMap or a YjsArray";

export class YjsText extends YjsBasic<Y.Text> implements CRDTText {
  // If the text was created from JSON, then it is not attached to a document.
  private isFromJson: boolean = false;

  /**
   * Creates a new YjsText.
   * @param yText - The Y.Text to wrap.
   */
  constructor(yText?: Y.Text) {
    const yTextInstance = yText || new Y.Text();
    super(yTextInstance);
  }

  /**
   * Inserts text at the given position.
   * @param pos - The position to insert the text at.
   * @param text - The text to insert.
   */
  insert(pos: number, text: string, attributes?: Record<string, unknown>): void {
    this.yjsObj.insert(pos, text, attributes);
  }

  /**
   * Deletes text at the given position.
   * @param pos - The position to delete the text at.
   * @param length - The length of the text to delete.
   */
  delete(pos: number, length: number): void {
    this.yjsObj.delete(pos, length);
  }

  /**
   * Applies formatting attributes to a range of the wrapped Yjs text.
   *
   * @param pos - Zero-based start offset in UTF-16 code units.
   * @param length - Number of UTF-16 code units to format.
   * @param attributes - Formatting attributes to apply to the range.
   */
  format(pos: number, length: number, attributes: Record<string, unknown>): void {
    this.yjsObj.format(pos, length, attributes);
  }

  /**
   * Converts native text deltas to string inserts, omitting embedded non-string values.
   *
   * @returns Text and formatting deltas.
   * @throws If the text is not attached to a document.
   */
  toDelta(): CRDTTextDelta[] {
    this.checkIfNotAttached();
    return this.yjsObj
      .toDelta()
      .flatMap((part: { insert: unknown; attributes?: Record<string, unknown> }) =>
        typeof part.insert === "string"
          ? [
              {
                insert: part.insert,
                attributes: part.attributes as Record<string, unknown> | undefined,
              },
            ]
          : [],
      );
  }

  /**
   * Gets the length of the text.
   * @returns The length of the text.
   */
  get length(): number {
    this.checkIfNotAttached();
    return this.yjsObj.length;
  }

  /**
   * Converts the text to a string.
   * @returns The string.
   */
  toString(): string {
    this.checkIfNotAttached();
    return this.yjsObj.toString();
  }

  /**
   * Converts the text to a JSON representation.
   * @returns The BasicType.
   */
  toJSON(): BasicType {
    this.checkIfNotAttached();
    return this.yjsObj.toJSON();
  }

  /**
   * Anchors a UTF-16 boundary to the current collaborative text.
   *
   * @param offset - Integer boundary between zero and the current text length.
   * @param association - Zero follows the character after the boundary; -1 follows the preceding character.
   * @returns Opaque JSON-compatible token for resolving against this same text.
   * @throws If the text is detached or the offset is invalid.
   */
  createRelativePosition(offset: number, association: -1 | 0 = 0): string {
    this.checkIfNotAttached();
    if (!Number.isInteger(offset) || offset < 0 || offset > this.length) {
      throw new RangeError("Text position is outside the current content");
    }
    return JSON.stringify(Y.createRelativePositionFromTypeIndex(this.yjsObj, offset, association));
  }

  /**
   * Resolves an opaque anchor against this text's current document.
   *
   * @param position - Token previously created from this shared text.
   * @returns Current UTF-16 offset, or undefined for malformed, deleted, or foreign-text anchors.
   */
  resolveRelativePosition(position: string): number | undefined {
    if (!this.yjsObj.doc) {
      return undefined;
    }
    try {
      const relative = Y.createRelativePositionFromJSON(JSON.parse(position));
      const absolute = Y.createAbsolutePositionFromRelativePosition(relative, this.yjsObj.doc);
      return absolute?.type === this.yjsObj ? absolute.index : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Checks if the text is not attached to a document.
   */
  private checkIfNotAttached(): void {
    if (!this.isAttached) {
      throw new YjsNotAttachedError(this.isFromJson ? IS_FROM_JSON_ERROR : NOT_ATTACHED_ERROR);
    }
  }
}

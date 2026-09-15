import * as Y from "yjs";
import { BasicType } from "../../../types";

/**
 * YJSType is a type that represents a YJS type.
 * - Y.Map<YJSType | unknown>
 * - Y.Array<YJSType | unknown>
 * - Y.Text
 * - YJSType[]
 * - BasicType
 */
export type YJSType =
  | Y.Map<YJSType | unknown>
  | Y.Array<YJSType | unknown>
  | Y.Text
  | YJSType[]
  | BasicType
  // Map<string, YJSType> is not supported, because it's not a valid YJS type.
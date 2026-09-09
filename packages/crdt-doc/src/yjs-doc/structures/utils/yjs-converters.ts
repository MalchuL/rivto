import * as Y from "yjs";
import { YJSType } from "./types";
import { BasicType, WrapBasicTypeToCRDTOptions } from "../../../types";
import { isDeepPlainRecord } from "./plain-check";
import { YjsConvertError } from "./error";
import { ConvertCRDTTypeToBasicOptions } from "../../../types/utils/wrapping-options";


/**
 * Converts a BasicType to a YJS type.
 * - number and boolean -> number or boolean
 * - string -> string or Y.Text
 * - null -> null
 * - array -> Y.Array or BasicType[]
 * - map -> Y.Map
 * - object -> Y.Map or object
 * Importatant Note. If some object converts to plain object, whole nested objects will be converted to plain objects.
 * @param value - The property value.
 * @param options - The options to convert the BasicType to a YJS type.
 * - string2crdttext - If true, the string will be converted to a Y.Text (to support collaborative text editing).
 * - array2crdtarray - If true, the array will be converted to a Y.Array (to support collaborative array editing).
 * - map2crdtmap - If true, the map will be converted to a Y.Map (to support collaborative map editing).
 * - object2crdtmap - If true, the object will be converted to a Y.Map (to support collaborative object editing).
 * @returns The YJS value with nested YJS types (Includes Y.Text, Y.Array, Y.Map).
 */
export function convertBasicTypeToYJS(value: BasicType, options?: WrapBasicTypeToCRDTOptions): YJSType {
  const string2ytext = options?.string2crdttext ?? true;
  const array2yarray = options?.array2crdtarray ?? true;
  const map2ymap = options?.map2crdtmap ?? true;
  const object2ymap = options?.object2crdtmap ?? true;
  
  // Options for nested objects if they are not converted to YJS types.
  const falseOptions: WrapBasicTypeToCRDTOptions = {
    string2crdttext: false,
    array2crdtarray: false,
    map2crdtmap: false,
    object2crdtmap: false,
  };

  const type: string = typeof value;
  // number and boolean -> number or boolean
  if (type === "number" || type === "boolean") {
    return value as number | boolean;
  }
  // string -> string or Y.Text
  if (type === "string") {
    if (string2ytext) {
      return new Y.Text(value as string);
    }
    return value as string;
  }
  // null
  if (value === null) {
    return null;
  }
  // array -> Y.Array or BasicType[]
  if (Array.isArray(value)) {
    if (array2yarray) {
      const yArray = new Y.Array<any>();
      const convertedValue: YJSType[] = value.map(item => convertBasicTypeToYJS(item, options));
      yArray.insert(0, convertedValue);
      return yArray;
    }
    return value.map(item => convertBasicTypeToYJS(item, falseOptions));
  }
  // map -> Y.Map or Map<string, BasicType>
  if (value instanceof Map) {
    if (map2ymap) {
      const entries: [string, YJSType][] = Array.from(value.entries()).map(
        ([key, val]) => [key, convertBasicTypeToYJS(val, options) as YJSType]
      );
      return new Y.Map(entries);
    }
    // Converts the map to a object.
    return Object.fromEntries(Array.from(value.entries()).map(([key, val]) => [key, convertBasicTypeToYJS(val, falseOptions)])) as YJSType;
  }
  // object -> Y.Map or object
  if (type === "object") {
    if (object2ymap) {
      return new Y.Map(Object.entries(value).map(([key, value]) => [key, convertBasicTypeToYJS(value, options)]));
    }
    // Converts the object to a object.
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, convertBasicTypeToYJS(value, falseOptions)])) as YJSType;
  }
  throw new YjsConvertError(`Unsupported property type: ${type}`);
}

/**
 * Converts a YJS type to a BasicType.
 * @param value - The YJS value.
 * - number and boolean -> number or boolean
 * - null -> null
 * - Y.Text -> string
 * - Y.Array -> BasicType[]
 * - Y.Map -> Map<string, BasicType> or object
 * - Plain object -> object
 * Importatant Note. If some object converts to plain object, whole nested objects will be converted to plain objects.
 * @returns The BasicType.
 */
export function convertYJSTypeToBasic(value: YJSType, options?: ConvertCRDTTypeToBasicOptions): BasicType {
  const crdtmap2map = options?.crdtmap2map ?? false;
  const type: string = typeof value;
  // Primitive types are converted to themselves.
  // number, string, boolean -> number, string, boolean
  if (type === "number" || type === "string" || type === "boolean") {
    return value as number | string | boolean;
  }
  // null is converted to null.
  if (value === null) {
    return null;
  }
  // Y.Text -> string
  if (value instanceof Y.Text) {
    return value.toString();
  }
  // Y.Array -> BasicType[]
  if (value instanceof Y.Array) {
    return value.toArray().map(item => convertYJSTypeToBasic(item as YJSType, options));
  }
  // Y.Map -> Map<string, BasicType> or object
  if (value instanceof Y.Map) {
    const map = new Map<string, BasicType>();
    value.forEach((v, k) => {
      const converted = convertYJSTypeToBasic(v as YJSType, options);
      if (converted instanceof Map && !crdtmap2map) {
        map.set(k, Object.fromEntries(converted.entries()));
      } else {
        map.set(k, converted);
      }
    });
    if (!crdtmap2map) {
      return Object.fromEntries(map.entries());
    }
    return map;
  }
  // Plain object -> object
  if (isDeepPlainRecord(value)) {
    return value as BasicType;
  }
  throw new YjsConvertError(`Unsupported document property type: ${type}, value: ${JSON.stringify(value)}${value && value.constructor && value.constructor.name ? `, class: ${value.constructor.name}` : ''}`);
}
import * as Y from 'yjs';
import {
  CRDTType,
  BasicType,
  WrapBasicTypeToCRDTOptions,
} from '../../../types';
import { YJSType } from './types';
import { YjsArray, YjsMap, YjsText } from '..';
import { convertBasicTypeToYJS } from './yjs-converters';
import { isDeepPlainRecord } from './plain-check';
import { YjsConvertError } from './error';

/**
 * Helper to unwrap a CRDTType into something Y.js can digest.
 * Don't miss yjs is a framework not a a current YjsMap, YjsArray, or YjsText is a wrapper class for Y.Map, Y.Array, or Y.Text.
 * If it's a wrapper class, we extract the underlying Y.js type.
 * If it's a primitive, we return it as is.
 * YjsMap -> Y.Map
 * YjsArray -> Y.Array
 * YjsText -> Y.Text
 * Object -> Object (return the object as is without CRDT wrapping)
 * Array -> Array (return the array as is without CRDT wrapping)
 * string -> string
 * number -> number
 * boolean -> boolean
 * null -> null
 * undefined -> throw error
 */
export function unwrapCRDTtoYJS(item: CRDTType): YJSType {
  // Primitives 
  if (item === null) return item;
  if (typeof item === 'number' || typeof item === 'string' || typeof item === 'boolean') return item;
  if (item === undefined) throw new Error('Unsupported item type: undefined for CRDT');
  const itemType = typeof item;
  // If the item is an object, we need to convert it to a YJS type.
  if (itemType === 'object') {
    // CRDT Array, Map, Text
    // If the item is a Y.Map, Y.Array, or Y.Text, we raise an error.
    if (item instanceof Y.Map) throw new Error('Unsupported item type: Y.Map it must be wrapped to YjsMap');
    if (item instanceof Y.Array) throw new Error('Unsupported item type: Y.Array it must be wrapped to YjsArray');
    if (item instanceof Y.Text) throw new Error('Unsupported item type: Y.Text it must be wrapped to YjsText');

    // If the item is a YjsMap, YjsArray, or YjsText, we return it as is.
    // Dirty hack to get the yjsObj from the YjsMap, YjsArray, or YjsText.
    if (item instanceof YjsMap) return (item as unknown as {yjsObj: YJSType}).yjsObj;
    if (item instanceof YjsArray) return (item as unknown as {yjsObj: YJSType}).yjsObj;
    if (item instanceof YjsText) return (item as unknown as {yjsObj: YJSType}).yjsObj;
  }
  if (item instanceof Map) {
    throw new Error('Unsupported item type: Map (wrap it to YjsMap or converted to object)');
  }
  // Check arrays and objects (and them combinations)
  if (isDeepPlainRecord(item)) {
    return item;
  }
  throw new YjsConvertError(`Unsupported item type: ${itemType}, value: ${item.toString()}, class: ${item?.constructor?.name}`);
}

/**
 * Helper to wrap a Y.js value into a CRDTType.
 * Don't miss yjs is a framework not a a current YjsMap, YjsArray, or YjsText is a wrapper class for Y.Map, Y.Array, or Y.Text.
 * primitives -> primitives
 * Y.Map -> YjsMap
 * Y.Array -> YjsArray
 * Y.Text -> YjsText
 * Object -> Object (return the object as is without CRDT wrapping)
 * Array -> Array (return the array as is without CRDT wrapping)
 * string -> string
 * number -> number
 * boolean -> boolean
 * null -> null
 * undefined -> throw error
 */
export function wrapYJStoCRDT(item: YJSType): CRDTType {
  const itemType = typeof item;
  if (itemType === 'number' || itemType === 'string' || itemType === 'boolean') {
    return item as number | string | boolean;
  }
  if (item === null) return null;
  if (itemType === 'object') {
    if (item instanceof Y.Map) return new YjsMap(item);
    if (item instanceof Y.Array) return new YjsArray(item);
    if (item instanceof Y.Text) return new YjsText(item);
    // Just avoid passing wrapped already wrapped YjsMap, YjsArray, or YjsText to wrapYJStoCRDT
    if (item instanceof YjsMap) throw new Error('Unsupported item type: YjsMap it must be unwrapped to Y.Map');
    if (item instanceof YjsArray) throw new Error('Unsupported item type: YjsArray it must be unwrapped to Y.Array');
    if (item instanceof YjsText) throw new Error('Unsupported item type: YjsText it must be unwrapped to Y.Text');
  }
  if (isDeepPlainRecord(item)) {
    return item;
  }
  throw new YjsConvertError(`Unsupported item type: ${itemType}, value: ${item.toString()}, class: ${item?.constructor?.name}`);
}

export function wrapBasicTypeToCRDTType(item: BasicType, options?: WrapBasicTypeToCRDTOptions): CRDTType {
  return wrapYJStoCRDT(convertBasicTypeToYJS(item, options));
}

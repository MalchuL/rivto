import { CRDTArray } from "./array";
import { CRDTMap } from "./map";
import { CRDTText } from "./text";
/**
 * BasicType represents any serializable primitive or recursive
 * structure for document properties. This includes:
 * - number, string, boolean, null
 * - Map (with string keys and BasicType values)
 * - Array of BasicType
 * - Object with string keys and BasicType values
 */
export type BasicType = 
| number 
| string 
| boolean 
| null 
| BasicType[] 
| object;

/**
 * BasicCRDTType represents document-compatible values that the
 * CRDT types can hold, including primitives and other CRDT objects.
 * - CRDTArray
 * - CRDTMap
 * - CRDTText
 * - Record<string, BasicType>
 * - BasicType[]
 * - BasicType
 */
export type BasicCRDTType = 
// CRDT types, synchronized any changes to the CRDT types are synchronized to the other clients.
| CRDTArray 
| CRDTMap 
| CRDTText 
// Object types, objects are serialized to a JSON and synchronized to the other clients.
| Record<string, BasicType> 
| BasicType[]
| BasicType

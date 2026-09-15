export type WrapBasicTypeToCRDTOptions = {
    /**
     * If true, the string will be wrapped to a CRDT text (to support collaborative text editing).
     * If false, the string will be returned as is.
     * Default: true
     */
    string2crdttext?: boolean;
    /**
     * If true, the array will be wrapped to a CRDT array (to support collaborative array editing).
     * If false, the array will be returned as is.
     * Default: true
     */
    array2crdtarray?: boolean;
    /**
     * If true, the map will be wrapped to a CRDT map (to support collaborative map editing).
     * If false, the map will be returned as is.
     * Default: true
     */
    map2crdtmap?: boolean;
    /**
     * If true, the object will be wrapped to a CRDT map (to support collaborative object editing).
     * If false, the object will be returned as object.
     * Default: true
     */
    object2crdtmap?: boolean;
}

export type ConvertCRDTTypeToBasicOptions = {
    /**
     * If true, the CRDT map will be converted to a Map<string, BasicType> (to support collaborative map editing).
     * If false, the CRDT map will be returned as is.
     * Default: false
     */
    crdtmap2map?: boolean;
}
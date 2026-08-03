Important notes:
- When storing basic types to crdt types them remains basic types, not crdt types.
Wrapping:
- TODO: Maps converts to object and Y.Map
- [X] TODO: test wrapYJStoCRDT, that returns crdt types, basic types. Nested objects if converted to plain objects via options shouldn't contain crdt types (like YjsMap, YjsArray, YjsText).
[X] TODO: tested with different cmbinations and options.
Unwrapping:
- [X] TODO: test unwrapCRDTtoYJS, that returns yjs types, basic types. Nested objects if converted to plain objects via options shouldn't contain crdt types (like YjsMap, YjsArray, YjsText).
[X] TODO: tested with different cmbinations and options.
Arrays:
- [X] TODO: test get(index) to return crdt types, basic types
- [X] TODO: test insert CRDT types, basic types (including nested arrays, maps, texts, nulls, primitives), not working for yjs types (throws errors), not working for map, undefined.
- [X] TODO: same as above for push
- [X] TODO: works for delete, clear, lenght
- [X] TODO: test foreach, that returns crdt types, basic types
- [X] TODO: test toArray, that returns basic types
- [X] TODO: test toJSON, that returns basic types
Maps:
- [X] TODO: test get(key) to return crdt types, basic types
- [X] TODO: test set CRDT types, basic types (including nested arrays, maps, texts, nulls, primitives), not working for yjs types (throws errors), not working for map, undefined.
- [X] TODO: same as above for delete
- [X] TODO: works for clear, lenght
- [X] TODO: test foreach, that returns crdt types, basic types
- [X] TODO: test toObject, that returns object<string, basic types>
- [X] TODO: test toMap, that returns map<string, basic types>
- [X] TODO: test toJSON, that returns basic types

Texts:
- [X] TODO: test get content, that returns string
- [X] TODO: test set content, that returns string

Doc (With synchronization):
- [X] TODO: test getArray, that returns crdt array
- [X] TODO: test getMap, that returns crdt map
- [X] TODO: test getText, that returns crdt text
- [X] TODO: test on, that returns function to unsubscribe
- [X] TODO: test getSnapshot, that returns basic type
- [X] TODO: test applySnapshot, that returns void
- [X] TODO: test destroy, that returns void
- [X] TODO: test toJSON, that returns basic type
- [X] TODO: test fromJSON, that returns crdt types
- [X] TODO: It works fine with instantiator to create crdt objects and wraps basic types to crdt types.
Instantiator:
- [X] TODO: test createArray, that returns crdt array
- [X] TODO: test createMap, that returns crdt map
- [X] TODO: test createText, that returns crdt text
- [X] TODO: test plainObjectToCRDT, that returns crdt type
- [X] TODO: test isPlainRecord, that returns true if the value is a plain record, false otherwise. Test that returns crdt types, basic types (on first level is always Y.Map with basic structure or yjs types). If map was attached to a document it still attached after conversion from JSON.
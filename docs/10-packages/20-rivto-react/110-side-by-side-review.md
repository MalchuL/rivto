# Side-by-side review

`EditorRuntime` - Главная точка входа

`createDemoEditor` - То же самое, но в demo

`createRivtoEditor` создает `EditorRuntime` (это Editor, который используется в рантайме, а не какой-нибудь там контекст)  


`createEditorRuntime` - Создает оболочку

`<EditorView runtime={todayEditor.editorRuntime} onReady={todayEditor.releaseInitial}>` - Использует оболочку для рендера в react

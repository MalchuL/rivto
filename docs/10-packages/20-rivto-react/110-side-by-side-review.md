# Side-by-side review

`ReactEditorImpl` - Главная точка входа

`createDemoEditor` - То же самое, но в demo

`createRivtoEditor` создает `EditorRuntime` (это Editor, который используется в рантайме, а не какой-нибудь там контекст)  


`createReactEditor` - Создает оболочку 

`<EditorView reactEditor={todayEditor.reactEditor} onReady={todayEditor.releaseInitial}>` - Использует оболочку для рендера в react

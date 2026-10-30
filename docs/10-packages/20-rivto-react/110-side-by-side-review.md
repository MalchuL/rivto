# Side-by-side review

`ReactEditor` - Главная точка входа

`createDemoEditor` - То же самое, но в demo

`createDocumentEditor` создаёт framework-neutral `DocumentEditorAPI`; `createReactEditor` создаёт ReactEditor с интерфейсом ReactEditorApi.

`createReactEditor` - Создает оболочку

`<EditorPanel editor={todayEditor.reactEditor}>` - Использует оболочку для рендера в react

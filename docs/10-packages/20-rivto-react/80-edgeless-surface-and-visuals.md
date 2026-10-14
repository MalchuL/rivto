# Edgeless: регистрации элементов и API панели

`ReactEditor.elementTypes` регистрирует типы элементов. `PanelAPI.elements` читает и изменяет элементы в границах `rootElementId`. `useEdgelessOperations()` создаёт операции, которые выполняют действия над текущим canvas-выделением и выбирает инструмент. Расширение устанавливает возможности; отдельного объекта с методами `createRectangle`/`createSticker` больше нет.

## Подключение

```ts
extensions: [standardPreset(), pageDragExtension(), ...edgelessPreset({
  visuals: { toolbar: true, orphanConnectors: "detach" },
})]
```

Preset устанавливает поверхность, выделение, Moveable, удаление, клавиатурное перемещение, встроенные фигуры и их toolbar. `visuals.toolbar: false` скрывает стандартный UI; API и регистрации остаются. Для собственного состава доступны отдельные extensions, включая `edgelessVisualsExtension`, которая возвращает обычное расширение без imperative API. Не устанавливайте её повторно вместе с полным preset.

```tsx
<EditorPanel editor={reactEditor} rootElementId={containerId}>
  <EdgelessSurface />
</EditorPanel>
```

Без `rootElementId` отображается всё дерево элементов. Block-корень независим от element-корня. Переключение Page/Edgeless остаётся выбором поверхности в JSX; состояние режима принадлежит React-панели. Root blocks проецируются в элементы `block`; один card может содержать диапазон соседних блоков. `group` сохраняет структурные правила дерева.

## Пользовательский элемент

```tsx
const dispose = reactEditor.elementTypes.register({
  definition: {
    type: "badge",
    defaults: { title: "Badge" },
    validate(props) {
      if (typeof props.title !== "string") throw new Error("Invalid badge title");
      return props;
    },
  },
  render: ({ element }) => <div>{String(element.props.title)}</div>,
  creation: {
    title: "Badge",
    create: () => ({ type: "badge" }),
  },
  properties: ({ elements, reactPanel }) => <button onClick={() =>
    reactPanel.elements.updateElements(elements.map(element => ({
      id: element.id, patch: { props: { title: "Updated" } },
    })))
  }>Rename selection</button>,
});
```

Регистрация атомарно устанавливает core-определение, React-рендерер и необязательные `behavior`, `clipboard`, `creation`, `properties`. Конфликт типа или converter вызывает исключение и откатывает установленные части. Disposer идемпотентен и автоматически принадлежит extension lifecycle. Удаление регистрации не удаляет данные; неизвестный тип отображается fallback-сообщением. Если удалённый тип был активным инструментом создания, включается Select.

`definition.defaults` и `validate` применяются при создании и изменении через core element pipeline, включая вложенное создание и пакетные updates. Регистрация не переписывает ранее загруженные данные. Неизвестные типы допускаются core и сохраняют props.

`behavior.resize(element, frame)` возвращает изменения props, связанные с новым размером: например, масштабирование точек drawing. Он применяется общим core-путём, включая прямой `panel.elements.updateElement`. `behavior.create(input, panel)` может подготовить геометрию интерактивного создания в границах core-панели. Встроенные коннекторы используют его для расчёта frame по концам. Итоговый input проходит core-валидацию.

`clipboard` использует существующий `ElementClipboardConverter`: defaults, правила свойств и восстановление ссылок не дублируются в UI. `creation` добавляет кнопку в стандартный toolbar и использует существующий click/drag placement со snapping. Фабрика обязана вернуть свой зарегистрированный тип. `properties` получает выбранные элементы одного типа и React-панель; изменения проходят через ограниченные операции.

Общая оболочка элемента отвечает за координаты, DOM identity, transform-preview, выделение и slots. Рендерер отвечает за содержимое. Встроенные фигуры используют тот же реестр; пользовательскому типу не требуется изменять код поверхности или встроенных фигур.

## Операции

```tsx
const panel = usePanel();
const operations = useEdgelessOperations();

const element = operations.createElement({
  type: "rectangle",
  frame: { x: 10, y: 20, width: 160, height: 120 },
  zIndex: 0,
  props: { fill: "#eeeaff" },
});
panel.elements.updateElement(element.id, { props: { fill: "#ffffff" } });
operations.align("left");
```

`createElement` возвращает полный созданный node и выбирает его. Незарегистрированный тип или невалидные свойства вызывают исключение. Без frame применяется стандартный frame `{ x: 120, y: 120, width: 160, height: 120 }`; без zIndex выбирается слой над текущими элементами панели.

`move(dx, dy)` перемещает выбранные элементы в единицах canvas. `resize(width, height)` масштабирует внешние границы выделения, требует положительных конечных размеров. `group()` возвращает созданную группу и требует совместимого набора соседей; `ungroup()` поднимает детей выбранных групп. `align`, `distribute` и `reorder` меняют геометрию/слой выбранных объектов; распределение требует не менее трёх объектов. `duplicateSelection()` возвращает новые nodes и использует clipboard converters. Многоэлементные изменения проходят через общую history batch.

Выделение и clipboard доступны через `reactPanel.selection` и `reactPanel.clipboard`; дополнительную копию этих API edgeless не создаёт. Именованные команды остаются доступны через `DocumentEditor.commands`; документные вызовы фиксированы на документе, panel-вызовы передают получателя явно.

## Состояние и lifecycle

Выбранный инструмент, defaults создания и временные превью хранятся в edgeless-представлении через `useEdgelessOperations()`. При переходе в page оно размонтируется, а при возвращении создаётся новое состояние. Отдельные вызовы хука создают независимые операции; дочерним компонентам одного canvas передаются общие operations. Реестр типов и стандартные свойства определений остаются общими; настройки панели не изменяют их. Команда `edgeless.tool.set` требует явного аргумента `{ operations, payload }`. Другие canvas-команды принимают тот же аргумент для работы с локальными defaults или `{ reactPanel, payload }` для ограниченных панелью операций со свежими defaults. `getTool()` возвращает текущий инструмент, `setTool("select")` включает выделение; пользовательский инструмент выбирается через `{ tool: "element", type: "badge" }` и требует регистрации `creation`.

Жест, временная геометрия и property preview принадлежат конкретной React-панели. Размонтирование отменяет локальные previews; transform и drawing/place жесты также отменяются при деактивации панели. Moveable вычисляет drag/resize/rotation; редактор сохраняет геометрию, undo и привязки. Нормализация коннекторов устанавливается один раз для документа независимо от количества панелей. `orphanConnectors` выбирает detach или delete при исчезновении конца.

Повторное монтирование в StrictMode создаёт новые подписки и браузерные привязки, сохраняя core-панель и общий редактор. Панель никогда не уничтожает переданный DocumentEditor.

## Настройки поверхности

`EdgelessSurfaceOptions` сохраняет `snapping`, `avoidBlockElementOverlap` (default true) и `blockElementWidth` (default 720). `EdgelessSnappingStore` хранит host-owned `{ snapToGrid, alignObjects }`, оба defaults true. `getSnapshot()` стабилен до изменения; `subscribe` допускает несколько callbacks и возвращает идемпотентную отписку; `set` уведомляет только при effective change. UI preferences не входят в document snapshot.

Полный пример пользовательской регистрации: `demo/src/ElementRegistrationTest.tsx`, маршрут `?elementRegistration=1`. Он демонстрирует две независимые element-панели, общее состояние инструмента, создание, property editor, resize, clipboard, undo и повторное монтирование.

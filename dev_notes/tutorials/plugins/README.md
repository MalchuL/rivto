# Курс: plugins в Rivto

## Для кого этот курс

Курс объясняет plugin system разработчику, который знает объекты, функции и
React-компоненты, но ещё не проектировал расширяемый runtime.

После курса должно быть понятно:

- чем plugin отличается от React component;
- какие contributions plugin может установить;
- почему установка должна быть атомарной;
- как работают disposer и setup cleanup;
- как mode ограничивает commands, events и UI;
- почему event handler возвращает `true` только при полном захвате события;
- как slash menu само реализовано plugin, а не специальным runtime field.

## Порядок чтения

| Глава | Содержание | Главные файлы |
| --- | --- | --- |
| [00](./00-extension-model.md) | Mental model и полный контракт `RivtoPlugin` | `plugin-manager.ts` |
| [01](./01-installation-lifecycle.md) | Atomic install, rollback, unuse и destroy | `plugin-manager.ts`, registries |
| [02](./02-contributions.md) | Blocks, commands, events, slash и UI | managers и `types.ts` |
| [03](./03-event-routing.md) | Global → block → fallback и short-circuit | `event-router.ts` |
| [04](./04-building-and-testing.md) | Построение plugin, slash example, тесты | `slash-menu-plugin.ts`, demo |

## Одна мысль заранее

Plugin — это не объект, который runtime вызывает на каждом render. Plugin —
это описание набора ресурсов, которые `PluginManager` регистрирует в
специализированных registries и затем удаляет как одну lifecycle unit.

```text
RivtoPlugin
  ├── blocks       → BlockRegistry
  ├── commands     → CommandRegistry
  ├── events       → EventRouter global phase
  ├── blockEvents  → EventRouter block phase
  ├── ui           → UIRegistry
  ├── slashItems   → остаются metadata установленного plugin
  └── setup        → произвольный owned subscription/resource
```

## Trust boundary

Plugins являются trusted local code. Они получают полный публичный
`RivtoEditorApi`, могут выполнять commands и читать document. Эта система не
является sandbox для запуска недоверенного JavaScript из сети.


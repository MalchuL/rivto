# Карта CRDT-модулей

Эта страница — указатель по исходникам для contributors: что принадлежит каждому файлу и кто от него зависит.

## Публичный barrel

`store/crdt-doc/index.ts` — поддерживаемая точка входа core-пакета. Она экспортирует `YjsDoc`, встроенные providers, контракты wrapper, типы instantiation и undo и основные публичные ошибки.

Приложению следует импортировать публичный API пакета. Внутренние модули core могут использовать ближайший barrel `crdt-doc`. Импорты из `yjs-doc/structures` за пределами адаптера нежелательны.

## Файлы контрактов

- `types/doc.ts` — `Serializible`, `CRDTDoc` и жизненный цикл документа.
- `types/array.ts` — контракт упорядоченной shared-последовательности.
- `types/map.ts` — keyed-контейнер и глубокое наблюдение.
- `types/text.ts` — совместный текст и delta.
- `types/provider.ts` — идентичность и connect/disconnect провайдера.
- `types/undo.ts` — undo scopes и facade менеджера.
- `types/utils/crdt-instantiator.ts` — независимое создание shared-типов.
- `types/utils/wrapping-options.ts` — флаги преобразования plain-значений.
- `types/basic-types.ts` — unions сериализуемых и CRDT-значений.
- `types/error.ts` — базовая независимая ошибка.
- `types/crdt.ts` — общий сериализуемый контракт shared-контейнеров.

`DocumentModelImpl` и его менеджеры зависят от этих контрактов, а не от Yjs.

## Файлы Yjs-документа

- `yjs-doc/yjs-doc.ts` — корни, транзакции, события, бинарное состояние, JSON conversion, undo, providers и destroy.
- `yjs-doc/utils/instantiator.ts` — создание wrapper и преобразование plain input.
- `yjs-doc/error.ts` — ошибки уровня Yjs-документа.

`EditorRuntime` выбирает `YjsDoc` по умолчанию. Провайдерам также нужен его публичный `doc`.

## Shared-структуры

- `structures/basic.ts` — базовый `YjsBasic`.
- `structures/array.ts` — реализация `CRDTArray`.
- `structures/map.ts` — реализация `CRDTMap`.
- `structures/text.ts` — реализация `CRDTText`.
- `structures/utils/wrap.ts` — граница wrapper/native.
- `structures/utils/yjs-converters.ts` — рекурсивное преобразование.
- `structures/utils/plain-check.ts` — проверка deep plain records.
- `structures/utils/types.ts` — union поддерживаемых Yjs-значений.
- `structures/utils/error.ts` — ошибки conversion.

Только это поддерево должно импортировать нативные структуры `yjs` для реализации wrapper.

## Провайдеры

- `providers/broadcast.ts` — синхронизация браузерных контекстов одного origin со state-vector handshake.
- `providers/webrtc.ts` — адаптер `y-webrtc` для peer-to-peer комнат.

Demo условно использует broadcast provider. WebRTC экспортируется потребителям, но сейчас не имеет runtime-caller внутри репозитория.

## Как трассировать поведение

```text
инвариант хранения
  -> manager модели документа
    -> метод CRDT-контракта
      -> Yjs wrapper или YjsDoc
        -> нативная операция Yjs
          -> subscriber / provider / undo manager
```

Для изменения persisted shape дополнительно проверьте versioned snapshot, clipboard conversion, undo scope и page/edgeless rendering. Для провайдера проверьте начальную сходимость, позднее подключение, защиту от эха, disconnect cleanup и ошибки несовместимого документа.

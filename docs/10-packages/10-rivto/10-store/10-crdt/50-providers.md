# Провайдеры синхронизации

Провайдеры транспортируют Yjs updates, но не определяют схему блоков Rivto. `YjsDoc` работает локально сам по себе и становится совместным после подключения провайдера.

Оба встроенных провайдера реализуют общий контракт `Provider`, но принимают только `YjsDoc`, так как их протоколы работают с нативным состоянием Yjs.

## `BroadcastChannelProvider`

Синхронизирует документы между браузерными контекстами одного origin через нативный `BroadcastChannel`. Сервер не нужен; провайдер подходит для локальных вкладок, demo и тестов.

Исходник: `yjs-doc/providers/broadcast.ts`.

### `constructor(roomId)`

- **Аргументы:** `roomId: string`.
- **Создаёт:** отключённый `BroadcastChannelProvider` для комнаты.
- **Исключения:** собственных проверок нет.

Сохраняет комнату совместной работы. Имя браузерного канала получает namespace `rivto:${roomId}`.

### `id`

- **Тип:** строковый литерал `"broadcast"`, публичное `readonly`-свойство.
- **Значение:** ключ провайдера в `YjsDoc.providersStorage`.
- **Исключения при чтении:** отсутствуют.

Возвращает стабильный ключ `broadcast`.

### `connect(document)`

- **Аргументы:** `document: CRDTDoc`; runtime требует экземпляр `YjsDoc`.
- **Возвращает:** `Promise<void>` после регистрации listeners и отправки `sync-step1`; метод не ожидает фактической сходимости peers.
- **Исключения:** `Error("Document is not a YjsDoc")`; `Error("Provider already connected")`; ошибки браузерного `BroadcastChannel` и Yjs также отклоняют Promise.

Проверяет, что передан `YjsDoc` и провайдер ещё не подключён. Затем он:

1. Сохраняет нативный `Y.Doc`.
2. Открывает `BroadcastChannel` комнаты.
3. Подписывается на Yjs updates.
4. Подписывается на сообщения канала.
5. Отправляет начальный запрос state vector.

Handshake через state vector нужен поздним участникам. Существующие peers вычисляют только недостающий update, поэтому новая вкладка получает изменения, отправленные до её открытия.

### `disconnect(document)`

- **Аргументы:** `document: CRDTDoc`; runtime требует `YjsDoc`.
- **Возвращает:** `Promise<void>` после удаления listeners и закрытия канала.
- **Исключения:** `Error("Document is not a YjsDoc")`; `Error("Provider not connected")`; ошибки cleanup браузерного канала или Yjs передаются.

Проверяет документ, удаляет оба listener, закрывает канал и очищает ссылки. Другой или несовместимый документ приводит к ошибке, а не к скрытой утечке ресурсов.

### Обработчик нативного update

Свойство `handleDocUpdate` имеет тип `(update: Uint8Array, origin: unknown) => void`.

- **Аргументы:** бинарный `update`; `origin` транзакции.
- **Возвращает:** `void`.
- **Исключения:** ошибки `channel.postMessage` передаются event dispatcher; при собственном origin или закрытом канале завершается без ошибки.

Приватный callback публикует байты update в канал. Updates с origin, равным текущему провайдеру, игнорируются — это предотвращает бесконечное эхо.

### Обработчик сообщения канала

Свойство `handleChannelMessage` имеет тип `(event: MessageEvent<BroadcastMessage>) => void`.

- **Аргументы:** `event` с сообщением `sync-step1`, `sync-step2` или `update`.
- **Возвращает:** `void`.
- **Исключения:** ошибки Yjs encoding/apply или `postMessage` передаются event dispatcher; некорректное сообщение игнорируется.

Приватный callback различает update, запрос state vector и ответ на него. Он применяет входящий update с provider instance как origin либо вычисляет разницу состояний для запросившего peer.

### `roomId`

- **Тип:** `string`, приватное `readonly`-свойство конструктора.
- **Значение:** часть имени канала после префикса `rivto:`.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

### `channel`

- **Тип:** `BroadcastChannel | null`, приватное свойство.
- **Значение:** активный канал или `null` до подключения/после отключения.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

### `ydoc`

- **Тип:** `Y.Doc | null`, приватное свойство.
- **Значение:** нативный подключённый документ или `null`.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

## Поля сообщений broadcast-протокола

- **`type`:** `"sync-step1" | "sync-step2" | "update"`, discriminator сообщения.
- **`stateVector`:** `Uint8Array`, присутствует у `sync-step1` и описывает известное состояние отправителя.
- **`expectReply`:** `boolean`, присутствует у `sync-step1` и просит peer отправить собственный state vector.
- **`update`:** `Uint8Array`, присутствует у `sync-step2` и `update`.

Все поля `readonly`, их чтение само по себе не выбрасывает исключений. Runtime-проверка подтверждает только объект и наличие `type`, поэтому повреждённый payload может привести к ошибке Yjs позднее.

## Использование broadcast в проекте

Demo создаёт `BroadcastChannelProvider` при query-параметре `sync=1`. Вторая вкладка того же demo подключается к локальной комнате. Тесты проверяют обычную сходимость и позднее подключение.

```ts
const document = new YjsDoc("demo-document");
const provider = new BroadcastChannelProvider("demo-room");

await document.attachProvider(provider);
// Создайте editor с этим document и редактируйте обычным способом.
await document.detachProvider();
await document.destroy();
```

Нужна поддержка `BroadcastChannel` браузером. Это не долговременное хранилище: после закрытия всех контекстов состояние исчезнет, если приложение не сохранило snapshot отдельно.

## `WebRTCProvider`

Адаптирует `y-webrtc` для peer-to-peer синхронизации. Core-пакет экспортирует его как вариант интеграции, но текущее demo его не создаёт.

Исходник: `yjs-doc/providers/webrtc.ts`.

### `constructor(roomId, options)`

- **Аргументы:** `roomId: string`; необязательный `options: ProviderOptions` (`WebRTCProviderOptions`).
- **Создаёт:** отключённый `WebRTCProvider` с сохранённой конфигурацией.
- **Исключения:** собственных проверок нет.

Сохраняет комнату и `WebRTCProviderOptions`. Настройки передаются в `y-webrtc` и могут задавать signaling servers, лимиты peers, пароль и другие возможности зависимости.

### `id`

- **Тип:** `string`, публичное `readonly`-свойство.
- **Значение:** `"webrtc"`.
- **Исключения при чтении:** отсутствуют.

Возвращает стабильный ключ `webrtc`.

### `connect(document)`

- **Аргументы:** `document: CRDTDoc`; runtime требует `YjsDoc`.
- **Возвращает:** `Promise<void>` после создания `y-webrtc` provider; не гарантирует, что peers уже найдены.
- **Исключения:** `Error("Document is not a YjsDoc")`; `Error("Provider already connected")`; ошибки конструктора `y-webrtc` отклоняют Promise.

Проверяет `YjsDoc` и отсутствие существующего подключения. Создаёт нативный `WebrtcProvider` с комнатой, `Y.Doc` и настройками; после этого начинается discovery и синхронизация.

### `disconnect(document)`

- **Аргументы:** `document: CRDTDoc`; runtime требует `YjsDoc`.
- **Возвращает:** `Promise<void>` после `disconnect()`, `destroy()` и очистки ссылки.
- **Исключения:** `Error("Document is not a YjsDoc")`; `Error("Provider not connected")`; ошибки нативного cleanup передаются.

Проверяет документ, вызывает у нативного провайдера `disconnect()` и `destroy()`, затем очищает ссылку. Это освобождает signaling, peer connections, awareness и listeners `y-webrtc`.

### `roomId`

- **Тип:** `string`, приватное `readonly`-свойство конструктора.
- **Значение:** имя WebRTC-комнаты.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

### `options`

- **Тип:** `ProviderOptions | undefined`, приватное `readonly`-свойство конструктора.
- **Значение:** настройки, передаваемые без преобразования в `y-webrtc`.
- **Исключения при чтении:** отсутствуют; их валидация выполняется внешней библиотекой при `connect()`.

### `_provider`

- **Тип:** `YWebrtcProvider | null`, приватное свойство.
- **Значение:** активный нативный провайдер или `null` до подключения/после отключения.
- **Исключения при чтении:** отсутствуют; публичного доступа нет.

```ts
const document = new YjsDoc("shared-document");
const provider = new WebRTCProvider("project-room", {
  signaling: ["wss://your-signaling.example"],
});

await document.attachProvider(provider);
```

Приложение должно определить безопасную стратегию имён комнат и авторизации. ID комнаты маршрутизирует данные, но сам по себе не является контролем доступа.

## Новый провайдер

Провайдеру нужны только `id`, `connect` и `disconnect`, но владение ресурсами должно быть однозначным:

- регистрируйте transport listeners в `connect`;
- применяйте удалённые данные без циклов повторной отправки;
- удаляйте все listeners и внешние ресурсы в `disconnect`;
- явно отклоняйте несовместимые CRDT-адаптеры;
- не смешивайте транспорт и персистентность, если провайдер специально не владеет обоими.

Полностью независимый провайдер работает только с `CRDTDoc`. Если протоколу нужны state vectors или awareness Yjs, сужайте тип до `YjsDoc` внутри провайдера, как это делают встроенные реализации.

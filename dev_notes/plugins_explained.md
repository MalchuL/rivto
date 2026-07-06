# Plugins в Rivto: учебный курс

Этот файл — точка входа в подробный курс
[`tutorials/plugins`](./tutorials/plugins/README.md).

Главы:

1. [Модель расширения runtime](./tutorials/plugins/00-extension-model.md)
2. [Atomic installation и lifecycle](./tutorials/plugins/01-installation-lifecycle.md)
3. [Все виды contributions](./tutorials/plugins/02-contributions.md)
4. [EventRouter подробно](./tutorials/plugins/03-event-routing.md)
5. [Как написать и проверить plugin](./tutorials/plugins/04-building-and-testing.md)

После курса будет понятно:

- чем plugin отличается от block definition и React component;
- как blocks, commands, events, slash items и UI попадают в registries;
- почему установка откатывается в обратном порядке при любом conflict;
- почему setup cleanup выполняется до удаления commands и definitions;
- как plugin-level mode влияет на contributions;
- как работает цепочка global plugin → block plugin → built-in fallback;
- почему handler возвращает `true` только при полном захвате event;
- как slash menu построено обычным plugin mechanism;
- какие observable tests доказывают cleanup и atomicity.

Если вы пишете первый plugin, сначала пройдите главы 00–02, затем возьмите
пошаговый callout example из главы 04.


# Memory investigation

This investigation distinguishes reachable objects and unnecessary CRDT writes from
ordinary live document state. A larger heap alone does not establish a leak.

## Итоговый обзор

Исследование устранило воспроизведённые случаи удержания объектов и лишнего
сохранения данных, но не доказало отсутствие всех утечек и не установило общего
процента снижения памяти. Ниже приведены результаты; подробные сценарии,
результаты до и после и ограничения проверок сохранены в остальных разделах.

### Что исправлено

- **Закрытие документа.** После закрытия последнего потребителя редактор, модель,
  Yjs-документ, менеджер истории и принадлежащие модели менеджеры освобождают
  свои ссылки. Исправлены также удержание предыдущим рендером demo и гонка
  повторного открытия во время закрытия. В Chromium подтверждена возможность
  сборки старых объектов; повторное открытие и слияние с offline-изменением
  проверены. История undo в памяти после закрытия не сохраняется.
- **Подписки, провайдеры и функции очистки.** Завершённые отписки и cleanup-функции
  больше не удерживают соответствующие документы, обработчики, расширения и
  провайдеры. Учтены повторный вызов, конкурентное отключение, ошибка и повторная
  попытка там, где они поддерживаются. При финальном разрушении документа ошибка
  отключения сообщается вызывающему коду, а повторить её через старый cleanup
  уже нельзя.
- **Операции с файлами и изображениями.** При отмене или завершении освобождаются
  принадлежащие редактору временные URL, обработчики и ссылки обратных вызовов.
  Внешний провайдер, который игнорирует отмену, может продолжать собственную
  операцию.
- **Кэши и изменения структуры.** Устранено удержание последней транзакции и
  некоторых завершённых регистраций. При изменении рамки записываются только
  изменившиеся значения, поэтому одинаковые координаты не создают лишнюю
  совместную историю. Это не ограничивает историю реальных изменений.
- **Сохранённое состояние demo.** Журнал обновлений периодически уплотняется;
  после закрытия последней модели сохранённое состояние переносится в
  `sessionStorage`, а лишние полные проекции строк освобождаются. Последнее
  обновление от провайдера сохраняется и при ошибке его отключения. При ошибке
  записи или недостатке квоты данные остаются в памяти. Это хранение на время
  сессии demo, а не долговечное хранилище приложения.

### Что остаётся и почему

- **Рост истории Yjs у открытого документа.** Лимит undo ограничивает число
  действий, но не гарантирует освобождение всех структур CRDT. В отдельном
  эксперименте 250 пар undo/redo для текста из 512 байт дали кодированное
  состояние размером 131 261 байт. Это размер представления, а не измерение heap.
  В Chromium отдельный тест 3 000 пар показал прирост JS heap примерно на
  1,6–4,0 МБ. Пока документ открыт, верхняя граница памяти не доказана.
- **Принудительная очистка истории не внедрена.** `Y.tryGc` может уничтожить
  содержимое, нужное другому `UndoManager`. Проверенная комбинация выборочной
  очистки и принудительного GC также привела к ошибке интеграции удалённого
  обновления в конкретном сценарии. Это не доказывает, что сама upstream-поправка
  вызывает ошибку, но показывает, что проверенный способ небезопасен. На момент
  проверки 11 ноября 2026 года предложения Yjs оставались незавершёнными;
  эксперимент `hotfix-4` тоже не дал достаточно оснований для безопасного
  внедрения. Автоматически перезагружать открытый документ или сбрасывать undo
  без отдельного решения нельзя.
- **Сложные offline-сценарии требуют дальнейшей проверки.** В отдельной проверке
  offline-вставка во вложенный текст одновременно с удалением его родителя не
  сохранилась и в штатной, и в экспериментальной версии Yjs. Этот результат не
  доказывает, что проблему внесли наши изменения; ожидаемое поведение продукта
  и более широкий набор сценариев ещё нужно определить и проверить. Обычное
  слияние проверенного offline-редактирования после повторного открытия проходит.
- **Независимо удерживаемые объекты.** Если вызывающий код сам сохраняет CRDT
  wrapper или нативный Yjs-объект, он может продолжать удерживать документ после
  закрытия. Это явное владение ссылкой; автоматически ослаблять такие ссылки без
  проверки контрактов нельзя. Аналогично внешняя операция может продолжаться,
  если её владелец не поддерживает отмену.
- **Ограничения хранения и измерений.** При недоступном или переполненном
  `sessionStorage` данные намеренно остаются в памяти; большие снимки также
  требуют временных выделений и синхронной обработки. Общий before/after замер
  памяти всего приложения не проводился. Проверки принудительного GC в браузере
  выполнены в Chromium; Firefox проверял поведение без аналогичного утверждения
  о сборке. Полный Playwright-набор после всех изменений не запускался.

Дальнейшее безопасное направление — проверять поддерживаемое Yjs решение для
освобождения отдельных записей истории с несколькими независимыми менеджерами
undo, offline-пирами, вложенными типами и совместимостью версий. До появления
доказанного решения граница освобождения живого документа — закрытие последним
потребителем при успешном сохранении состояния хостом.

## Structural transaction retention

In the production demo, inserting a block, clearing history, then deleting the
block left the deletion transaction reachable after its observers were removed.
The Chromium forced-GC regression `e2e/transaction-memory.spec.ts` failed against
an unchanged build served from a dedicated preview port: the transaction's
`WeakRef` remained live. The same test passed after changing the hierarchy cache
and structure notification deduplication to remember object identities weakly.
The test also checks one structure notification and undo restoration. Primitive
adapter transaction identities retain their existing comparison behavior.
Only the most recent transaction was retained by each deduplication field; this
result does not establish unbounded growth from this cause.

## Unchanged card frame writes

Real editing of an auto-height Edgeless card repeatedly wrote the unchanged x,
y and width along with a changed height. The regression
`e2e/edgeless-frame-memory.spec.ts` failed in both Chromium and Firefox, including
serial reruns. Such Yjs writes create unnecessary collaborative history and
structures. The element manager now writes only frame values that actually
change; the browser test verifies that height still changes. This does not
bound the metadata associated with genuine height changes.

## Other probes and limits

The remote deletion probes for cached block and element snapshots passed forced
GC in Chromium. They do not establish a bound for all caches or interactions.
Firefox cannot use these Chromium DevTools forced-GC checks. Existing history
limits bound undo actions, not necessarily retained CRDT memory. Forcing Yjs
collection is unsafe with multiple undo managers; see
`dev_notes/editor-memory-investigation.md`. Saving a plain document snapshot and
replacing live CRDT state is not equivalent to preserving offline merge history,
so no automatic snapshot eviction has been added without a demonstrated safe
lifecycle and merge protocol.

## Validation so far

- Dedicated production preview: Chromium transaction and remote snapshot GC
  probes passed; card frame regression passed in Chromium and Firefox (12 workers).
- Baseline transaction GC regression failed on the dedicated preview; unchanged
  frame write regression failed in both browsers and again with one worker.
- Document-model Jest: 12 suites, 109 tests passed. Document-model type check
  passed after building the workspace utility dependency. Focused ESLint passed
  with six existing function-length warnings.

## Completed extension cleanup retention

The Chromium probe in `e2e/extension-memory.spec.ts` held completed cleanup
functions while checking weak references to their registration and extension
payloads. Both payloads remained reachable in the unchanged production build,
including a serial rerun. Completed disposers now drop the callback closure
before invoking it, including when cleanup throws or re-enters. The same test
passes after the change. The existing lifecycle suite also covers repeated calls,
reentrant removal, nested ownership and cleanup failures.

## Additional validation and timing

- The five focused memory files passed: seven Chromium/Firefox checks and three
  Chromium-only GC checks skipped in Firefox. The extension baseline failed in
  Chromium both in parallel and serial; Firefox's check does not force GC.
- Existing Page-node, image URL, history-limit and typing checks: 15 passed and
  seven skipped in Chromium/Firefox with 12 workers. The existing two-tab sync
  case is skipped, so that run does not validate offline merging.
- CRDT Jest: 14 suites, 139 tests passed. Extension cleanup Jest: 11 tests passed.
- In a dedicated production preview, serial Chromium container editing gave five
  samples per size. Normal-size synchronous command median/range was 0.7/0.5–1.0
  ms before and 0.8/0.7–1.2 ms after; two-frame median/range was 23.2/18.3–28.6
  ms before and 24.2/18.7–27.5 ms after. At `repeat=200`, synchronous median/range
  was 1.0/0.9–1.4 ms before and 1.1/0.9–1.2 ms after; two-frame median/range was
  46.7/37.1–62.2 ms before and 43.7/34.9–63.2 ms after. This measures Page
  container editing, not Edgeless card-resize timing or heap bounds.

The affected boundaries reviewed were the block manager and cache transaction
identity, element manager frame mutation and its core/React callers, and the
extension manager's ownership of registration and installation disposers. No
public API or ownership transfer was introduced. Further long-session and
offline-peer memory behavior remains unmeasured; no whole-document persistence
or replacement was introduced as a substitute for a proven safe merge lifecycle.

- The card-editing regression was also exercised with `repeat=200` in a serial
  production-preview run and passed in Chromium and Firefox. No card interaction
  timing comparison was collected.

## Expired property history and reload investigation

`e2e/history-map-memory.spec.ts` performs 250 separate property updates with
512-byte payloads and attempts a recent undo. Against the current implementation,
its encoded Yjs state increased by 129,675 bytes in Chromium and Firefox in the
parallel run; the serial rerun measured 129,675 and 129,673 bytes respectively.
The intended bound of 76,800 bytes failed in both runs. The regression is marked
`fixme` while safe collection remains unresolved; do not interpret it as passing.
The retained values result from the current eviction policy preserving Yjs keep
flags, so the history entry limit does not bound CRDT memory.

A separate Yjs adapter test (`snapshot-memory.test.ts`) reproduced the issue at
the storage layer: the encoded state was over 100 KB, and applying it to a fresh
Yjs document reduced the re-encoded state below 1 KB, retained the latest value,
and started with an empty undo stack. Another test applied an offline text edit,
a concurrent deletion, and peer undo after reload and observed convergence. This
is evidence for that scenario only, not proof of safe compaction for all peers,
pending updates or histories. Closing the last editor consumer already destroys
its model, but `DocumentStorage` explicitly delegates persistence to the host;
replacing an actively borrowed model would invalidate consumers and discard undo.
No automatic disk/local-storage swap was added on that basis.

Yjs documents the role of [deleted item collection](https://github.com/yjs/yjs/blob/main/INTERNALS.md),
and upstream tracks a related [undo-manager retention issue](https://github.com/yjs/yjs/issues/833).
The hotfix-4 branch contains experimental collection work but its own tests defer
nested-type collection and include an unresolved reload case; it was not copied
without a shared-history and offline-safety proof.

## Pending image operation cleanup

`e2e/image-inspection-memory.spec.ts` reproduced two resource retention paths in
Chromium and Firefox, both in parallel and in serial reruns: a stalled decode
kept its temporary Blob URL after editor destruction, and a view kept waiting for
a provider read after unmount when the provider ignored its cancellation signal.
Image inspection now observes the ingestion or clipboard operation's cancellation,
revokes owned URLs and removes image handlers on cancellation. Binary resolution
uses the existing abort-aware wait so the caller stops waiting; it cannot stop an
underlying provider that ignores its signal. Borrowed URL strings remain untouched.
The browser regressions and existing image URL checks passed in both browsers
(8 tests, 12 workers), and the new checks also passed at `repeat=200` in a serial
run (4 tests). Nine focused React suites passed 46 tests; focused lint had two
function-length warnings. Chromium picker cancellation GC probes passed twice.
No before/after image interaction timing was collected.

## Demo session update log

The demo database kept every incremental Yjs update in memory even after a newer
update made previous values obsolete. In the actual embeddings demo, 120 separate
edits left 123 saved updates; a second probe accumulated 110 updates with a missing
dependency. Both assertions failed in Chromium and Firefox, including serial
reruns. This session-only log is separate from the live document history described
above.

The database now schedules compaction after 100 saved updates or 1 MiB of new
updates, using an idle callback with a one-second deadline and a timer fallback.
It replays the log in a temporary Yjs document and replaces it only after snapshot
encoding succeeds. The live document and its history are not replaced. Scheduling
is cancelled when the host closes its document models and database. A large
snapshot alone does not repeatedly trigger byte-based compaction. This reduces the
session log; it does not guarantee a constant-size CRDT or bound live undo memory.

The browser regression checks latest content, live undo, closing and reopening,
late arrival of an update dependency, large snapshots, large deleted content,
cancelled scheduling, and preserving the log on compaction failure. Twelve checks
passed in Chromium and Firefox with 12 workers. The first compaction scenario also
passed with `repeat=200` in a serial run in both browsers. The embedding-loading
and compaction suites passed 36 checks together. Demo type checking and 19 demo
unit tests passed; the latter required building the missing `rivto-edgeless`
workspace dependency first. Focused lint had 12 function-length warnings and no
errors.

In serial Chromium production-preview container editing, five post-change samples
at normal size had synchronous median/range 0.6/0.5–0.8 ms and two-frame
median/range 27.0/19.4–28.6 ms. At `repeat=200` these were 1.0/0.9–1.2 ms and
44.9/36.5–58.1 ms. The unchanged baseline earlier in this document was
0.7/0.5–1.0 ms and 23.2/18.3–28.6 ms at normal size, and 1.0/0.9–1.4 ms and
46.7/37.1–62.2 ms at `repeat=200`. This samples editing, not the idle compaction
callback's execution time; large-log compaction may still cause a main-thread pause.

A follow-up production-preview Chromium probe timed the compaction callback itself
with 101 incremental edits and a single live text payload. Five samples for
200 KB were 42.4, 0.8, 0.5, 0.6 and 0.6 ms (median 0.6 ms); for 2 MB they were
3.8, 4.9, 3.8, 4.0 and 3.8 ms (median 3.8 ms); for 20 MB they were 39.8, 44.5,
42.5, 45.1 and 44.3 ms (median 44.3 ms). The first small sample was an outlier.
Each compacted snapshot was reloaded and checked for its full text length. This
is a single-browser synthetic sample, not a general latency guarantee. The 20 MB
sample shows that idle scheduling does not eliminate a main-thread pause.

A further browser regression delivered a deletion before its insertion, compacted
the saved updates, then delivered the insertion. The restored text remained
empty in Chromium and Firefox. All 14 checks in the database-memory file passed
with 12 workers, including the earlier delayed-insertion case. These cases do not
prove every multi-peer merge ordering.

## Completed document subscription retention

A retained unsubscribe function from `YjsDoc.on()` kept both its handler and
native document after the listener had been removed. The Chromium forced-GC
regression failed in the production preview in parallel and serial runs, with
both weak references still live. The adapter now stores the subscription in a
replaceable local reference and clears it before detaching the listener. The
returned function remains idempotent. This changes no subscription ownership or
public signature; callers include the document model, registry, and demo database.

The new regression passed in Chromium and its behavioral part passed in Firefox,
including a serial `repeat=200` run. The broader browser run passed 22 checks with
two pre-existing skipped two-tab sync cases. CRDT Jest passed 15 suites and 141
tests, and its type check passed after correcting a test-only generic type. Focused
lint had one pre-existing function-length warning.

Five serial Chromium production-preview container-editing samples after the fix
had normal-size synchronous median/range 0.6/0.5–0.8 ms and two-frame
median/range 20.4/9.7–28.0 ms. At `repeat=200`, these were 1.1/0.9–1.3 ms and
43.6/35.1–44.9 ms. The prior unchanged baseline was 0.7/0.5–1.0 ms and
23.2/18.3–28.6 ms normally, and 1.0/0.9–1.4 ms and 46.7/37.1–62.2 ms with
`repeat=200`. These measurements cover editing rather than unsubscribe latency.

## Destroyed document storage callback retention

A retained, destroyed `DocumentStorage` kept its host's lookup callback and a
1 MB payload reachable. The Chromium forced-GC regression failed in both parallel
and serial baseline runs. After registry teardown the storage now drops host
callbacks while keeping the registry reference used by its existing read methods.
A pending document open captures its own error callback before awaiting providers,
so it can still report cleanup failures if shutdown completes first. A focused
unit test verifies that case. Registry creation, provider attachment, model
transfer, pending-open cleanup, and shutdown were reviewed as the affected
ownership path; no public interface was added.

The storage and subscription browser regressions passed in Chromium and Firefox,
and the storage check passed with `repeat=200` in a serial run. Firefox exercises
behavior but does not run the Chromium forced-GC assertion. The document-model
suite passed 12 suites and 110 tests; its type check passed. Focused lint reported
no errors and two function-length warnings across the reviewed files.

Five serial Chromium production-preview container-editing samples after both
lifecycle fixes had normal-size synchronous median/range 0.6/0.6–0.9 ms and
two-frame median/range 19.9/10.9–28.4 ms. At `repeat=200`, these were
1.0/0.9–1.2 ms and 44.2/34.4–47.4 ms. The unchanged baseline is recorded above;
these timings cover editing, not storage teardown.

## Destroyed editor storage and reference resolver

A forced-GC browser probe retained a destroyed editor storage, a separately held
resolver, and a completed location cleanup. Before the fix, all three retained
respectively a host callback payload, the borrowed storage, and the resolver;
the Chromium check failed in parallel and serial runs. The resolver now releases
its borrowed storage and host policies on destruction, and a completed location
disposer releases its closure. Editor storage releases its loader, factory, error
callback and registry disposer after teardown. Pending acquisitions retain their
own error callback until their cleanup finishes. Lookup through a destroyed
resolver now rejects instead of reading the former storage.

The forced-GC regression passed in Chromium and its behavioral checks passed in
Firefox, including serial `repeat=200`. The regression plus embedding-loading
checks passed 28 tests with 12 workers. Focused editor-storage and core resolver
Jest suites passed 21 tests. Core type checking passed; React type checking
passed after building the missing keyboard and page workspace dependencies.
Focused lint had two function-length warnings. The reviewed ownership path covers
storage construction and loader/factory use, resolver borrowing and subscriptions,
pending acquisition cleanup, and destruction. Registry or resolver cleanup can
still throw before editor-storage model teardown begins; that existing failure path
was not changed by this memory fix.

Five serial Chromium production-preview container-editing samples after this
change had normal-size synchronous median/range 0.6/0.5–0.7 ms and two-frame
median/range 11.7/10.5–21.6 ms. At `repeat=200`, these were 1.0/0.9–1.3 ms and
42.6/34.5–44.6 ms. The unchanged baseline is recorded above. These timings cover
editing rather than teardown.

## Interrupted selection and viewport settlement

Two listener leaks were reproduced in the production demo in Chromium and Firefox,
including serial reruns. Blurring the window during code selection left three
pointer listeners registered. Destroying the editor or replacing its Page surface
while a virtualized indent settlement was waiting for an animation frame left one
wheel listener registered and the frame pending. These are interrupted-gesture
lifetimes; normal gesture completion and unmount already performed some cleanup.

The nested editing hook now releases its selection listeners on window blur.
Indent settlement is registered with the owning panel and its deactivation event,
and cancellation removes the wheel listener, cancels its pending frame, and
restores suspended virtual scroll adjustments. Existing selection restoration and
viewport anchoring remain in place. The eight focused browser checks passed with
12 workers and again at `repeat=200` serially in both browsers. Twelve additional
browser checks passed for code editing, outline reads, undo, focus, and virtualized
viewport position. React type checking and focused formatting passed; focused
lint had five function-length warnings.

In serial Chromium production-preview runs, five warmed real Tab gestures at
normal size had behavior-dispatch median/range 1.2/1.0–1.8 ms before and
1.2/1.1–1.3 ms after; keydown-to-two-frame median/range was 29.5/29.2–29.9 ms
before and 29.7/28.5–30.4 ms after. At `repeat=200`, behavior-dispatch
median/range was 5.0/4.9–5.5 ms before and 4.9/4.8–5.3 ms after; two-frame
median/range was 170.7/163.2–193.7 ms before and 169.9/162.8–174.4 ms after.
Dispatch time excludes other synchronous keyboard work, and two frames are a
rendering proxy rather than proof that subsequent layout has settled.

## Destroyed Yjs adapter retention

A Chromium forced-GC probe retained a destroyed `YjsDoc` adapter whose native
Yjs document contained a 1 MB value. The native document remained reachable on
the baseline, including a serial run. The adapter now releases its native
reference after document teardown; the public `doc` getter throws after that
point. A native document independently retained by a caller remains the caller's
reference. The API guide documents this lifecycle change.

Provider attachments now track their connection and disconnection so destruction
waits for pending connections and shared disconnects before releasing the native
document. Repeated destruction shares one promise, disconnection failures do not
prevent other providers being attempted, and a previously returned document
unsubscribe remains safe after destruction. Unit tests cover pending success and
failure, concurrent detach, retry after disconnect failure, and a disconnect
already in flight during destruction. The registry test now retains its old
native document explicitly when comparing replacement subdocuments.

The forced-GC regression passed in Chromium; Firefox passed its lifecycle check.
Both passed serially with `repeat=200`. A broader browser run passed 44 checks,
and a later focused run passed 18 checks in Chromium and Firefox with 12 workers.
CRDT Jest passed 15 suites and 147 tests, document-model Jest passed 12 suites and
110 tests, and CRDT type checking passed. Focused lint had seven function-length
warnings. Creation, provider connection, repeated detach, failed connection,
disconnection, registry subdocument replacement, document-model ownership, and
teardown were reviewed for this API change. This does not collect live expired
undo data or release an independently borrowed Yjs document.

Five serial Chromium production-preview container-editing samples after the
change had normal-size synchronous median/range 0.6/0.6–0.8 ms and two-frame
median/range 27.0/16.8–27.9 ms. At `repeat=200`, these were 1.0/0.9–1.4 ms and
43.2/35.1–63.8 ms. The unchanged baseline appears above. These measurements
cover editing, not provider teardown.

## Completed editor-acquisition release

A Chromium forced-GC probe retained only a completed acquisition's `release`
function after its editor and storage had closed. Both the editor and document
remained reachable in the baseline, in parallel and serial runs. The release now
drops its cleanup closure before invoking it, while repeated or reentrant calls
share the same completion promise. A focused unit test exercises reentrant release
from a document subscriber; existing tests cover independent consumers and final
close. The storage creates and owns the editor and document, while each acquisition
owns one release; no public API or additional manager reference was introduced.

The forced-GC regression passed in Chromium, including a serial `repeat=200` run;
Firefox skips this Chromium DevTools-only check. The regression and embedding
loading suite passed 29 browser checks with one skipped in the two-browser run.
The focused editor-storage suite passed 21 tests and React type checking passed.
The full workspace core tests, React suite (119 suites, 721 tests), workspace type
check, and lint were also run before this final acquisition change: they passed;
workspace lint reported 557 warnings and no errors. They were not all rerun after
this narrow change.

Five serial Chromium production-preview container-editing samples after the
change had normal-size synchronous median/range 0.7/0.6–0.9 ms and two-frame
median/range 19.2/11.5–28.0 ms. At `repeat=200`, these were 1.1/0.8–1.3 ms and
46.0/37.2–48.5 ms. The unchanged baseline appears above. These measurements cover
editing rather than acquisition release.

## Destroyed history handle and live-history safety

A retained `YjsUndoManager` handle kept its native manager and document after
history destruction. In the production demo, a 1 MB document remained reachable
in the Chromium forced-GC probe, both in the initial and serial baseline runs.
The adapter now releases its native manager when either the history or the Yjs
document is destroyed, cancels scheduled trimming, and makes subsequent history
operations throw. Repeated destruction remains safe. This releases the wrapper's
reference; it does not release an independently retained native manager.

The forced-GC checks passed after explicit history destruction and after document
destruction, including Chromium `repeat=200` serial runs. The Firefox checks are
skipped because the forced-GC protocol is Chromium-only; Firefox keyboard undo
and CRDT lifecycle checks passed. CRDT Jest passed 15 suites and 150 tests before
one additional safety regression was added; the focused history suite then passed
seven tests. Document-model Jest passed 12 suites and 110 tests, CRDT type checking
passed, and focused lint had no errors.

A separate Yjs 13.6.33 experiment reproduced the risk of forced collection: two
native managers tracked a value's insertion and deletion, one was cleared, and
the other's transaction observer was detached. The document reported one remaining
transaction observer in both cases. Without forced collection the second manager
restored `important`; calling `Y.tryGc` before its undo left the value missing.
The new focused regression preserves the non-collection case. This demonstrates
that counting observers cannot establish exclusive history ownership. No forced
collection or unverified Yjs patch was introduced, so expired values in a live
document remain unresolved.

Five serial Chromium production-preview container-editing samples after this
change had normal-size synchronous median/range 0.8/0.7–0.9 ms and two-frame
median/range 22.9/9.5–25.5 ms. At `repeat=200`, these were 1.0/0.9–1.2 ms and
43.4/35.5–44.8 ms. The unchanged baseline appears above; these measurements
cover editing rather than history destruction.

## Further live-history investigation

A focused Yjs adapter regression now captures repeated undo/redo growth separately
from property-edit eviction. With a 10-entry limit, inserting 512 bytes and then
performing 250 undo/redo pairs produced a 131,261-byte encoded document in two
runs; the value and a subsequent undo/redo remained correct. The desired
under-20,000-byte assertion is currently skipped in
`packages/crdt-doc/src/yjs-doc/history-limit.test.ts` because no safe fix has been
established. Encoded size is a measure of retained collaborative representation,
not a direct heap measurement.

As of this investigation, Yjs's [v13 keep-release proposal](https://github.com/yjs/yjs/pull/835)
is open and has no listed reviewers, and [13.6.33 remains a listed v13 release](https://github.com/yjs/yjs/releases).
In an isolated, uninstalled copy of the proposal, moving 150 old entries to a
second native manager, clearing that manager, and collecting the corresponding
ranges reduced a 250-edit scalar-map sample from 129,684 to 52,472 bytes while
preserving the latest undo. A separate manager with a detached transaction observer
prevented that sample's content from being collected and could still undo. This
is a narrow experiment, not a proof of safe partial eviction or interoperability.

The same isolated proposal recorded 500 popped-history entries after 250
undo/redo pairs. Its encoded sample was 131,258 bytes before full clear and
remained that size immediately after clear; explicit collection after clear
reduced it to 3,258 bytes while preserving the current text. A full clear removes
recent undo, so this is not a replacement for bounded per-entry cleanup. A
synthetic multi-peer comparison also loaded two Yjs implementations into one
JavaScript realm, which Yjs warned is unsupported; its results are not treated
as interoperability evidence. The unreviewed proposal was not installed.

The new failing regression was run twice before being marked skipped, each time
reporting 131,261 bytes; afterward the focused history suite passed seven tests
with one skipped, and CRDT type checking passed. No runtime code was changed for
this experiment. A safe solution still needs ownership-aware per-entry cleanup,
repeated undo/redo coverage, and cross-version offline-peer tests without loading
multiple Yjs implementations into one realm.

### Selective collection and offline peers

A further experiment used three independent documents in one realm, all running
an isolated source copy of the same proposal; the proposal was not installed in
this workspace. Each peer had its own native undo manager, a five-entry limit,
and a nested map containing text. Peers made edits, deleted and recreated the
nested map, performed undo/redo, and exchanged encoded updates. The baseline
only removed expired stack entries. The candidate additionally transferred those
entries to a scratch manager, cleared it, and called `Y.tryGc` on their ranges.

With deterministic client IDs 17, 23, and 31 and random seed 40, the baseline
converged on all three peers, while the candidate threw `TypeError: Cannot read
properties of undefined (reading 'origin')` in `Item.integrate` while applying a
remote update. A reduction retained 13 of the 350 generated operations: steps
72, 73, 80, 92, 93, 96, 97, 98, 115, 117, 120, 121, and 123. This demonstrates
that **this combination** of selective eviction and forced collection is unsafe;
it does not establish that the upstream proposal alone causes the failure or that
production currently has this synchronization error.

A separate probe pinned a deleted map item by setting its internal Yjs `keep`
flag before history eviction. The baseline retained its content; the candidate's
scratch-manager clear removed the flag and collection replaced the content with
`ContentDeleted`. The flag is an internal detail, not a public ownership API,
but this shows why a cleanup cannot assume every existing retention claim belongs
to the entries it evicts. No candidate cleanup was applied to the workspace.

Restricting the forced collection filter to scalar map items (`ContentAny` with
`parentSub`) did not make that approach safe: seed 40 still failed in the same
remote integration path. Another sampled seed failed in the baseline instead,
so the experiment is evidence against adopting the candidate, not a general
claim that it causes every observed integration failure.

For seed 40, neither scratch-manager release alone nor forced collection alone
reproduced the integration failure in the same probe; the failure required the
combination. This does not establish safety for either operation independently.
The demo compaction's existing browser regressions separately verify that a
snapshot preserves pending insertion and deletion updates until their missing
predecessors arrive. The source documentation was corrected to state that the
pending updates survive in the replacement snapshot, rather than claiming that
the original log is retained when dependencies are missing.

Instrumenting the isolated Yjs copy narrowed the reduced failure: while a
remote map update was integrated, its resolved left origin was a `GC` structure
without item links. Collecting only expired deletion ranges also reproduced the
failure for seed 40. These observations identify the failing integration state,
but do not yet establish which retention claim must keep that structure alive.
The reduced baseline converged to `{"block":{"text":"new0-","value":"0-120"}}`
on all peers; the candidate failed during the final synchronization.

A control using the installed, unmodified Yjs 13.6.33 source and no explicit
history trimming also threw the same integration error for generated seed 315.
That run uses three native Yjs documents and native undo managers; it is not a
reproduction through the Rivto UI. This control limits attribution: the seed 40
comparison still distinguishes our candidate from its baseline for that exact
sequence, but the exception alone is not evidence that a failure was introduced
by selective cleanup. Investigating or changing the pre-existing synchronization
behavior is outside this memory-focused change.

Yjs's [document update API](https://docs.yjs.dev/api/document-updates) supports
syncing encoded updates without keeping a `Y.Doc` loaded. Its binary merge removes
duplicate update information but does not garbage-collect deleted content. That
can help a provider offload an inactive document, but it cannot reclaim retained
history from the live document while preserving its current bindings and undo
stack. The demo's update-log compaction and document destruction address their
respective memory owners; they do not resolve the live-history regression.

The reduced offline sequence is now also a deterministic regression in
`packages/crdt-doc/src/yjs-doc/history-limit.test.ts`. It uses the installed Yjs
and the actual `YjsUndoManager` adapter, advances deferred trimming after the
relevant edits, and verifies all three peers converge. The focused history suite
passed eight tests with the separate live-history growth test still skipped;
CRDT type checking and focused ESLint passed. This regression checks one
previously problematic sequence, not all offline or cross-version cases.

The reduced sequence was independently replayed against the isolated Yjs
proposal using the same operation order and two eviction points as the adapter
regression. Ordinary eviction converged; scratch-manager release plus forced
collection threw during final synchronization. This confirms that the new test's
scenario distinguishes that candidate in the isolated comparison; the test
itself runs the installed implementation, not the experimental one.

To distinguish actual heap retention from encoded-size growth, a Node process
with `--expose-gc` sampled `process.memoryUsage().heapUsed` after explicit GC.
Five native Yjs 13.6.33 runs retained approximately 1.06–1.36 MB more heap
than their pre-document measurements after 5,000 undo/redo pairs on 512 bytes;
zero-pair controls ranged from -92 KB to +119 KB due to process-level noise.
The 5,000-pair encoded states were approximately 2.61 MB and the text remained
correct. Each run used a fresh document and native manager and destroyed both
after measurement; the live manager had one undoable edit, so the experiment
does not depend on a large stack. These are Node heap samples, not browser heap
measurements or a proof of a specific retained object path.

A separate Chromium check exercised the actual demo's Yjs adapter and compared
heap usage after CDP `HeapProfiler.collectGarbage`, using a dedicated Vite preview
of this worktree's production build on port 5199. Three fresh-page controls that
created a 512-byte text and history without undo/redo increased reported JS heap
by 18,184–18,712 bytes. Three fresh pages that performed 3,000 undo/redo pairs
increased it by 1,578,272–4,022,292 bytes; the text still contained 512 bytes
and the encoded document was 1,605,478 bytes. Runs were serial in Chromium;
these are whole-page heap deltas and include any other live page allocations,
not a retained-object path or a Firefox measurement. An initial attempt used an
existing server from a different checkout and was discarded. The transient probe
and dedicated preview were removed after measurement.

Inspecting the native Yjs 13.6.33 struct store isolated the repeated-redo growth.
For 0, 10, 100, and 1,000 undo/redo pairs of a 512-byte `Y.Text` insertion,
the store contained respectively 0, 10, 100, and 1,000 deleted, kept
`ContentString` items with a `redone` link, plus one live item. The native undo
stack had one entry in every sample; encoded sizes were 527, 5,755, 52,804, and
523,505 bytes. In a three-pair sample, the current undo entry referenced the
latest insertion while older items formed a chain through `redone` IDs. These
are Yjs internals and establish the retaining representation for this case, not
permission to discard the chain or other histories' retention claims.

An isolated, uninstalled experiment collected only the payload of a deleted
`ContentString` item that already had a `redone` ID, preserving the item and its
link. It respected `doc.gc` and `gcFilter` but directly invoked the internal
`Item.gc` method even when `keep` was set. In the 250-pair sample this reduced
the encoded state from 131,258 to 3,258 bytes; another undo and redo preserved
the 512-byte text. In 5,000 generated single-document sequences with two native
undo managers, visible text matched the unmodified baseline at every recorded
step. In 2,000 three-peer generated sequences, final results or errors matched;
216 sequences already failed in both variants, so they are not evidence of
successful peer synchronization. The experiments did not establish correctness
for all shared histories, external retention claims, snapshots, or Yjs versions,
and scanned the full store after each operation. Bypassing a keep flag and using
internal methods is not a supported ownership protocol. This idea was not added
to the adapter and needs an upstream-supported way to identify and release only
superseded payloads before it can be considered safe.

A fresh full-suite validation exposed two test files that destroyed their borrowed
core while leaving the owning React runtime active. With the new history teardown,
a queued block projection then called a destroyed history manager. Their fixtures
now destroy the React runtime before the core; this also cancels its queued work.
No production projection change was needed. The two focused files passed 21 tests,
and the complete React suite then passed 119 suites / 722 tests. The core
workspace suite passed 47 suites / 414 tests with the one known live-history
growth test skipped. Focused ESLint reported no errors and two existing
function-length warnings; `git diff --check` passed. The full React run still
prints jsdom `window.scrollTo` warnings in passing suites.

## Completed runtime and panel cleanup retention

The React runtime and panel registration owners had the same completed-disposer
retention as the extension owner. In a production-preview browser probe, a
retained, already-called disposer kept its callback's 1 MB payload reachable.
Both runtime and panel probes failed in Chromium with 12 workers and again with
one worker; Firefox exercised idempotent calls without a forced-GC assertion.
The owners now use the existing `releaseAfterCall` helper, removing the callback
before invoking it. Focused Jest covers normal, repeated, reentrant, and throwing
cleanup; all six tests passed. After rebuilding, the three extension/runtime/panel
probes passed in Chromium and Firefox with 12 workers, and all six also passed
serially at `repeat=200`.

React and demo type checks, focused ESLint, Prettier, and `git diff --check`
passed; ESLint reported two existing constructor-length warnings. After both
changes, five serial Chromium production-preview editing samples had normal-size
synchronous median/range 0.7/0.6–0.9 ms and two-frame 33.3/27.8–33.4 ms; at
`repeat=200` these were 1.7/0.9–2.1 ms and 58.6/48.1–60.8 ms. A comparable
sample taken after the runtime change but before the panel change gave
0.8/0.7–1.0 ms and 33.3/27.5–33.4 ms, and at `repeat=200` 1.4/1.1–2.3 ms and
47.5/46.4–58.4 ms. These samples cover editing and two animation frames, not
cleanup latency; there is no matching timing baseline from before both changes.

The ownership review covered runtime creation/destruction, element-type registry
cleanup, panel-local event and keyboard registration, and the existing extension
owner. The runtime and panel still own and dispose their registrations; consumers
receive the same idempotent callbacks and no public dependency or lifecycle
contract changed. The Yjs live-history retention described above is independent
and remains unresolved.

The payload-only experiment was extended to 10,000 seeded sequences with two
undo managers, multi-character insertions, partial deletions, and undo/redo on
both managers. A further 5,000 sequences included overlapping text formatting
and compared Yjs text deltas after every operation. Those samples matched the
baseline, but are not proof that bypassing `keep` is safe for all consumers or
versions. The prototype still scans the full struct store after every operation:
a single Node sample of 3,000 pairs took 36 ms with the scan versus 19 ms without
it (one run, not a calibrated benchmark). Neither this scan nor direct internal
collection was added to production.

## Completed shared listener unsubscribe retention

A retained unsubscribe from the shared `Listeners` registry kept its callback,
the old event set, and the registry reachable after it had run. The extension
revision subscription reproduced the listener-payload retention in Chromium:
the weak reference stayed live after forced GC both with 12 workers and in the
serial retry. The registry now drops its subscription record before removing
the listener. Existing set semantics for duplicate listeners and the guard
against an old unsubscribe removing a replacement channel remain covered by
focused tests.

After rebuilding the utility package and demo, extension and document
subscription browser checks passed (10 Chromium/Firefox checks with 12 workers);
the new check also passed serially at `repeat=200`. Firefox ran the behavioral
path; the forced-GC assertion is Chromium-only. Core tests passed 47 suites / 414
tests with the separate Yjs growth test skipped; React passed 120 suites / 726
tests. Workspace type checks, focused lint, formatting, and `git diff --check`
passed. An initial focused Jest invocation failed because the new test used an
unavailable ESM `jest` global; replacing the mocks with counters resolved the
test setup before these passing runs.

Five serial Chromium production-preview editing samples after the change gave
normal synchronous median/range 0.8/0.7–1.1 ms and two-frame 33.3/24.8–33.4 ms;
`repeat=200` gave 1.4/1.2–1.9 ms and 50.4/43.9–61.2 ms. The immediately prior
sample was 0.7/0.6–0.9 ms and 33.3/27.8–33.4 ms; at `repeat=200` it was
1.7/0.9–2.1 ms and 58.6/48.1–60.8 ms. This is an editing sample, not a direct
unsubscribe benchmark.

Ownership review covered the utility registry's event sets and unsubscribe
handles, the React revision-store consumer, duplicate registrations, and stale
handles after channel replacement. The owner still owns active subscriptions;
completed handles no longer retain the owner or callback, and no public API or
creation/destruction responsibility changed. This does not address the separate
Yjs live-history retention above.

## Cleared subscription handles

A separate browser probe retained an extension revision unsubscribe without
calling it, then destroyed its owning React runtime. Chromium still observed the
listener payload after forced GC with 12 workers and on serial retry; Firefox
ran the lifecycle path without a forced-GC assertion. The initial fix invalidated outstanding subscription records when clearing a
channel or removing its last listener. That implementation was replaced after a
duplicate-registration retention regression was found, as documented below.

After rebuilding the utility package and demo, the extension/document browser
files passed 12 Chromium/Firefox checks with 12 workers, and the destruction
probe passed serially at `repeat=200` in both browsers. Focused tests cover
replacement channels, duplicate callbacks, a duplicate handle while its channel
remains active, and clearing during delivery. Core passed 47 suites / 414 tests
with the separate Yjs growth test skipped; React passed 120 suites / 728 tests.
Workspace type checks, focused lint, formatting, and `git diff --check` passed.

Five serial Chromium production-preview editing samples after this change had
normal synchronous median/range 0.9/0.8–1.2 ms and two-frame 33.3/27.3–33.4 ms;
`repeat=200` gave 1.5/1.1–1.9 ms and 45.4/44.1–47.7 ms. Immediately before this
change the equivalent samples were 0.8/0.7–1.1 ms and 33.3/24.8–33.4 ms, and
1.4/1.2–1.9 ms and 50.4/43.9–61.2 ms at `repeat=200`. These sample editing,
not the cost of clearing a large number of subscriptions.

The initial ownership review covered per-channel sets, handle records, individual
unsubscribe, channel replacement, clear-all, duplicate registrations, and
snapshot delivery. The subsequent duplicate-registration probe below changed
the handle implementation. The unresolved Yjs live-history issue is separate.

## Duplicate subscription bookkeeping regression

The first channel-clear fix introduced its own retention: registering the same
callback 100,000 times while discarding the unsubscribe handles left 100,001
strong bookkeeping records for one callback. In a forced-GC Node probe this
retained about 10.6 MB. A Chromium regression using the live extension revision
store retained approximately 5.3 MB and failed its 3 MB bound both in the
12-worker invocation and the serial retry. This was a regression introduced by
the initial fix, not an independently established pre-existing product issue.

The registry now keeps no per-handle collection. Each unsubscribe holds weak
references to its owner, original listener set, and callback; the active listener
set itself still strongly owns the callback. This retains exact channel identity
for stale handles and preserves duplicate-handle behavior. When the owner clears
or dies, an outstanding handle cannot keep those objects alive. Calling the
handle drops its weak references. A repeated Node probe retained about 8 KB for
100,000 discarded duplicate handles, with one callback registered. This approach
requires a runtime with standard `WeakRef` support, consistent with the workspace's
ES2022 target; older runtimes without it are not supported by this change.

After the final change, the extension and document browser files passed 15
checks with one Firefox-only heap-measurement skip at 12 workers. The duplicate
and destroyed-owner probes and the live-listener-after-GC behavior passed
serially at `repeat=200` (five passed, one Firefox heap skip). Focused tests also
cover duplicate handles and channel replacement. Core passed 47 suites / 414
tests with the known Yjs growth test skipped, React passed 120 suites / 728
tests, and workspace type checks, focused lint, formatting, and `git diff
--check` passed.

Five serial Chromium production-preview editing samples after the replacement
had normal synchronous median/range 0.6/0.5–1.1 ms and two-frame 33.4/27.9–33.5
ms; at `repeat=200` these were 1.3/0.9–2.2 ms and 49.2/46.2–56.0 ms. The
immediately previous implementation measured 0.9/0.8–1.2 ms and 33.3/27.3–33.4
ms, and 1.5/1.1–1.9 ms and 45.4/44.1–47.7 ms at `repeat=200`. These are editing
measurements; they do not benchmark mass subscription creation or GC latency.

Ownership review covered channel creation, live callbacks, individual and stale
unsubscribes, clear-all, duplicate registrations, and captured emission
snapshots. Callers still own their unsubscribe handles; the registry owns active
callback sets. Weak handles do not extend either owner's lifetime. The separate
Yjs live-history retention remains unresolved.

## Active listener overhead

A serial Node microbenchmark compared the original registry from `HEAD` with
the weak-handle implementation. With 10,000 distinct active callbacks and
retained unsubscribe handles, five fresh-process forced-GC samples used about
2.33 MB for the original and initially about 3.87 MB for the weak-handle
version. Sharing one weak owner reference per registry reduced the latter to
about 3.54 MB, still roughly 1.21 MB above the original in this synthetic case.
All samples retained the same 10,000 callbacks and handles. The separate
100,000-duplicate test still passes; the optimization does not add per-handle
bookkeeping to the registry.

After this optimization, seven warmed serial Node samples for 10,000 listeners
had original versus new median subscription times of 0.685 versus 2.222 ms,
emission 0.284 versus 0.244 ms, channel clear 0.001 versus 0.001 ms, and
calling all handles after clear 0.503 versus 1.312 ms. Ranges were respectively
0.576–0.831 versus 1.728–2.906 ms, 0.252–0.288 versus 0.242–0.261 ms,
0.001–0.008 versus 0.001–0.005 ms, and 0.457–0.659 versus 1.192–1.484 ms.
This is a synthetic Node comparison, not an end-to-end editor benchmark; it
shows a real active-subscription memory and creation/cleanup cost in exchange
for not retaining cleared owners through handles.

For the final code, the extension and document browser files passed 15 checks
with one Firefox heap-measurement skip at 12 workers; the large-document subset
passed five with the same skip serially. Five serial Chromium editing samples
had normal synchronous median/range 0.9/0.6–1.1 ms and two-frame 33.3/27.4–33.4
ms; `repeat=200` gave 1.5/1.1–2.1 ms and 46.9/43.3–67.6 ms. Immediately prior
to sharing the owner reference, equivalent samples were 0.6/0.5–1.1 ms and
33.4/27.9–33.5 ms, and 1.3/0.9–2.2 ms and 49.2/46.2–56.0 ms at `repeat=200`.
Core and React suites and workspace type checks passed again; the known Yjs
live-history growth test remains skipped. Focused lint and formatting passed.
The registry owns one weak reference to itself; unsubscribe handles share that
reference and still hold only weak references to their exact channel and callback.

## Yjs utility comparison

Yjs's [YKeyValue utility](https://github.com/yjs/y-utility) replaces a map with
an array-backed key/value representation and can reduce alternating-key CRDT
metadata. Its [implementation](https://github.com/yjs/y-utility/blob/master/y-keyvalue.js)
explicitly excludes nested Yjs values. An isolated, uninstalled comparison used
its source with the installed Yjs 13.6.33 and 250 writes of 512-byte values.
Without undo history, two alternating keys encoded to 3,187 bytes with `Y.Map`
and 1,106 with `YKeyValue`. With a native undo manager trimmed to ten entries,
the corresponding states were 131,789 and 133,676 bytes; both restored the
previous value on undo. A single-key sample with history was 129,681 versus
133,676 bytes. In another sample with 250 undo/redo pairs, encoded sizes were
131,418 versus 135,179 bytes, and both restored the visible value after redo.
These are narrow native-Yjs samples, not production or offline-merge validation.
The utility can address a different map-metadata pattern but does not resolve
the evidenced retained-history payload, and it cannot replace the adapter's
nested maps without changing its data model. It was not added as a dependency.

## Adapter offline merge coverage

A focused `YjsDoc` adapter regression now creates two disconnected peers, makes
concurrent text and independent map edits, reconnects by exchanging snapshots,
and undoes each peer's newest edit with a two-entry history limit. It verifies
convergence and preservation of the other peer's changes, then verifies that a
third undo does not reach the evicted text edit. The focused CRDT snapshot suite
passed three tests, CRDT type checking passed, and focused ESLint passed. An
initial type-check run caught an incorrect map generic in the test; it was
corrected before the passing run. This is an in-process snapshot-exchange test,
not a provider, browser network, cross-version, or live-history memory bound test.

## Processor registration retention

Block and element processor disposers retained their callback payload after
explicit disposal and after editor destruction. Both Chromium probes failed with
12 workers and on serial retry before the fix; Firefox exercised lifecycle
behavior without forced GC. The pipeline now releases a completed disposer, and
both managers retain the same one-shot disposer they return, so manager teardown
also releases its captured registration. Repeated disposal remains harmless.

Replacing a processor by the same ID also kept the old callback alive through
the manager's registration collection. An initial test created both callbacks
in one browser evaluation and still failed after the code change; separating
those evaluations removed the shared-scope confounder. The corrected test failed
for both block and element processors in an isolated build of the immediately
preceding set-based manager, including a serial Chromium retry, and passed with
the ID-keyed ownership change. A stale disposer cannot remove the replacement;
focused core tests cover both managers and the underlying pipeline. The isolated
build and temporary config were removed.

The production preview passed 12 Chromium/Firefox checks with 12 workers and
all 12 serially at `repeat=200`; forced-GC assertions are Chromium-only. The
focused pipeline and manager tests passed, as did the complete core suite (48
suites / 418 tests, one known Yjs growth skip), React suite (120 / 728), and
workspace type checks. Focused ESLint had no errors and four function-length
warnings; formatting and `git diff --check` passed.

Five serial Chromium editing samples after the final change had normal
synchronous median/range 0.8/0.7–1.2 ms and two-frame 33.3/30.1–33.4 ms;
`repeat=200` gave 1.3/1.0–1.6 ms and 45.7/42.7–70.2 ms. The prior comparable
sample was 0.9/0.6–1.1 ms and 33.3/27.4–33.4 ms, and 1.5/1.1–2.1 ms and
46.9/43.3–67.6 ms at `repeat=200`. These samples measure editing and two frames,
not processor-registration latency.

Ownership review covered processor creation, ID replacement, pipeline use,
explicit disposal, manager destruction, and the adjacent block-reference
cleanup using the same internal one-shot helper. Managers own active registration
disposers; the pipeline owns active processors; callers borrow idempotent handles.
No public dependency interface changed. The independent Yjs live-history issue
remains unresolved.

## Separate-process cross-version snapshot probe

A temporary, isolated Node harness ran the built `YjsDoc` adapter with Yjs
13.6.33 in one process and native Yjs 13.6.12 in another. Each process loaded
only its own Yjs version. Starting from shared text, both peers edited text and
different map keys offline, retained two undo entries, exchanged full encoded
updates, undid independently, and exchanged updates again. Both converged;
undoing the current adapter's remaining entry and attempting one more undo left
the older peer's value intact after another exchange. The final shared state
was `baseLR` with `{L: "L0", R: "R1"}`. The older native manager's two-entry
limit was applied by removing older stack entries, matching the current adapter's
existing eviction policy; no candidate garbage collection was used.

This is one deterministic in-process-per-peer snapshot scenario. It does not
establish cross-version compatibility for nested types, provider transports,
all undo histories, or the proposed cleanup. The older package was installed only
under `/tmp`, and neither version nor dependency files in the workspace changed.

## Destroyed demo document database reference

The demo session database intentionally retains updates for closed documents so
they can be reopened. Separately, a destroyed `DBDocumentModel` retained its
borrowed database through its own field. A Chromium probe held only the destroyed
model and a weak reference to a 1 MB buffer in an isolated session database; the
buffer remained reachable before the fix, both with 12 workers and on serial
retry. The model now releases its database field after superclass teardown, even
when provider disconnection fails. This does not clear a database still owned by
the host or offload its saved snapshots.

The rebuilt demo passed the document-storage and database browser files (18
checks in Chromium/Firefox). The new probe also passed for successful teardown
and a rejected provider disconnect in both browsers, including serial
`repeat=200` runs. Forced-GC assertions are Chromium-only. Demo build and type
check, focused lint, formatting, and `git diff --check` passed.

Five serial Chromium production-preview editing samples after the change had
normal synchronous median/range 0.7/0.6–1.0 ms and two-frame 33.3/27.4–33.4 ms;
`repeat=200` gave 1.3/1.0–1.6 ms and 44.5/41.6–48.8 ms. The prior comparable
sample was 0.8/0.7–1.2 ms and 33.3/30.1–33.4 ms, and 1.3/1.0–1.6 ms and
45.7/42.7–70.2 ms at `repeat=200`. These measurements cover editing and two
frames, not document close or storage performance.

Ownership review covered the host-created session database, the model's borrowed
reference and update subscription, manager callbacks, and asynchronous CRDT and
provider teardown. The model releases its reference only after teardown settles;
the host remains responsible for the database. The separate live Yjs history
retention and offloading of intentionally saved snapshots remain unresolved.

## Closed demo document snapshot offloading

The demo session database deliberately kept updates for a closed document so it
could reopen it. A 300 KB property edit left four update buffers in the database
after both source and reference views closed; the new offload regression failed
in Chromium and Firefox with 12 workers and again serially. This is intentional
saved state rather than an unbounded live-history leak, but the user requested
browser storage to unload such snapshots.

The session database now counts open `DBDocumentModel` instances per document.
When the last one closes, it compacts the saved updates into one Yjs update and
writes it to `sessionStorage`, then drops the in-memory buffers only after the
write succeeds. Restore or a later update loads that saved update first. Storage
quota, access, or compaction failure leaves the existing updates in memory;
missing or unreadable stored data raises an error instead of silently replacing
it. Database shutdown reloads offloaded updates when possible before deleting its
keys, preserving its existing retained-state behavior. Page exit removes this
page's keys when it is not entering the back-forward cache; cached pages keep
their keys. This is session-only demo storage, not persistent application storage.

Native `Uint8Array.toBase64` / `fromBase64` are used when available, with a
chunked `btoa` / `atob` fallback for older browsers. [MDN documents the native
encoding method](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64)
and its newer browser availability. The fallback and quota rejection are tested.
Session storage remains quota-limited: snapshots that do not fit remain in RAM.
An abrupt process termination can leave inaccessible session keys until the tab
closes, and synchronous encoding/compaction creates temporary allocations. The
saved block/element indexes remain in memory. Offloading a closed document does
not persist its undo stack and does not solve live Yjs history retention.

The final production-preview database and document-storage browser files passed
38 Chromium/Firefox checks with 12 workers. The database file passed 32 serial
checks at `repeat=200`; the strengthened closed-document check additionally
verified in Chromium that the original update buffers were collectible before
reopening. Tests cover last-model ownership, quota fallback, temporarily denied
reads, pending dependencies, peer offline edit/undo, native-base64 fallback,
shutdown, and back-forward-cache versus page-exit cleanup. One later rerun first
failed to connect because its preview server had been stopped; after restarting,
serial and parallel reruns passed. Demo build/type check, focused lint, formatting,
and `git diff --check` passed.

Five serial Chromium close/reopen samples with a 300 KB property measured the
synchronous offload step at median/range 2.3/1.9–2.8 ms in the normal demo and
6.7/4.9–8.4 ms at `repeat=200`; restoration took 2.1/1.8–3.5 ms and
3.2/2.9–6.8 ms respectively. With a 2 MB property, offload took 8.0/7.7–9.6 ms
and 7.5/7.3–8.3 ms, and restoration 10.8/9.7–11.7 ms and 13.1/10.6–14.1 ms.
The comparison disabled only offloading in the same build: its measured release
step was effectively 0 ms, while 2 MB restoration was 1.5/1.4–3.8 ms and
3.1/2.2–4.8 ms. These do not include the whole close/reopen interaction or peak
heap. In an earlier single-browser encoding probe, the fallback conversion alone
was substantially slower for 2 MB; results depend on browser support and hardware.

Five serial Chromium editing samples after the final implementation had normal
synchronous median/range 0.9/0.8–1.2 ms and two-frame 33.4/27.4–33.4 ms;
`repeat=200` gave 1.2/1.0–2.1 ms and 45.0/43.2–48.9 ms. Before this work,
the comparable sample was 0.7/0.6–1.0 ms and 33.3/27.4–33.4 ms, and
1.3/1.0–1.6 ms and 44.5/41.6–48.8 ms at `repeat=200`.

Ownership review covered model construction, multiple model retention, close and
provider-failure teardown, saved-update compaction, browser storage, restoration,
late updates, and database/page shutdown. The host owns the session database;
models borrow it and release their counts once; the database owns offload keys
and retains an in-memory fallback. No core dependency interface was changed.

## Demo database metadata teardown

Two opposite retention paths were reproduced with isolated workspace metadata.
A live metadata map kept its destroyed database through an observer; a synthetic
1 MB update buffer remained reachable in Chromium. Separately, retaining a
destroyed database kept the native metadata document alive through its map
wrapper after the document had been destroyed. Both Chromium regressions failed
before their respective fixes, including serial reruns. Firefox exercised the
same lifecycle, but the forced-collection assertions are Chromium-only.

The database now unsubscribes its metadata observer and releases its borrowed
map and document references on destruction, including when unsubscription
throws. Repeated destruction and either metadata-first or database-first
teardown are covered. A destroyed database no longer participates in shared
workspace metadata; its saved document updates are still available. The host
owns the metadata document, while the database borrows it and owns only its
subscription. The model borrows the database, and the host remains responsible
for both lifetimes; no core dependency interface changed.

After both changes, the production-preview database and document-storage suites
passed 46 checks across Chromium and Firefox with 12 workers, and 46 serially.
They include saved-update restoration, storage failures, pending dependencies,
and offline peer edits. Demo build and type checking and focused lint passed.
Five serial Chromium editing samples after the final change had normal
synchronous median/range 0.8/0.7–1.0 ms and two-frame 33.3/33.0–33.4 ms;
`repeat=200` gave 1.0/0.8–2.0 ms and 42.7/42.0–46.7 ms. The preceding
comparable sample was 0.9/0.5–1.0 ms and 33.2/30.2–33.4 ms normally, and
1.2/0.9–1.5 ms and 43.5/43.2–45.5 ms at `repeat=200`. These samples exercise
editing, not teardown, and two frames do not establish complete layout settling.

## Upload callback and cancelled write retention

Explicit-GC Jest regressions reproduced a retained panel after a completed upload
when the provider retained its progress callback, and after cancellation of a
write the provider left pending. A separate pending-batch regression showed that
retry callbacks in the status store also retained the panel. Each failed before
its respective fix and passed afterward. The progress callback now captures the
status ID rather than the upload context; cancellation stops waiting for the
write, and teardown clears upload feedback and retry callbacks. A provider that
ignores its signal may still continue its own write.

The focused ingestion and explicit-GC suites passed 17 tests. The production demo
build passed; eight existing pending-upload, image/file-picker and file undo/redo
browser checks passed in Chromium and Firefox with 12 workers and serially.
Focused lint reported no errors and one existing function-length warning. Five
serial Chromium editing samples after the final change gave synchronous
median/range 0.7/0.4–0.8 ms and two-frame 33.3/33.2–33.4 ms normally;
`repeat=200` gave 1.3/0.8–1.3 ms and 39.9/39.0–43.5 ms. Before the changes,
the comparable sample was 0.8/0.7–1.0 ms and 33.3/33.0–33.4 ms normally,
and 1.0/0.8–2.0 ms and 42.7/42.0–46.7 ms at `repeat=200`. These editing timings
do not measure file upload or complete layout settlement.

Ownership review covered the image and file extensions' ingestion instances,
their borrowed panel contexts and status stores, the provider write and progress
callback, and teardown. Each extension creates and owns its status store and
ingestion; the ingestion borrows the store, cancels its work and clears its retry
callbacks on destruction. The provider owns its callback and write. The narrow
status interface gained only the clear operation required by this cleanup; no
provider or editor lifecycle ownership changed.

## Cancelled host file opener

An explicit-GC Jest regression reproduced a retained editor when a host opener
left its operation pending after the caller's signal was aborted. The operation
also remained unsettled. The same test confirmed that a cancelled pending
provider read already released the editor. The opener regression failed before
the fix and passed afterward. `openBinary` now stops waiting on cancellation;
the host still owns its operation and may continue it. The existing public
attachment contract and implementation documentation describe this distinction.

The attachment manager borrows editor document identity and extension-owned
handler registrations. A file view owns the abort controller for its request;
the host owns the opener's work. No ownership or dependency interface changed.
The explicit-GC and attachment-handler suites passed nine tests. The production
demo build passed, and the file-card opening scenario passed in Chromium and
Firefox with 12 workers and serially. Focused lint and formatting passed.

Five serial Chromium editing samples after the change gave synchronous
median/range 0.7/0.5–0.8 ms and two-frame 33.3/33.1–33.4 ms normally;
`repeat=200` gave 1.1/0.9–1.5 ms and 42.0/41.1–46.9 ms. Before the change,
the comparable sample was 0.7/0.4–0.8 ms and 33.3/33.2–33.4 ms normally,
and 1.3/0.8–1.3 ms and 39.9/39.0–43.5 ms at `repeat=200`. These editing
samples do not measure file opening or complete layout settlement.

## Upload error callback retained after teardown

A further explicit-GC regression retained the provider's progress callback after
a completed upload and weakly referenced the ingestion's error callback. The
error callback remained reachable after teardown. A control replacing the
retained progress callback with a separate no-op allowed collection, while
clearing the error callback during ingestion teardown made the original
regression pass. The progress callback can still keep the destroyed ingestion
instance and its emptied status store alive while the provider retains it; it no
longer keeps the host error callback alive. The callback is cleared after work
is cancelled and status retry callbacks are released.

The regression and existing ingestion suite passed 18 tests with explicit GC;
the demo production build, focused lint and formatting passed. Six existing
pending-upload and image/file-picker checks passed across Chromium and Firefox
with 12 workers. Five serial Chromium editing samples after the change gave
synchronous median/range 0.5/0.5–0.8 ms and two-frame 33.3/33.2–33.5 ms
normally; `repeat=200` gave 1.1/1.0–1.4 ms and 41.5/39.9–43.9 ms. Before the
change the comparable sample was 0.7/0.5–0.8 ms and 33.3/33.1–33.4 ms normally,
and 1.1/0.9–1.5 ms and 42.0/41.1–46.9 ms at `repeat=200`. These samples cover
editing, not upload latency or full layout settlement.

Ownership review covered the host-provided error callback, the file and image
extensions that create ingestion, provider-owned progress callback, and status
store. Ingestion borrows the error callback for its active lifetime and releases
it on destruction; provider work remains independently owned by the provider.
No external interface or ownership transfer changed.

## Direction for future history fixes

Keep Yjs and use the document lifetime as the primary memory boundary. While a
document is open, retain the configured undo limit and normal Yjs collection;
do not force collection of internal history without proving safety for all
relevant history owners and offline peers. After the last consumer closes a
document, preserve its collaborative state and release its live model, Yjs
document, and undo manager. The host owns durable persistence; the demo's
session-storage offload is not durable storage. Reopening starts a fresh in-memory
undo history.

A controlled reload during a long editing session is a possible future option,
not an automatic policy: it must preserve unsynced updates, rebuild consumers and
bindings safely, and treat loss of undo history as an explicit product decision.
Continue evaluating upstream-supported cleanup or a validated patch for live
history. The current approach does not bound memory for a document that remains
open indefinitely; do not claim that it does.

## Closed demo pane retained by React's previous render

A combined production-preview regression opened the actual demo document, made
independent local and offline peer edits, and closed the final editor consumer.
In Chromium, explicit GC still found the former React editor, document model,
and native Yjs document reachable, although the native undo manager had been
collected. The same retention reproduced with 12 workers and serially. A
Chromium heap snapshot traced the retaining path through the mounted React tree's
alternate render and its old pane state and element props. Firefox exercised the
lifecycle and merge but did not run the Chromium-specific collection assertion.

The demo clears the closed pane's editor reference and renders each pane in its
own subtree, so stale parent render state no longer retains the editor through
its old element props. This only changes demo pane ownership. A second open pane
still owns the shared editor and remains usable when the first closes. After the
last close, the combined regression verified that the old editor, model, native
Yjs document, and undo manager were collectible in Chromium. It then reopened
from the offloaded update and merged a peer's offline edit, with both peers
converging. No open document or history is silently reset.

The production demo build passed. The affected database and document-storage
files passed 50 checks across Chromium and Firefox with 12 workers; the two new
scenarios also passed four checks serially. Focused lint reported no errors and
four function-length warnings. Five serial Chromium editing samples in the
actual embedding demo gave synchronous median/range 0.7/0.5–0.7 ms and two-frame
33.4/33.1–33.5 ms normally, and 0.7/0.6–0.7 ms and 33.4/33.2–33.5 ms with
`repeat=200`. A comparable pre-change sample on this route was not captured, so
these figures are not a before/after comparison and do not measure close latency
or complete layout settlement.

Ownership review covered the demo host's pane set, React state and render props,
shared `EditorStorage` acquisitions, model and CRDT destruction, session snapshot
storage, and offline peer restoration. Each pane releases one acquisition;
`EditorStorage` destroys the shared editor and model only after the last release.
The host database owns saved updates, and the host's persistence remains separate
from core `DocumentStorage`. The unresolved live Yjs history limitation remains.

## Closed demo document row projections

The demo database intentionally kept full detached block and element rows in
addition to its saved collaborative updates. A Chromium GC regression showed a
closed block row with a 300 KB property remained reachable after its update was
successfully offloaded; this failed with 12 workers and serially. This is saved
derived state rather than an unbounded live-history leak. The snapshot already
contains the authoritative data, so retaining those full rows is unnecessary
while that document has no model consumers.

After the snapshot is written successfully, the demo drops that document's row
projections and retains lightweight block IDs for closed-document lookup. It
rebuilds block and element rows from the collaborative state on reopen, then
reconciles lookup membership, including blocks deleted by an offline peer.
Other documents' rows remain available. If snapshot storage fails, both the
updates and rows stay in memory. The saved snapshot, not JSON conversion of the
rows, is the source of truth. This adds one set of block IDs per closed document;
without a workspace metadata index, lookup scans these sets. Close scans the
row tables, and reopening traverses the restored document to rebuild projections.
The separate open-document Yjs history limitation remains unresolved.

The production demo build passed. Database and document-storage browser files
passed 58 checks across Chromium and Firefox with 12 workers; 12 focused checks
passed serially. Chromium GC assertions cover both block and element rows.
Browser coverage includes multiple documents sharing a block ID, quota failure,
last-consumer reopening, and offline deletion with and without workspace
metadata. The React database-model suite passed nine tests; focused lint had no
errors and two test-length warnings. Full workspace suites were not rerun.

Five serial Chromium samples measured model creation and destruction in the
embedding demo after warmup. A same-build control disabled row release and row
reconstruction; it is a simulated comparison, not a separate unchanged build.
At normal size, control open median/range was 0.2/0.2–0.4 ms and close was
0.2/0.1–0.3 ms; row offload and reconstruction measured 0.3/0.1–0.4 ms and
0.1/0.1–0.2 ms. At `repeat=200`, control open and close were 2.4/1.9–6.4 ms and
2.8/2.4–3.0 ms; the changed path was 2.9/2.5–3.7 ms and 2.9/2.1–5.4 ms. These
measurements exclude browser UI and use a small source document without the
300 KB property. Five editing samples after the final change gave synchronous
median/range 0.5/0.3–0.7 ms and two-frame 33.4/33.2–33.4 ms normally, and
0.6/0.5–0.8 ms and 33.3/33.3–33.4 ms at `repeat=200`. The preceding comparable
sample was 0.7/0.5–0.7 ms and 33.4/33.1–33.5 ms normally, and 0.7/0.6–0.7 ms
and 33.4/33.2–33.5 ms at `repeat=200`. Two frames do not establish complete
layout settlement.

Ownership review covered demo models, per-document consumer counts, snapshot
storage and its failure path, row and block-membership projections, shared IDs,
registry-backed and local lookup, and restoration after offline updates. The
model borrows the database; the database owns both projections and releases the
rows only after storage succeeds and the last model closes. Core storage and
provider ownership did not change.

## Broader workspace validation

After the closed-pane and row-offloading changes, `pnpm test` passed all six
core package runs: 48 suites and 418 tests passed, with the known Yjs
live-history growth test skipped. The React suite passed 120 suites and 728
tests; six explicit-GC cases in two suites were skipped in the ordinary Jest
run. The focused upload and attachment GC cases had been run separately with
`--expose-gc` as recorded above. Workspace type checks passed. Workspace lint
completed with no errors and 559 function-length and other warnings.

Against a fresh production demo preview, the `e2e/*memory.spec.ts` selection
passed 120 checks across Chromium and Firefox with 12 workers and skipped 16:
the known unresolved history-property check in both browsers, and 14 Firefox
checks that require Chromium-specific collection tooling. This selection
includes other existing memory tests as well as the new regressions; it is not
the full Playwright suite.

A separate 12-worker run of the cross-document, embedding, editor lifecycle,
history, image, and clipboard-converter files passed 335 checks, skipped five,
and failed four at `repeat=200`: one Chromium journal embedding check and three
Firefox copied-image address checks. Serial reruns of those scenarios across
both browsers passed all eight checks. The parallel failures and serial results
are reported separately; they do not establish that every Playwright scenario
or every browser memory behavior is validated. Parallel timing output was not
used as a dedicated performance measurement. The full 3,532-case Playwright
suite was not run.

## Closed-row lookup notification ordering

A follow-up to row offloading reproduced a behavioral regression introduced by
that change. If a peer deleted a block while its document was closed and the
demo database had no workspace index, reopening removed the block but notified
lookup subscribers before removing the closed-document ID. Subscribers therefore
read the stale location and received no later correction. The regression failed
in Chromium and Firefox with 12 workers and serially; the registry-indexed path
already passed. The database now removes the closed ID before emitting the
existing deletion notification. This correction is required for the row-memory
change rather than a separate feature.

The production demo build passed. The two affected browser files passed 58
checks across Chromium and Firefox with 12 workers; the indexed and unindexed
offline-deletion cases passed four checks serially. The React database-model
suite passed nine tests. Focused lint reported no errors and two test-length
warnings; formatting passed. Five serial Chromium embedding-demo editing samples
after the correction gave synchronous median/range 0.4/0.4–0.6 ms and two-frame
33.3/33.3–33.4 ms normally; `repeat=200` gave 0.7/0.4–0.8 ms and 33.3/33.2–33.5
ms. The preceding comparable sample was 0.5/0.3–0.7 ms and 33.4/33.2–33.4 ms
normally, and 0.6/0.5–0.8 ms and 33.3/33.3–33.4 ms at `repeat=200`. These
samples do not measure reopen or complete layout settlement.

The ownership review covered the offloaded block ID set, local and registry
lookup, notification timing, and row reconstruction after an offline deletion.
The database continues to own its derived lookup state; no public interface or
provider ownership changed. Full workspace suites were not rerun after this
small ordering correction.

## Reacquisition racing the final release

A production-demo browser regression now exercises the complete storage path
when a new consumer requests a document while the previous final acquisition is
being released. It creates separate local and offline-peer edits, closes the
visible consumers, races release against reacquisition, and verifies the reopened
editor is a fresh instance with the local edit restored. Exchanging snapshots
then preserves both peers' edits and converges. The existing storage code passed;
no runtime change was needed. The check passed in Chromium and Firefox with 12
workers and serially. It covers one interleaving and offline text edits, not all
provider failures or possible peer histories. Earlier tests separately verify
collection of the old resources and storage failure fallback.

The demo production build and focused lint passed; lint reported two existing
test-length warnings. This was a test and documentation change, so editor
performance measurements were not repeated. The live Yjs history limitation
remains unresolved.

## Final update during provider teardown

A focused model regression reproduced a data-preservation gap in the demo's
last-consumer cleanup: a provider could apply an update while disconnecting,
after the database had already removed its update observer. The reopened
snapshot lacked that update. The database observer now stays active until the
model and its providers finish teardown; it is then removed and the database
reference and model count are released even if teardown fails. This is required
to preserve collaborative state while releasing the closed document, not an
unrelated editor change.

The model suite passed 11 tests, including final updates on successful and failed
provider disconnection. A production-demo browser regression also applied an
offline peer's update during disconnection, verified the update was offloaded,
and restored it after both successful and failed disconnects. The database and
document-storage browser files passed 64 checks in Chromium and Firefox with 12
workers; eight focused teardown and collection checks passed serially. The demo
build and focused lint passed, with two test-length warnings.

Five serial Chromium editing samples after the change gave synchronous
median/range 0.7/0.6–0.9 ms and two-frame 33.3/33.3–33.4 ms normally;
`repeat=200` gave 0.7/0.6–0.9 ms and 33.4/33.3–33.4 ms. The preceding
comparable sample was 0.4/0.4–0.6 ms and 33.3/33.3–33.4 ms normally, and
0.7/0.4–0.8 ms and 33.3/33.2–33.5 ms at `repeat=200`. These samples cover
editing, not provider shutdown or full layout settlement. Full workspace suites
were not rerun for this final demo change.

Ownership review covered the model's database observer, the base model's
history and CRDT teardown, provider disconnection, session update offloading,
and failure cleanup. The model borrows the host database until provider cleanup
settles; the CRDT owns the provider and the host retains the saved update. No
provider interface changed. A provider that never completes disconnection can
still delay teardown; this change does not impose a timeout or discard data.

## Offline deletion control for the experimental Yjs patch

The `hotfix-4` worktree has a skipped case for an offline insertion into a
nested text whose parent was deleted before snapshot reload. To distinguish a
patch-specific regression from stock Yjs behavior, the same native Yjs
sequence was run in separate Node processes with this workspace's installed
13.6.33 and with `hotfix-4`'s installed patched 13.6.33. Each started with a
nested text `start`, synchronized an offline peer, deleted the parent on the
first document while its native undo manager retained history, reloaded that
deleted state into a fresh document, and then applied the peer's offline
insertion `OFFLINE` at position three. Both versions represented that peer
insertion as a `GC` structure on the reloaded document rather than a retained
text item.

In a follow-up on both versions, the deleting peer undid its deletion and the
peers exchanged updates; all ended with `start`, without `OFFLINE`. A control
that delivered the offline peer's update directly to the still-live deleting
document before its undo also ended with `start` on all peers. These results
show that this particular sequence is not evidence that the `hotfix-4` patch or
our snapshot offload introduced the missing insertion. They do not establish a
general CRDT convergence guarantee or the expected product semantics for every
concurrent delete and undo. The separate ordinary offline-edit merge regression
continues to pass. No runtime or dependency change was made for this experiment.

As checked on 2026-11-11, the upstream [v13 keep-release proposal](https://github.com/yjs/yjs/pull/835)
remains open and records popped history for release when stacks are cleared; it
does not provide a documented bounded per-entry cleanup. Its [v14 counterpart](https://github.com/yjs/yjs/pull/834)
also remains open. The existing isolated experiments above explain why neither
the proposal plus forced collection nor the experimental worktree has yet been
adopted for live history cleanup.

## Destroyed model retaining its native document

The final-provider-update browser test was strengthened to keep the destroyed
model and its host database referenced while weakly observing the old native
Yjs document. Chromium retained the native document after both successful and
failed provider disconnection, in parallel and serial runs. A heap snapshot
showed the retained model pointing through its plugin-data manager and Yjs map
wrapper to the native document; the model also owned the block and element
managers with their CRDT wrappers.

`DocumentModelImpl` now releases its owned block, element, plugin-data, and
history manager references after CRDT/provider teardown settles, including on
failure. Its manager accessors remain available during provider teardown so the
demo can persist final updates; afterward they throw a destroyed-model error.
Repeated teardown keeps the existing cleanup behavior. This releases the native
document when the destroyed model itself remains referenced, provided no other
owner independently retains a native wrapper or manager. A caller retaining a
manager separately still owns that reference; its collection was not established
by this test. The model continues to expose the same manager interfaces while
active.

The strengthened production-preview browser test passed in Chromium and Firefox
with 12 workers and serially; the explicit collection assertion is Chromium-only.
The affected database, storage, and history-destruction files passed 66 checks
with two Firefox GC cases skipped. Core workspace tests passed 420 tests with the
known live-history test skipped, and the React suite passed 730 tests with six
explicit-GC cases skipped in its ordinary run. Workspace type checks passed.
Focused lint had no errors and five existing or test-length warnings.

Five serial Chromium embedding-demo editing samples after the change gave
synchronous median/range 0.5/0.3–0.9 ms and two-frame 33.3/33.3–33.4 ms
normally; `repeat=200` gave 0.7/0.5–0.9 ms and 33.4/33.2–33.5 ms. Before this
change the comparable sample was 0.7/0.6–0.9 ms and 33.3/33.3–33.4 ms
normally, and 0.7/0.6–0.9 ms and 33.4/33.3–33.4 ms at `repeat=200`. These
measurements cover editing and two frames, not teardown latency or full layout
settlement. The full Playwright suite was not rerun.

Ownership review covered the document model's four manager references, manager
construction and public interfaces, CRDT/provider teardown, the demo's final
update observer, and retained destroyed-model and database handles. The model
owns one reference to each manager and drops it after provider cleanup; callers
borrow managers and do not acquire teardown ownership. No manager wrapper or
second manager reference was added. Live Yjs history retention remains separate.

## Retained manager handles after document destruction

The preceding destroyed-model test did not establish what happened when a caller
retained a manager independently. A new Chromium explicit-GC probe retained each
manager separately after its model and database were destroyed. Block, element,
and plugin-data managers each kept the native Yjs document alive; the history
manager did not. The three retention failures reproduced with 12 workers and
serially. Firefox exercises manager teardown but does not run the Chromium-only
collection assertion.

The model now tells its concrete, document-owned block, element, and plugin-data
managers to release their CRDT roots after the CRDT and providers finish
teardown. Block and element managers also release their snapshot caches and
listeners. The model then drops its own manager references, including when
provider disconnection fails. The public consumer interfaces still expose only
normal manager operations; teardown is owned by the model. Retained manager
handles no longer retain the native document in the focused Chromium probe.
Access to released manager data throws rather than using a destroyed document.
Separately retaining a native CRDT wrapper or undo scope still constitutes an
independent reference and was not covered by this manager-handle guarantee.

The demo production build passed. The affected database, document-storage, and
history-destruction browser files passed 74 checks across Chromium and Firefox
with 12 workers, with two Firefox-only explicit-GC checks skipped. The four
retained-manager cases passed eight checks serially. Core workspace tests passed
420 tests with the known live-history test skipped; React passed 730 tests with
six explicit-GC tests skipped in its normal run. Workspace type checks passed.
Focused lint reported no errors and seven function-length warnings.

Five serial Chromium embedding-demo editing samples after the change gave
synchronous median/range 0.5/0.4–0.8 ms and two-frame 33.4/33.2–33.4 ms
normally; `repeat=200` gave 0.7/0.5–1.0 ms and 33.3/33.3–33.4 ms. The prior
comparable sample was 0.5/0.3–0.9 ms and 33.3/33.3–33.4 ms normally, and
0.7/0.5–0.9 ms and 33.4/33.2–33.5 ms at `repeat=200`. These samples do not
measure document teardown or full layout settlement. The full Playwright suite
was not rerun.

Ownership review covered manager construction, the model's concrete lifecycle
ownership, narrow consumer interfaces, the block and element caches and
subscriptions, plugin-data roots, history scopes, provider final updates, and
failure cleanup. Teardown occurs after provider disconnection so saved final
updates are not lost. The live Yjs history issue remains separate.

## Manager observers after adapter teardown failure

A regression test exposed an edge case introduced by releasing manager roots: if
a CRDT adapter's `destroy()` rejects before it stops publishing updates, its
old block and element observers could still call managers whose roots and caches
had been released. A later root update threw `Block manager is destroyed`.

Block and element managers now retain their own CRDT observer disposers and
remove all of them during manager teardown before releasing roots, caches, and
listeners. Cleanup attempts every disposer and reports an `AggregateError` if
any removal fails. The model still waits for provider teardown first, preserving
final updates. A browser probe keeps an adapter alive after simulated teardown
failure; the obsolete managers are collectible in Chromium and subsequent CRDT
writes do not call them. Firefox checks behavior but not explicit collection.
This corrects the preceding memory cleanup's failure path.

Core workspace tests passed 421 tests with the known live-history test skipped;
React passed 730 with six explicit-GC tests skipped in the normal run. Workspace
type checks passed. The affected browser files passed 78 checks across Chromium
and Firefox with 12 workers, with two Firefox explicit-GC cases skipped; 12
retained-manager and failure checks passed serially. Focused lint passed with
seven function-length warnings. The demo production build passed.

Five serial Chromium embedding-demo editing samples after the change gave
synchronous median/range 0.5/0.4–0.8 ms and two-frame 33.3/33.3–33.4 ms
normally; `repeat=200` gave 0.7/0.5–0.9 ms and 33.3/33.2–33.4 ms. Before the
change the comparable sample was 0.5/0.4–0.8 ms and 33.4/33.2–33.4 ms
normally, and 0.7/0.5–1.0 ms and 33.3/33.3–33.4 ms at `repeat=200`. This
measures editing and two frames, not teardown or complete layout settlement.
The full Playwright suite was not rerun.

Ownership review covered manager construction, each root and update subscription,
model-driven cleanup after CRDT/provider settlement, cleanup errors, and retained
manager handles. Each manager owns only the subscriptions it registers; callers
still receive narrow interfaces without teardown. If an adapter's unsubscribe
itself throws, cleanup reports the error, but cannot guarantee that adapter has
actually removed its callback. Live Yjs history retention remains separate.

## Shared manager behavior after teardown changes

A fresh production-demo build was checked against the cross-document editor,
embedding loading, editor lifecycle, history deletion and limit, element tree,
Edgeless lifecycle, Edgeless interaction, and embedding browser files. The
12-worker run passed 326 checks across Chromium and Firefox and skipped four
existing WebRTC or selective-sync cases. It included Page and Edgeless,
`repeat=200`, editing, selection, undo, and shared-document interactions. There
were no parallel failures to rerun. This is a focused functional selection, not
the full Playwright suite; parallel timing output was not treated as dedicated
performance evidence.

No runtime code changed during this validation. The retained-manager GC,
provider-failure cleanup, workspace test, type-check, and serial timing results
remain recorded above. Open-document Yjs history retention remains unresolved.

## Directly retained CRDT wrappers

A separate Node `--expose-gc` probe compared a directly retained wrapper with a
control that dropped it after `YjsDoc.destroy()`. For each of `getMap`,
`getArray`, and `getText`, the retained wrapper kept the old native `Y.Doc`
reachable and could still read a one-million-character value. In the matching
control, the native document was collectible. This confirms that releasing the
adapter or a model does not override an independent caller's strong wrapper
reference. These are Node collection observations, not Firefox or Chromium heap
measurements, and do not promise that using a wrapper after destruction is a
supported operation.

This is independently retained state, not evidence of an unowned manager leak.
The adapter method documentation and CRDT guide now tell callers to release
wrappers when finished. Automatically weakening all wrappers was not adopted:
that would change whether an explicitly retained live or detached shared type
keeps its data alive, and has not been validated against wrapper construction,
attachment, subscriptions, and every caller. No executable code or type
declaration changed in this documentation pass; browser and performance tests
were not applicable. The separate unbounded live-history issue remains.

## Released CRDT observer handles

A Chromium GC regression retained an already-called `observe()` disposer after
closing a Yjs document. Both map and array disposers kept the old native document
and a one-megabyte callback payload reachable; both failures reproduced with 12
workers and serially. A text wrapper has no `observe()` method in this adapter.
Firefox exercised the lifecycle but did not run the Chromium-specific GC
assertion.

Map and array wrappers now share one deep-observer implementation. Its returned
disposer retains the exact native target and listener until removal succeeds,
then releases both references; repeated calls after success do nothing. A failed
native removal retains the subscription for a retry. The disposer is created in
a separate lexical scope: an initial same-scope implementation released the
native document but still retained the callback payload in Chromium. No weak
reference is used for an active subscription, so a live observer remains active
until its owner unsubscribes. Directly retained CRDT wrappers remain independent
strong references as documented in the preceding wrapper investigation.

The production demo build passed. Core workspace tests passed 423 tests with
the known live-history test skipped; React passed 730 tests with six explicit-GC
cases skipped in its ordinary run. Workspace type checks and focused lint passed.
The affected browser files passed 84 checks across Chromium and Firefox with 12
workers; the two new observer-handle scenarios passed four serial checks. Unit
coverage also checks independent registrations, repeated removal, and retry after
a native removal failure. The full Playwright suite was not rerun.

Five serial Chromium embedding-demo editing samples after the change gave
synchronous median/range 0.6/0.5–0.8 ms and two-frame 33.4/33.2–33.4 ms
normally; `repeat=200` gave 0.6/0.5–0.7 ms and 33.3/28.1–33.4 ms. The prior
comparable sample was 0.5/0.4–0.8 ms and 33.3/33.3–33.4 ms normally, and
0.7/0.5–0.9 ms and 33.3/33.2–33.4 ms at `repeat=200`. A separate serial
same-build probe registered and removed 5,000 observers without changes: an
approximation of the old disposer had median/range 67.9/21.7–74.5 ms; the new
path had 56.3/24.8–71.8 ms. This noisy synthetic probe is not a memory bound
or a full interaction benchmark, and two animation frames do not prove complete
layout settlement.

Ownership review covered the map and array wrappers, shared callback conversion,
registration, successful and failed removal, document-manager observer cleanup,
and retained handles. The returned disposer owns exactly one registration; the
native document owns the active listener. No consumer gained attachment or
destruction capabilities, and no CRDT public interface changed. Live Yjs history
retention remains unresolved.

## Released provider cleanup handles

A Chromium heap-collection regression retained the cleanup returned by
`attachProvider` after cleanup, explicit detachment, or document destruction.
In all three cases the old handle retained both the adapter and a provider with a
one-megabyte payload. All three failures reproduced in the 12-worker browser run
and serially before the fix. The corresponding lifecycle also ran in Firefox;
explicit garbage collection assertions use Chromium's DevTools protocol.

The cleanup retains its attachment while connected and after a failed disconnect,
so a caller can retry. Successful disconnection releases its references, whether
initiated by the cleanup, explicit detachment, or destruction. Final document
teardown also releases the handle if disconnection fails; the error is still
reported, and disconnection cannot be retried through that handle after the
document is destroyed. An old cleanup cannot disconnect a replacement provider
with the same ID. The handle's operation is held in a separate lexical scope so
dropping it actually releases the captured adapter and provider.

After a production demo build, the affected CRDT, document storage, and demo
database browser files passed 90 checks across Chromium and Firefox with 12
workers, including storage failure, final provider updates and offline-update
merging. Core tests passed 424 with one known live-history test skipped; React
passed 730 with six explicit-GC cases skipped. Workspace type checks passed;
focused lint had no errors and eight function-length warnings. The full
Playwright suite was not rerun. A serial production Chromium editing sample gave
normal synchronous median/range 0.6/0.5–0.7 ms and two-frame 33.3/33.2–33.5 ms;
with `repeat=200`, 0.6/0.4–0.7 ms and 33.3/33.1–33.5 ms. These samples are
comparable to the previous section but do not measure provider connection cost,
and two frames do not establish full layout settlement.

The ownership review covered provider attachment, pending connection,
disconnection, retries, ID reuse, and document destruction. The adapter owns
registered attachments; the caller owns the returned cleanup only until it is
released. The public provider interface did not change. The open-document Yjs
history issue remains unresolved and no bound is claimed for indefinitely open
documents.

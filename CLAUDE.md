# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project at a glance

Калькулятор акустических конструкций с генерацией КП и админкой справочников. **Только фронт**: `frontend/` (React 19 + Vite) плюс `frontend/server.js` — прод-сервер, который отдаёт статику и проксирует API.

**Своего backend и БД у проекта нет.** Auth, расчёт, админ-API и выгрузка КП в 1С живут во внешнем сервисе ConstrTodo (`UPSTREAM_URL`, обычно `:3005`). Фронт всегда ходит по относительным путям, а прокси (vite в dev, `server.js` в проде) отправляет их в upstream — так cookies остаются first-party.

Не добавляй свой Node-бэкенд обратно и не возвращай Prisma/Postgres/`/api/offers` — всё это удалено намеренно.

README покрывает сценарии разработчика детально. Ниже — только то, что быстро не увидишь из одного файла.

## Commands

Весь дев-флоу — через `make` (targets самодокументированы, `make help`):

| Частая задача | Команда |
| --- | --- |
| Первая инициализация (deps) | `make setup` |
| Запустить фронт (vite dev, :5175) | `make dev` (алиас `make frontend`) |
| Production-сборка | `make build` |
| Чистая переустановка при сломанном `node_modules` | `make reinstall` |
| Убить зависший vite | `make stop` |

Нужен внешний ConstrTodo на `:3005`. Если локального нет — `UPSTREAM_TARGET=https://dev3.constrtodo.ru:3005` в `frontend/.env.development.local` (см. `frontend/.env.example`).

**Prod-деплой** (SSH + Makefile): `make deploy-frontend`, `make deploy-bootstrap`, `make deploy-status`, `make deploy-nginx-sync`, `make deploy-nginx-reload`. SOP — в [deploy/README.md](deploy/README.md).

**Тесты**: vitest в frontend (`cd frontend && npm test -- --run`) — 8 файлов, покрыты чистые адаптеры: `isolationCalcV2`, `validation`, `adminImageSrc`, `adminSizeLimits`, `regionSelectOptions`, `constructionSection`, `itemsCatalog`, `priceSearch`. Полная проверка: `npm run build` (ловит битые импорты) + `npm run lint`.

**Lint**: `cd frontend && npm run lint`. Есть pre-existing ошибки (`AdminPage.jsx`, `ItemsList.jsx`) — для новых правок проверяй, что их число не выросло.

## Архитектура: что важно знать заранее

### Один upstream, две таблицы маршрутов

Проксируемый набор путей одинаков в обоих режимах:

```
/login  /auth/*  /api/*  /integration/*  /admin/*  /content/*  /commerce/*
```

- dev — [frontend/vite.config.js](frontend/vite.config.js), переменная `UPSTREAM_TARGET`;
- prod — [frontend/server.js](frontend/server.js), переменная `UPSTREAM_URL` (читается и историческое имя `AUTH_SERVICE_URL`, потому что на сервере в `.env.prod` лежит оно).

Добавляешь новый серверный путь — вписывай в **оба** файла, иначе он попадёт в SPA-fallback и вернёт `index.html` вместо JSON (ошибка будет выглядеть как «сломался парсинг ответа»).

`server.js` снимает заголовок `Origin` перед отправкой в upstream: ConstrTodo сверяет его с allowlist'ом и на чужое значение отвечает 403 с пустым телом. Хоп server-to-server, CORS к нему неприменим; CSRF держится на `csrf_token` + `X-CSRF-Token`.

`/health` и `/__front_health` отвечает сам `server.js` — это живость фронт-процесса. Ручки зарегистрированы **до** прокси, иначе `/health` уехал бы в upstream.

`/admin` — одновременно SPA-роут и префикс API. Разводка по заголовку `Accept`: `text/html` → SPA, иначе прокси (`bypassAdminSpaNavigation` в vite, проверка в `pathFilter` у `server.js`). Хрупко и ждёт нормального решения — переноса админ-API под `/api/admin/*`.

### Фронт всегда на относительных URL

- `apiClient.js`: `DEFAULT_BASE_URL = ""` + `??` (не `||` — пустая строка должна оставаться пустой).
- `credentials: 'include'` всегда. На 401 сначала `POST /auth/refresh` (single-flight), при неудаче — window-event `auth:unauthorized`, на который подписан `AuthContext` и открывает `LoginModal`.
- НЕ добавлять `Authorization` header — только cookies (httpOnly `access_token` + читаемый `csrf_token`).
- Не вводи `https://dev3.constrtodo.ru:3005/...` в новом коде фронта: ломает same-origin-auth. Единственное исключение — сборка GitHub Pages (см. ниже).

### Расчёт: v2 основной, v1 — legacy-фолбэк «Инфо»

- Основной путь — `POST /api/v2/calculations/isolation/by-construction` ([services/constructionApi.js](frontend/src/services/constructionApi.js)). Параметры, size limits, группы замены и опциональные материалы приходят из БД (их редактирует админка), нормализует их [utils/isolationCalcV2.js](frontend/src/utils/isolationCalcV2.js).
- `POST /api/v1/calcIsolation/byProduct` остался **только** третьим фолбэком материалов на странице «Инфо» (`api.js:loadInfoPageMaterialsList`): состав из админки → `IsolationConstrMaterials` → v1-расчёт → v2-props. Размеры там типовые, количества ориентировочные.
- Подмены артикулов под шифры, которых не знает v1 (`*_ul_tape`, `*_eco_s`, герметик «Ультракустик»), живут в [utils/constructionCiphers.js](frontend/src/utils/constructionCiphers.js) и применяются только на v1-пути. Там же — шифры для UI (`constructionDisplayCipher`, `AG.Ct_eco` / `AG.Cs_mat` → «—»).
- Удалять v1 можно, когда состав конструкций будет заполнен в БД (`construction_materials`, `construction_optional_materials`). Пока они пустые, v2 честно возвращает `products: []`, и калькулятор показывает «Расчёт не вернул материалы».

### КП = документы 1С на стороне ConstrTodo

1. Калькулятор собирает конструкции в zustand-сторе.
2. «Сделать КП» → `POST /integration/onec/isolation/document` ([services/offersApi.js](frontend/src/services/offersApi.js), тело собирает [utils/onecDocumentMapper.js](frontend/src/utils/onecDocumentMapper.js)).
3. Список и карточка — `GET /integration/onec/isolation/documents` и `.../documents/{id}`; `sessionStorage` ([stores/kpOnecDocumentsStore.js](frontend/src/stores/kpOnecDocumentsStore.js)) работает как кэш на вкладку, инвалидация ручная (`invalidateKpListCache`).

У документа **два id**: локальный (для GET/DELETE) и `onec_document_id` (для PUT, поиск `GetByOneCDocumentID`). Поэтому `updateKpFromCalc` — каскад: GET detail → при отсутствии onec id `POST .../retry` → снова GET → PUT → при неудаче DELETE + POST заново. Фолбэк «пересоздать» меняет id документа. Правильное решение — идемпотентный PUT по локальному id на стороне ConstrTodo; пока его нет, каскад трогать осторожно.

Статусы документа: `pending_sync`, `sync_error` (в `last_error_message` — текст от 1С), успешная синхронизация заполняет `onec_document_id` и `synced_at`.

### Calculator state = zustand + sessionStorage

- [stores/calculatorStore.js](frontend/src/stores/calculatorStore.js) — поля расчёта, хук `useCalcField(key)` как drop-in замена `useState`; ключ `ag_calc_store_v1`, живёт до закрытия вкладки.
- Эфемерное состояние формы новой конструкции (`constR`, `constrSent`, `opening`, `modal`, `isSubmittingKp`, `pendingCreateKp`) — обычный `useState`, в стор не тащить.
- Режим правки КП: `activeKpId` + `loadKpEditState` (см. `offersApi.loadKpDocumentIntoCalculator`).

### Админка

- Роуты `/admin` и `/admin/materials/:code` ([App.jsx](frontend/src/App.jsx)), гейт — `AdminGate` внутри `AdminPage.jsx` (`user.role !== "ADMIN"` → заглушка). На сервере те же ручки закрыты `RequiredRole("admin")`.
- Весь UI админки — один файл `components/AdminPage.jsx` (~5000 строк, 21 компонент), API — `services/adminApi.js` (~2100 строк, 99 экспортов), стили — `AdminPage.css`. Слоя данных нет: каждая панель держит `rows/loading/error/query` сама. При правках не наращивай этот файл дальше — выноси новый раздел в отдельный компонент.

### Глобальные CSS-утечки (важно при добавлении UI!)

`frontend/src/components/Calculator.css` содержит **глобальные правила без префиксов**:

- `button { width: 100%; height: 120px; ... }` — новые кнопки обязаны явно задавать `width: auto; height: auto; margin: 0; box-shadow: none;`.
- `span { display: flex; ... }` — для label-text в новых формах: `display: block; justify-content: flex-start; color: <нужный>; font-weight: <нужный>; pointer-events: auto`.

Не «чистить» эти правила глобально — сломается legacy-калькулятор.

### Prod-деплой: host Node + systemd + host nginx

`Интернет :443 → host nginx → 127.0.0.1:3008 [node server.js] → ConstrTodo (UPSTREAM_URL)`.

- Один юнит: `deploy/systemd/ag-co-worker-frontend.service`. Слушает только loopback, TLS — у nginx.
- Секреты и адрес upstream: `$DEPLOY_DIR/.env.prod` (`EnvironmentFile` юнита). `PORT` и `DIST_DIR` задаются в юните.
- `make deploy-frontend` — локальный `vite build` + rsync `dist`; `REBUILD=1` переустанавливает prod-deps и рестартует юнит (когда менялся `server.js`).
- `make deploy-status` — статус юнита, порт 3008, доступность upstream и `/health` через домен.

### GitHub Pages — второй, cross-origin контур

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) на каждый push в `main` публикует ветку `gh-pages` с `VITE_API_URL=https://dev3.constrtodo.ru:3005`, `BASE_PATH=/ag_co_worker/` и `VITE_ROUTER_HASH=true`. Прокси там нет вообще, поэтому все запросы идут cross-origin: нужны CORS для `https://lvp0110.github.io` и cookies `SameSite=None; Secure` на стороне ConstrTodo. Полноценный контур — systemd выше.

## Ключевые файлы для ориентации

| Что искать | Файл |
| --- | --- |
| Прокси (dev / prod) | [frontend/vite.config.js](frontend/vite.config.js), [frontend/server.js](frontend/server.js) |
| Auth | [context/AuthContext.jsx](frontend/src/context/AuthContext.jsx), [services/authApi.js](frontend/src/services/authApi.js), [services/apiClient.js](frontend/src/services/apiClient.js) |
| Расчёт + пост-обработка | [services/constructionApi.js](frontend/src/services/constructionApi.js), [utils/isolationCalcV2.js](frontend/src/utils/isolationCalcV2.js), [utils/constructionCiphers.js](frontend/src/utils/constructionCiphers.js) |
| КП → 1С | [services/offersApi.js](frontend/src/services/offersApi.js), [utils/onecDocumentMapper.js](frontend/src/utils/onecDocumentMapper.js), [utils/offerMapper.js](frontend/src/utils/offerMapper.js) |
| Список/карточка КП | [stores/kpOnecDocumentsStore.js](frontend/src/stores/kpOnecDocumentsStore.js), [components/KpList.jsx](frontend/src/components/KpList.jsx), [components/KpPage.jsx](frontend/src/components/KpPage.jsx) |
| Админка | [components/AdminPage.jsx](frontend/src/components/AdminPage.jsx), [services/adminApi.js](frontend/src/services/adminApi.js) |
| Прайс | [services/priceApi.js](frontend/src/services/priceApi.js), [components/PricePage.jsx](frontend/src/components/PricePage.jsx) |

## Мелкие привычки

- В prod-сборке фронта не используй `VITE_API_URL` для прокси-пути: правильный default уже `""`.
- В проде наружу слушает только host nginx; приложение — `127.0.0.1:3008`. Логи — `journalctl -u ag-co-worker-frontend`.
- Мутации upstream (в т.ч. КП) требуют `X-CSRF-Token` — значение берётся из читаемой cookie `csrf_token`.
- Не логируй тела запросов КП в прод-консоль: в `offersApi.js` такие `console.log` есть, новые не добавляй.

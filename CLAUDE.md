# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project at a glance

Калькулятор акустических конструкций с генерацией КП. Монорепо: `backend/` (Node/Express/TypeScript) + `frontend/` (React 19 + Vite). **Локальной БД нет.** Auth, calc и 1С — внешний сервис (`AUTH_SERVICE_URL` / `CALC_SERVICE_URL` / `ONEC_SERVICE_URL`, обычно `:3005`). Backend — тонкий прокси + создание КП в 1С; фронт всегда ходит на относительные `/api/*`.

README покрывает сценарии разработчика детально. Ниже — только то, что быстро не увидишь из одного файла.

## Commands

Весь дев-флоу — через `make` (targets самодокументированы, `make help`):

| Частая задача | Команда |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Первая инициализация (deps + .env) | `make setup` |
| Запустить всё (backend tsx watch + vite dev) | `make dev` |
| Только backend / только frontend | `make backend` / `make frontend` |
| Production-сборка | `make build` |
| Чистая переустановка при сломанном `node_modules` | `make reinstall` |
| Убить зависшие tsx/vite | `make stop` |

Локально — только `make setup` / `make dev` (host Node, без контейнеров).

**Prod-деплой** (SSH + Makefile): `make deploy-backend`, `make deploy-frontend`, `make deploy-bootstrap`, `make deploy-status`, `make deploy-nginx-reload`. SOP — в [deploy/README.md](deploy/README.md).

**Тесты**: только vitest в frontend (`cd frontend && npm test`) — точечно покрывает `priceSearch.js`. Backend без тестов. Полная проверка: `tsc --noEmit` в `backend/`, `npm run build` в `frontend/`, E2E — `curl` по ручкам после `make dev`.

**Lint**: `cd frontend && npm run lint` (eslint, есть pre-existing warnings в чужом коде — для новых правок проверяй только отсутствие новых ошибок).

## Архитектура: что важно знать заранее

### КП = 1С, без локальной БД

1. В Calculator пользователь набирает конструкции → **in-memory** state в zustand ([frontend/src/stores/calculatorStore.js](frontend/src/stores/calculatorStore.js)).
2. Клик «Сделать КП» → `POST /api/offers` с `{ constructions: [{ calc_params }] }`. Backend один раз шлёт в `POST /integration/onec/isolation/document` и возвращает `{ code, data: { document_id, user_email }, error, id }`.
3. Навигация на `/kp/:document_id`. Список и карточка КП строятся **только из ответов 1С** (клиентский `sessionStorage` — [kpOnecDocumentsStore.js](frontend/src/stores/kpOnecDocumentsStore.js)). Без GET list/get в 1С история не переживает вкладку.

Не возвращай Prisma/Postgres/Offer CRUD — удалены намеренно.

### Auth целиком внешний

- Логин/сессия/логаут — во внешнем сервисе (`AUTH_SERVICE_URL`): фронт ходит на `POST /login`, `GET /auth/session`, `POST /auth/logout` (см. [frontend/src/services/authApi.js](frontend/src/services/authApi.js)). Cookie — httpOnly `access_token` + читаемый `csrf_token` (нужен как `X-CSRF-Token` на мутациях auth и на выгрузке в 1С).
- `requireAuth` ([backend/src/middleware/requireAuth.ts](backend/src/middleware/requireAuth.ts)) пробрасывает `req.headers.cookie` в `GET /auth/session` внешнего сервиса — **без** локального User upsert. `req.auth.email` / `role` из внешней сессии.
- Своих ручек `/api/auth/*` и JWT у backend нет — не добавляй их обратно.
- `app.set('trust proxy', 1)` в [backend/src/index.ts](backend/src/index.ts) обязателен — backend стоит за frontend-процессом (прокси), который стоит за host nginx.
- Фронтовый `apiClient.js` всегда с `credentials: 'include'`. Refresh-логики нет: на 401 эмитится `window` event `auth:unauthorized` — на него подписан `AuthContext`, открывает `LoginModal`.
- НЕ добавлять `Authorization` header — работа идёт только через cookies.

### Frontend всегда на относительных URL

- `apiClient.js`: `DEFAULT_BASE_URL = ""` + `??`-оператор (не `||`, пустая строка должна оставаться пустой).
- В dev Vite проксирует: `/login`+`/auth` → `:3005`, `/api/v1`+`/api/v2` → `:3005`, `/api` (остальное, в т.ч. offers) → backend `:3007`. В prod `frontend/server.js` проксирует `/api` и `/health` на backend (`127.0.0.1:3006`), а backend — calc-router на `CALC_SERVICE_URL`.
- Не вводи `https://dev3.constrtodo.ru:3005/...` в новом коде фронта — это ломает single-origin-auth.

### Calculator state = zustand + sessionStorage

- [frontend/src/stores/calculatorStore.js](frontend/src/stores/calculatorStore.js) — поля расчёта. Хук `useCalcField(key)` — drop-in замена `useState`.
- Сохраняется в `sessionStorage` под ключом `ag_calc_store_v1`, переживает навигацию внутри вкладки, пропадает при закрытии.
- Эфемерное состояние формы новой конструкции (`constR`, `constrSent`, `opening`, `modal`, `isSubmittingKp`, `pendingCreateKp`) осталось обычным `useState` — не перетаскивать в стор.

### Глобальные CSS-утечки (важно при добавлении UI!)

`frontend/src/components/Calculator.css` содержит **глобальные правила без префиксов**:

- `button { width: 100%; height: 120px; ... }` — новые кнопки обязаны явно задавать `width: auto; height: auto; margin: 0; box-shadow: none;`.
- `span { display: flex; ... }` — для label-text в новых формах: `display: block; justify-content: flex-start; color: <нужный>; font-weight: <нужный>; pointer-events: auto`.

Не «чистить» эти правила глобально — сломается legacy-калькулятор.

### Zod: calc passthrough; КП = CreateKpFromCalc*

- [backend/src/docs/schemas.ts](backend/src/docs/schemas.ts) — `CalcMaterialSchema` / `CalcParamsSchema` — `.passthrough()`.
- `CreateKpFromCalcRequestSchema` / `CreateKpFromCalcResponseSchema` — единственный контракт `/api/offers`.

### Prod-деплой: host Node + systemd + host nginx

`Интернет :443 → host nginx → 127.0.0.1:3008 [frontend: node server.js] → 127.0.0.1:3006 [backend: node dist/index.js] → внешний auth/calc/1С`.

- Юниты: `deploy/systemd/ag-co-worker-backend.service`, `deploy/systemd/ag-co-worker-frontend.service`.
- Секреты: `$DEPLOY_DIR/.env.prod` — `EnvironmentFile` у backend; frontend берёт `PORT` / `BACKEND_URL` / auth из unit + shared env.
- `make deploy-backend` — на сервере `npm ci && npm run build`, затем `systemctl restart` backend.
- `make deploy-frontend` — локальный vite build + rsync `dist`; `REBUILD=1` — переустановка prod-deps фронта + restart frontend unit (когда менялся `server.js`).
- Backend и frontend слушают только loopback. TLS только у nginx. Postgres в стеке нет.

## Ключевые файлы для ориентации

| Что искать | Файл |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Главный поток auth | [frontend/src/context/AuthContext.jsx](frontend/src/context/AuthContext.jsx), [frontend/src/services/authApi.js](frontend/src/services/authApi.js), [backend/src/middleware/requireAuth.ts](backend/src/middleware/requireAuth.ts), [backend/src/services/externalAuth.ts](backend/src/services/externalAuth.ts) |
| Создание КП → 1С | [backend/src/routes/offers.ts](backend/src/routes/offers.ts), [backend/src/services/onecIntegration.ts](backend/src/services/onecIntegration.ts), [frontend/src/services/offersApi.js](frontend/src/services/offersApi.js) |
| Список/карточка КП (клиент) | [frontend/src/stores/kpOnecDocumentsStore.js](frontend/src/stores/kpOnecDocumentsStore.js), [frontend/src/components/KpList.jsx](frontend/src/components/KpList.jsx), [frontend/src/components/KpPage.jsx](frontend/src/components/KpPage.jsx) |
| Внешний calc-сервис | [backend/src/services/calcService.ts](backend/src/services/calcService.ts), [backend/src/routes/calc.ts](backend/src/routes/calc.ts) |
| Маппинг calc → 1С body | [frontend/src/utils/offerMapper.js](frontend/src/utils/offerMapper.js) |
| Swagger/Zod | [backend/src/docs/schemas.ts](backend/src/docs/schemas.ts), [backend/src/docs/swagger.ts](backend/src/docs/swagger.ts) |

## Мелкие привычки

- CORS_ORIGIN — список через запятую; если Vite автоинкрементил порт до 5175+ — дописать, backend перезапустить.
- В prod-сборке фронта не используй env `VITE_API_URL` для прокси-пути: правильный default уже `""`.
- В проде наружу слушает только host nginx; приложение — `127.0.0.1:3008` (frontend) и `127.0.0.1:3006` (backend). Логи сервисов — `journalctl -u ag-co-worker-backend` / `ag-co-worker-frontend`.

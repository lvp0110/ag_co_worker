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

**Prod-деплой** (SSH + Docker Compose): `make deploy-backend`, `make deploy-frontend`, `make deploy-all`, `make deploy-bootstrap`, `make deploy-status`, `make deploy-logs`. SOP — в [deploy/README.md](deploy/README.md).

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

### Prod-деплой: Docker Compose + host nginx

Прод — `isocalc.constrtodo.ru` на `51.250.51.86` (hostname `webtest`), общая машина с `constr-todo-web` / `hr-todo-web` / `ag_sound_calc` / `cad-*`. Все проекты там в Docker, исходники в `/home/leonidl/<project>`.

`Интернет :443 → host nginx → 127.0.0.1:3007 [frontend-контейнер :3008] → backend:3006 (только compose-сеть) → внешний auth/calc/1С на dev3.constrtodo.ru:3005`.

- Стек: [docker-compose.prod.yml](docker-compose.prod.yml) + [backend/Dockerfile](backend/Dockerfile) + [frontend/Dockerfile](frontend/Dockerfile).
- Сборка идёт **на сервере внутри образов** (Node 22). Хостовой Node — 18, он для сборки не годится и не используется; локальный Node для деплоя тоже не нужен.
- Секреты: `$DEPLOY_DIR/.env.prod` — `env_file` у обоих сервисов.
- `make deploy-backend` / `make deploy-frontend` — `git checkout` нужной части + `docker compose up -d --build <service>`.
- Порты: host `3007` свободен (3000–3006 заняты соседями); backend host-порта не имеет, поэтому занятый на хосте 3006 (`cad-api`) не мешает.
- TLS — общий wildcard `*.constrtodo.ru` в `/home/leonidl/certs`, certbot не нужен. Postgres в стеке нет.
- Деплой контейнеров sudo не требует (`leonidl` в группе `docker`); sudo нужен только для nginx server block — это ручной шаг, в CI выключен (переменная `NGINX_AUTOSYNC`).

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
- В проде наружу слушает только host nginx; фронт-контейнер — `127.0.0.1:3007`, backend host-порта не имеет вовсе. Логи — `make deploy-logs` (`SERVICE=backend`, `FOLLOW=1`).
- `HOST` в `.env.prod` задавать НЕЛЬЗЯ: пустой `HOST` → bind `0.0.0.0` внутри контейнера, а с `127.0.0.1` backend станет недоступен фронту.
- `AUTH_SERVICE_URL` в проде — `https://dev3.constrtodo.ru:3005`, не `127.0.0.1:3005`: на webtest этот порт занят контейнером hr-todo-web.

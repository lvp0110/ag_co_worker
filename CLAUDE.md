# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project at a glance

Калькулятор акустических конструкций с генерацией КП. Монорепо: `backend/` (Node/Express/TypeScript/Prisma/PostgreSQL) + `frontend/` (React 19 + Vite). Backend также проксирует внешний расчётный сервис `dev3.constrtodo.ru:3005`, а не просто использует его — фронт ходит всегда на свой `/api/*`.

README покрывает сценарии разработчика детально (URL-ы, env-переменные, частые проблемы). Ниже — только то, что быстро не увидишь из одного файла.

## Commands

Весь дев-флоу — через `make` (targets самодокументированы, `make help`):

| Частая задача                                           | Команда                                              |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Первая инициализация (deps + .env + Docker + миграции)  | `make setup`                                         |
| Запустить всё (postgres + backend tsx watch + vite dev) | `make dev`                                           |
| Только backend / только frontend                        | `make backend` / `make frontend`                     |
| Создать новую Prisma-миграцию                           | `cd backend && npx prisma migrate dev --name <name>` |
| Применить миграции                                      | `make db-migrate`                                    |
| Полный сброс БД ⚠️                                      | `make db-reset`                                      |
| Prisma Studio / Adminer                                 | `make db-ui` (:5555) / уже на :8080 после `db-up`    |
| Production-сборка                                       | `make build`                                         |
| Чистая переустановка при сломанном `node_modules`       | `make reinstall`                                     |
| Убить зависшие tsx/vite                                 | `make stop`                                          |

**Prod-деплой** (SSH + Makefile target wrappers): `make deploy-backend`, `make deploy-frontend`, `make deploy-migrate`, `make deploy-bootstrap`, `make deploy-status`, `make deploy-nginx-reload`. Подробная SOP — в [deploy/README.md](deploy/README.md).

**Тесты**: только vitest в frontend (`cd frontend && npm test`) — точечно покрывает `priceSearch.js`. Backend без тестов. Полная проверка: `tsc --noEmit` в `backend/`, `npm run build` в `frontend/`, E2E — `curl` по ручкам после `make dev`.

**Lint**: `cd frontend && npm run lint` (eslint, есть pre-existing warnings в чужом коде — для новых правок проверяй только отсутствие новых ошибок).

## Архитектура: что важно знать заранее

### Offer-first data flow

Фронт НЕ хранит расчёт в sessionStorage как мост между страницами. Вместо этого:

1. В Calculator'e пользователь набирает конструкции → **in-memory** state в zustand-сторе ([frontend/src/stores/calculatorStore.js](frontend/src/stores/calculatorStore.js), сессия).
2. Клик «Сделать КП» → `POST /api/offers` с payload `{form?, offerDraft: {constructions, services, additional_materials}}`. Backend на этом этапе дёргает calc-сервис **один раз** и пишет результат в `OfferConstruction.materials` (JSONB).
3. Навигация на `/kp/:id`. KpPage делает `GET /api/offers/:id` — backend **пересчитывает** материалы заново (свежие цены) и накладывает пользовательские override'ы (см. ниже), после чего возвращает готовый DTO. Не пытайся хранить расчёт в sessionStorage — там его нет и не должно быть.

### Backend merge-логика (`backend/src/services/offerRecalc.ts`)

- Внешний calc-сервис **не детерминирован** по порядку материалов с одинаковым `Order` (эмпирически подтверждено). Поэтому `mergeMaterialOverrides` идёт **по `saved`-порядку**, а не по fresh-порядку — иначе пользовательский порядок «плавал» бы на каждом GET. Если меняешь эту функцию — удерживай это свойство.
- Ключ матчинга материалов: `Code || articul || Name || name` (поддерживаем и PascalCase от внешнего сервиса, и lowercase из types.ts).
- Override-поля: `KpPricePerM2`, `KpPricePerUnit`, `pricePerSquareMeter`, `pricePerUnit`. Остальные поля всегда приходят из fresh.
- `calculateByProduct(params[])` в `calcService.ts` вызывает внешний API **по одной конструкции в цикле** — при отправке массива сервис склеивает ответы, теряя разбивку. Не возвращайся к batched-вызову.

### Auth целиком внешний (свои токены backend не выдаёт)

- Логин/сессия/логаут — во внешнем сервисе (`AUTH_SERVICE_URL`): фронт ходит на `POST /login`, `GET /auth/session`, `POST /auth/logout` (см. [frontend/src/services/authApi.js](frontend/src/services/authApi.js)). Cookie — httpOnly `access_token` + читаемый `csrf_token` (нужен как `X-CSRF-Token` на мутациях auth и на выгрузке в 1С).
- `requireAuth` ([backend/src/middleware/requireAuth.ts](backend/src/middleware/requireAuth.ts)) пробрасывает `req.headers.cookie` в `GET /auth/session` внешнего сервиса и апсертит пользователя в локальную БД ([services/externalAuth.ts](backend/src/services/externalAuth.ts)) — `req.auth.userId` это **локальный** UUID, к нему привязаны офферы. Роль и `isBlocked` перезаписываются из внешней сессии на каждом запросе.
- Своих ручек `/api/auth/*` и JWT у backend нет (удалены как мёртвый код) — не добавляй их обратно и не заводи локальный логин.
- Локальной админки пользователей (`/api/admin/*`, UI `/admin`) нет — сотрудники, роли, пароли и отделы живут только во внешнем auth. Локальный `User` — проекция для FK офферов (`departmentId` из `department_id` сессии). Реквизиты КП — из `KP_COMPANY_*` в env. Номер КП = `document_id` из 1С (`Offer.id` / `kp_code`), не `КП-NNN-MM`.
- `app.set('trust proxy', 1)` в [backend/src/index.ts](backend/src/index.ts) обязателен — backend стоит за frontend-container'ом (прокси), который стоит за host nginx.
- Фронтовый `apiClient.js` всегда с `credentials: 'include'`. Refresh-логики нет: на 401 эмитится `window` event `auth:unauthorized` — на него подписан `AuthContext`, открывает `LoginModal`.
- НЕ добавлять `Authorization` header — работа идёт только через cookies.

### Frontend всегда на относительных URL

- `apiClient.js`: `DEFAULT_BASE_URL = ""` + `??`-оператор (не `||`, пустая строка должна оставаться пустой). URL всегда `""` → все fetch-ы относительные (`/api/offers`, `/login`); в dev проксирует Vite.
- `api.js` / `constructionApi.js`: все запросы к calc-сервису (`/api/v1/*`, `/api/v2/*`) **всегда** относительные. В dev Vite-proxy из `vite.config.js` проксирует в `dev3.constrtodo.ru:3005`, в prod backend-router [routes/calc.ts](backend/src/routes/calc.ts) проксирует из docker-сети.
- Не вводи `https://dev3.constrtodo.ru:3005/...` в новом коде фронта — это ломает single-origin-auth.

### Calculator state = zustand + sessionStorage

- [frontend/src/stores/calculatorStore.js](frontend/src/stores/calculatorStore.js) — 14 полей (ConstrToCalc, ConstrToCalcToSent, materialsByConstruction, UI-toggles). Хук `useCalcField(key)` — drop-in замена `useState`, возвращает `[value, setter]`.
- Сохраняется в `sessionStorage` под ключом `ag_calc_store_v1`, переживает навигацию внутри вкладки, пропадает при закрытии.
- Эфемерное состояние формы новой конструкции (`constR`, `constrSent`, `opening`, `modal`, `isSubmittingKp`, `pendingCreateKp`) осталось обычным `useState` — не перетаскивать в стор.

### Глобальные CSS-утечки (важно при добавлении UI!)

`frontend/src/components/Calculator.css` содержит **глобальные правила без префиксов**:

- `button { width: 100%; height: 120px; margin: 1px 1px 5px; box-shadow: ...; border-radius: 10px; font-size: 16px; background: #848f99 }` — применяется ко ВСЕМ `<button>` в приложении. Новые кнопки (LoginModal, RegisterPage, KpList и т.д.) обязаны явно задавать `width: auto; height: auto; margin: 0; box-shadow: none;` иначе визуально ломаются.
- `span { display: flex; justify-content: center; color: #878181; font-weight: 600; pointer-events: none }` — центрирует и перекрашивает текст во всех span'ах. Для label-text в новых формах прописывай override: `display: block; justify-content: flex-start; color: <нужный>; font-weight: <нужный>; pointer-events: auto`.

Не «чистить» эти правила глобально — сломается legacy-калькулятор. Всегда локальные override'ы в новых компонентах.

### Zod-схемы: материалы и услуги — passthrough

- [backend/src/docs/schemas.ts](backend/src/docs/schemas.ts) — `CalcMaterialSchema` это `z.object({}).passthrough()`. Не добавлять strict-поля: реальный формат от внешнего сервиса — PascalCase (`Code`, `Name`, `Quantity`, `Units`, `Order`, `InfoPack`) плюс пользовательские `KpPricePerM2`/`KpPricePerUnit`. Backend ничего в этом не валидирует, только проксирует и хранит.
- `ServiceSchema` — `.passthrough()` + все поля optional-with-default. `CalcParamsSchema` — `.passthrough()`.
- PATCH `/api/offers/:id` делает **частичное** обновление формы (`if (f.X !== undefined) formData.X = f.X`), POST — полное (с автозаполнением из профиля пользователя: `manager_name`, `phone`, `email`, `office_address`, `kp_date=today` если не переданы).

### Prod-деплой: три слоя

`Интернет :443 → host nginx (`/etc/nginx/sites-_`, ручной системный) → :127.0.0.1:3004 [frontend-container: express.static + http-proxy-middleware для /api и /health] → docker network → :3006 [backend-container] → [postgres-container]`. Backend и postgres не публикуют портов наружу. TLS только у nginx, `~/certs/_.pem`(bind-mount извне). Миграции вручную через`make deploy-migrate` (`docker compose run --rm backend npx prisma migrate deploy`), БД **никогда** не трогается обычным роллаутом.

## Ключевые файлы для ориентации

| Что искать                                     | Файл                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Главный поток auth                             | [frontend/src/context/AuthContext.jsx](frontend/src/context/AuthContext.jsx), [frontend/src/services/authApi.js](frontend/src/services/authApi.js), [backend/src/middleware/requireAuth.ts](backend/src/middleware/requireAuth.ts), [backend/src/services/externalAuth.ts](backend/src/services/externalAuth.ts) |
| Offer CRUD + merge                             | [backend/src/routes/offers.ts](backend/src/routes/offers.ts), [backend/src/services/offerRecalc.ts](backend/src/services/offerRecalc.ts)                                                                                                                                     |
| Внешний calc-сервис                            | [backend/src/services/calcService.ts](backend/src/services/calcService.ts), [backend/src/routes/calc.ts](backend/src/routes/calc.ts)                                                                                                                                         |
| Маппинг UI ↔ API                               | [frontend/src/utils/offerMapper.js](frontend/src/utils/offerMapper.js)                                                                                                                                                                                                       |
| DB-схема                                       | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) (User, Offer, OfferConstruction)                                                                                                                                                                                |
| Swagger/Zod                                    | [backend/src/docs/schemas.ts](backend/src/docs/schemas.ts), [backend/src/docs/swagger.ts](backend/src/docs/swagger.ts)                                                                                                                                                       |
| Рендер карточек конструкций + материалов на КП | [frontend/src/components/tables/ConstructionList.jsx](frontend/src/components/tables/ConstructionList.jsx), [frontend/src/components/tables/MaterialsList.jsx](frontend/src/components/tables/MaterialsList.jsx)                                                             |

## Мелкие привычки

- Порт БД на локалке — **5435**, не 5432 (5432 часто занят host-Postgres). В `docker-compose.yml` замаплено именно так, в `.env.example` тоже.
- CORS_ORIGIN — список через запятую; если Vite автоинкрементил порт до 5175+ — дописать, backend перезапустить.
- В prod-сборке фронта не используй env `VITE_API_URL` для прокси-пути: правильный default уже `""`. `VITE_API_URL` остаётся только для staging-настроек с API на отдельном хосте.
- После правки `schema.prisma` обязательно `npx prisma migrate dev --name …` — просто `generate` не создаёт миграцию, `deploy` не применит без файла миграции.
- Backend не публикует порты в prod-compose (`docker-compose.prod.yml`), только frontend на `127.0.0.1:3004`. Все `docker compose exec` / `run --rm` должны идти через compose, не по имени контейнера.

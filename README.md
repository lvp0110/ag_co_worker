# ag_co_worker

Калькулятор акустических конструкций с генерацией коммерческих предложений (КП). Монорепо: React-фронт + Node/Express-бэк (тонкий прокси calc + создание КП в 1С). **Локальной БД нет** — auth, calc и 1С живут во внешнем сервисе (`:3005`).

---

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 19, Vite, React Router 7, zustand; в prod — `node server.js` (express + http-proxy-middleware) |
| Backend | Node.js, Express, TypeScript (прокси calc + `POST /api/offers` → 1С) |
| Auth | Внешний сервис (`AUTH_SERVICE_URL`): cookie `access_token` + CSRF |
| КП | 1С (`ONEC_SERVICE_URL`); список/карточка на клиенте — `sessionStorage` из ответов 1С |
| API-документация | OpenAPI + Swagger UI (`@asteasolutions/zod-to-openapi`) |
| Внешний сервис | `:3005` — auth, calc, 1С (локально `localhost:3005`, staging `dev3.constrtodo.ru:3005`) |
| Prod | host nginx + Docker Compose (`ag_co_worker-backend` / `ag_co_worker-frontend`) → https://isocalc.constrtodo.ru |

---

## Требования

- **Node.js** ≥ 20
- **npm** ≥ 10
- **make** (предустановлен на macOS/Linux)
- Внешний сервис auth/calc/1С на `:3005` (для локальной разработки)

---

## Быстрый старт

```bash
# 1) Первая инициализация: зависимости + .env
make setup

# 2) Запустить backend + frontend (Ctrl-C остановит оба)
make dev
```

Нужен внешний сервис auth/calc/1С на `:3005`.

После `make dev`:

| Сервис | URL |
|--------|-----|
| Frontend | [http://localhost:5175](http://localhost:5175) |
| Backend API | [http://localhost:3007](http://localhost:3007) |
| Swagger UI | [http://localhost:3007/api/docs](http://localhost:3007/api/docs) |
| Auth / calc / 1С | `http://localhost:3005` (внешний сервис) |

`Ctrl-C` в терминале `make dev` останавливает backend и frontend.

---

## Команды (Makefile)

| Команда | Описание |
|---------|----------|
| `make help` | Список всех команд |
| `make setup` | Первая инициализация: install + env |
| `make install` | Установить зависимости (backend + frontend) |
| `make reinstall` | Чистая переустановка зависимостей (на случай сбоев npm / ENOTEMPTY) |
| `make env` | Создать `backend/.env` из `.env.example`, если отсутствует |
| `make backend` | Запустить только backend (tsx watch) |
| `make frontend` | Запустить только frontend (vite dev) |
| `make dev` | Запустить backend + frontend |
| `make stop` | Убить зависшие backend/frontend процессы |
| `make build` | Production-сборка: `tsc` (backend) + `vite build` (frontend) |
| `make clean` | Удалить `node_modules` и `dist` в backend и frontend |
| `make status` | Что где крутится (процессы + порты) |

Prod-деплой: `make deploy-backend`, `make deploy-frontend`, `make deploy-all`, `make deploy-bootstrap`, `make deploy-status`, `make deploy-logs`. Подробности — в [deploy/README.md](deploy/README.md).

Кратко по прод-топологии: host nginx `:443` → `127.0.0.1:3007` (frontend-контейнер, `node server.js`) → `backend:3006` по compose-сети (host-порта у backend нет). Стек — [docker-compose.prod.yml](docker-compose.prod.yml), секреты — `$DEPLOY_DIR/.env.prod`. Сборка (vite и tsc) идёт на сервере внутри образов на Node 22.

---

## API

- Swagger UI: [http://localhost:3007/api/docs](http://localhost:3007/api/docs)
- OpenAPI JSON: [http://localhost:3007/api/openapi.json](http://localhost:3007/api/openapi.json)

Основные группы ручек:

| Группа | Пути |
|--------|------|
| **Offers** | `POST /api/offers` — создание КП в 1С (`POST /integration/onec/isolation/document`), ответ `{ code, data: { document_id, user_email }, error, id }` |
| **Calc (proxy)** | Прозрачно проксируют на внешний calc-сервис: `POST /api/v1/calcIsolation/byProduct`, `GET /api/v1/AllIsolationConstr`, `GET /api/v1/IsolationConstrMaterials/{code}`, `GET /api/v1/constr/{filename}`, `GET /api/v2/isolationConstructions/props/{code}` |
| **Health** | `GET /health` |

Аутентификация — во внешнем сервисе (`AUTH_SERVICE_URL`): фронт ходит на `POST /login`, `GET /auth/session`, `POST /auth/logout`, а backend в `requireAuth` валидирует ту же cookie `access_token` через `GET /auth/session` (без локального User). Свои токены backend не выдаёт. Номер КП = `document_id` из 1С (URL `/kp/:document_id`). Список и карточка КП строятся на клиенте из ответов 1С (`sessionStorage` — `kpOnecDocumentsStore`). Все запросы с фронта идут с `credentials: 'include'`; на 401 клиент эмитит `auth:unauthorized` и открывает `LoginModal`.

---

## Структура проекта

```
ag_co_worker/
├── backend/                        ← Node/Express (прокси + offers → 1С)
│   ├── src/
│   │   ├── config/env.ts
│   │   ├── docs/                   ← Zod + Swagger
│   │   ├── middleware/requireAuth.ts
│   │   ├── routes/                 ← offers, calc (proxy)
│   │   ├── services/               ← calcService, externalAuth, onecIntegration
│   │   └── index.ts
│   ├── .env.example
│   └── package.json
├── frontend/                       ← React + Vite
│   ├── src/
│   │   ├── components/             ← Calculator, KpPage, KpList, LoginModal, AppHeader, …
│   │   ├── context/AuthContext.jsx
│   │   ├── services/               ← apiClient, authApi, offersApi, constructionApi, priceApi
│   │   ├── stores/                 ← calculatorStore, kpOnecDocumentsStore, …
│   │   ├── utils/offerMapper.js
│   │   └── ...
│   ├── server.js                   ← prod: статика + proxy /api,/health
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── deploy/                         ← SSH-деплой, nginx server block, bootstrap
│   └── nginx/                      ← ag_co_worker.conf (шаблон server block)
├── docker-compose.prod.yml         ← прод-стек (backend + frontend)
├── Makefile                        ← все команды разработки и деплоя
└── .github/workflows/              ← GitHub Pages + prod-deploy
```

---

## Переменные окружения

Backend — `backend/.env` (создаётся из `.env.example` через `make env`):

| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `NODE_ENV` | `development` | — |
| `PORT` | `3007` | Порт backend-API (в prod на сервере — `3006`) |
| `CORS_ORIGIN` | `http://localhost:5175,http://localhost:5176` | Список origin'ов через запятую (для `credentials: true`). По умолчанию разрешены оба стандартных порта Vite |
| `AUTH_SERVICE_URL` | `http://localhost:3005` | База внешнего auth-сервиса — `requireAuth` валидирует сессию через его `GET /auth/session` |
| `CALC_SERVICE_URL` | `http://localhost:3005` | База внешнего сервиса расчёта |
| `CALC_SERVICE_TIMEOUT_MS` | `60000` | Таймаут запроса к calc-сервису (прайс `/api/v2/data` часто >15s) |
| `ONEC_SERVICE_URL` | значение `AUTH_SERVICE_URL` | База сервиса выгрузки КП в 1С (`/integration/onec/isolation/document`) |
| `ONEC_TIMEOUT_MS` | `60000` | Таймаут выгрузки в 1С (ручка сама считает материалы) |
| `ONEC_EXPORT_ENABLED` | `true` | `false` — полностью отключить выгрузку в 1С |

Frontend (опционально — через `frontend/.env.local`):

| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `VITE_API_URL` | `""` (same-origin) | Override базы API. В dev Vite проксирует `/api` → backend, `/login`+`/auth` → `:3005`. В prod — relative URL через `server.js` |

В prod на сервере секреты живут в `$DEPLOY_DIR/.env.prod` (EnvironmentFile backend; frontend — PORT/BACKEND_URL/AUTH из unit + shared env). См. [deploy/README.md](deploy/README.md).

---

## Запуск без Make

На случай если `make` недоступен:

```bash
# 1) Установить зависимости
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 2) Создать backend/.env
cp backend/.env.example backend/.env

# 3) Запустить backend и frontend в отдельных терминалах
#    (нужен внешний сервис auth/calc/1С на :3005)
cd backend && npm run dev          # терминал 1
cd frontend && npm run dev         # терминал 2
```

---

## Production-сборка

```bash
make build
```

Генерирует:
- `backend/dist/` — скомпилированный TypeScript (запуск: `cd backend && npm start` → `node dist/index.js`).
- `frontend/dist/` — статический фронт (в prod раздаётся `frontend/server.js`).

---

## Деплой фронта на GitHub Pages

Фронт автоматически собирается и публикуется через [.github/workflows/deploy.yml](.github/workflows/deploy.yml) на каждый push в `main` (`BASE_PATH=/ag_co_worker/`).

Настройка один раз:
1. В `Settings` → `Pages` → `Deploy from a branch` → ветка **gh-pages**, folder **/ (root)**.
   Не выбирайте `main` — иначе вместо приложения откроется README.
   Workflow при деплое сам пытается переключить источник на `gh-pages`.
2. После первого успешного деплоя ссылка: https://lvp0110.github.io/ag_co_worker/

**Важно:** на Pages нет прокси `/api` и `/login`. Сборка Pages по умолчанию ходит на `https://dev3.constrtodo.ru:3005` (`VITE_API_URL`) и использует HashRouter (`/#/calc`). Override — repo Variable `VITE_API_URL`; на API нужен CORS для `https://lvp0110.github.io`. Логин с github.io требует cookie `SameSite=None` на auth. Полноценный прод-стек — см. [deploy/README.md](deploy/README.md).

---

## Частые проблемы

**Внешний сервис на :3005 недоступен**
`make setup` / `make dev` сами его не поднимают. Auth, calc и создание КП требуют работающий сервис на `AUTH_SERVICE_URL` / `CALC_SERVICE_URL` / `ONEC_SERVICE_URL` (по умолчанию `http://localhost:3005`).

**CORS-ошибка `Access-Control-Allow-Origin has a value 'http://localhost:5175' that is not equal to the supplied origin`**
Vite при занятом 5173 автоинкрементит порт до 5174+, а backend CORS пропускает только указанные origin'ы.
- По умолчанию разрешены оба: `http://localhost:5175,http://localhost:5176`.
- Если Vite поднялся ещё выше (5175+) — добавьте порт в `backend/.env`: `CORS_ORIGIN=http://localhost:5175,http://localhost:5176,http://localhost:5177` и перезапустите backend.
- Альтернатива — освободить 5175 (`make stop`) и перезапустить фронт.

**401 Unauthorized после логина при запросах с фронта**
Проверьте, что:
- backend `.env` имеет `CORS_ORIGIN` с правильным origin'ом фронта (см. выше);
- браузер не блокирует cookies третьей стороны (для localhost обычно ок);
- внешний auth на `:3005` отвечает на `GET /auth/session`.

**Ошибка валидации при создании КП**
Обычно означает, что payload не совпадает со схемой `CreateKpFromCalcRequestSchema`. Ответ backend содержит `issues[]` с путями — по ним видно, какое именно поле не прошло.

**Список КП пуст после перезагрузки вкладки**
Ожидаемо: история КП хранится в `sessionStorage` (`kpOnecDocumentsStore`) из ответов 1С при создании. Без GET list в 1С история не переживает закрытие вкладки.

**Зависшие dev-процессы после Ctrl-C**
```bash
make stop      # убивает tsx watch и vite
make status    # показывает что ещё крутится
```

**`npm error ENOTEMPTY` при `make install` / `make setup`**
Полусломанный `node_modules` после прерванного предыдущего install. Чистая переустановка:
```bash
make reinstall    # rm -rf node_modules + package-lock.json в backend/ и frontend/, затем npm install заново
```

---

## Лицензия

Private project.

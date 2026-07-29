# ag_co_worker

Калькулятор акустических конструкций с генерацией коммерческих предложений (КП). Включает React-фронт, Node/Express-бэк с Prisma + PostgreSQL и интеграцию с внешним сервисом расчёта.

---

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 19, Vite, React Router 7 |
| Backend | Node.js, Express, TypeScript, Prisma |
| Auth | Внешний сервис (`AUTH_SERVICE_URL`): cookie `access_token` + CSRF |
| DB | PostgreSQL 16 (в Docker) |
| API-документация | OpenAPI + Swagger UI (`@asteasolutions/zod-to-openapi`) |
| Внешний сервис | `dev3.constrtodo.ru:3005` — расчёт материалов |
| DB UI | Prisma Studio, Adminer |

---

## Требования

- **Node.js** ≥ 20
- **npm** ≥ 10
- **Docker Desktop** (для PostgreSQL + Adminer)
- **make** (предустановлен на macOS/Linux)

---

## Быстрый старт

```bash
# 1) Первая инициализация: зависимости, .env, БД, миграции
make setup

# 2) Запустить стек (postgres уже поднят, backend + frontend в фоне того же терминала)
make dev
```

После `make dev`:

| Сервис | URL |
|--------|-----|
| Frontend | [http://localhost:5175](http://localhost:5175) |
| Backend API | [http://localhost:3007](http://localhost:3007) |
| Swagger UI | [http://localhost:3007/api/docs](http://localhost:3007/api/docs) |
| Adminer (SQL) | [http://localhost:8081](http://localhost:8081) |
| PostgreSQL | `localhost:5435` (в контейнере `ag_co_worker_postgres`) |
| Prisma Studio | [http://localhost:5556](http://localhost:5556) (после `make db-ui`) |

`Ctrl-C` в терминале `make dev` останавливает backend и frontend. PostgreSQL в Docker продолжит работать — отключить его можно `make db-down`.

---

## Команды (Makefile)

| Команда | Описание |
|---------|----------|
| `make help` | Список всех команд |
| `make setup` | Первая инициализация: install + env + БД + миграции |
| `make install` | Установить зависимости (backend + frontend) |
| `make env` | Создать `backend/.env` из `.env.example`, если отсутствует |
| `make db-up` | Поднять `postgres` и `adminer` в Docker и дождаться healthcheck |
| `make db-down` | Остановить контейнеры docker compose |
| `make db-migrate` | Применить миграции Prisma к локальной БД |
| `make db-reset` | ⚠️ Полностью пересоздать БД (все данные будут стёрты) |
| `make db-ui` | Запустить Prisma Studio на :5555 |
| `make backend` | Запустить только backend (tsx watch) |
| `make frontend` | Запустить только frontend (vite dev) |
| `make dev` | Запустить всё: postgres + backend + frontend |
| `make stop` | Убить зависшие backend/frontend процессы |
| `make build` | Production-сборка: `tsc` (backend) + `vite build` (frontend) |
| `make clean` | Удалить `node_modules` и `dist` в backend и frontend |
| `make status` | Контейнеры + занятость портов 3006/5173/5433/5555/8080 |

---

## Работа с БД

### Миграции

```bash
# Применить существующие миграции
make db-migrate

# Создать новую миграцию (после правки backend/prisma/schema.prisma)
cd backend && npx prisma migrate dev --name <name>

# Полный сброс (⚠️ удаляет все данные)
make db-reset
```

### Просмотр данных

**Prisma Studio** — удобно для повседневной работы, знает схему, рендерит JSONB деревом:
```bash
make db-ui
# → http://localhost:5556
```

**Adminer** — произвольный SQL, EXPLAIN, импорт/экспорт:
```bash
# уже поднят после `make db-up`
# → http://localhost:8081
# System: PostgreSQL, Server: postgres, User: postgres, Password: postgres, Database: ag_co_worker
```

---

## API

- Swagger UI: [http://localhost:3007/api/docs](http://localhost:3007/api/docs)
- OpenAPI JSON: [http://localhost:3007/api/openapi.json](http://localhost:3007/api/openapi.json)

Основные группы ручек:

| Группа | Пути |
|--------|------|
| **Offers** | `POST/GET /api/offers`, `GET/PATCH/DELETE /api/offers/:id`, `POST /api/offers/:id/clone`, `GET /api/offers/:id/pdf` |
| **Calc (proxy)** | Прозрачно проксируют на внешний `dev3.constrtodo.ru:3005`: `POST /api/v1/calcIsolation/byProduct`, `GET /api/v1/AllIsolationConstr`, `GET /api/v1/IsolationConstrMaterials/{code}`, `GET /api/v1/constr/{filename}`, `GET /api/v2/isolationConstructions/props/{code}` |
| **Health** | `GET /health` |

Аутентификация — во внешнем сервисе (`AUTH_SERVICE_URL`): фронт ходит на `POST /login`, `GET /auth/session`, `POST /auth/logout`, а backend в `requireAuth` валидирует ту же cookie `access_token` через `GET /auth/session` и маппит пользователя в локальную БД (отдел = `department_id`). Свои токены backend не выдаёт. Роль администратора тоже приходит оттуда (`role_type: "admin"`); сотрудники, роли, доступ и отделы настраиваются только во внешнем сервисе — локальной админки пользователей нет. Реквизиты организации в КП/PDF задаются env `KP_COMPANY_*`. Номер КП = `document_id` из 1С (он же `Offer.id` / URL `/kp/:id`). Все запросы с фронта идут с `credentials: 'include'`; на 401 клиент эмитит `auth:unauthorized` и открывает `LoginModal`.

---

## Структура проекта

```
ag_co_worker/
├── backend/                        ← Node/Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── config/env.ts
│   │   ├── docs/                   ← Zod + Swagger
│   │   ├── lib/prisma.ts
│   │   ├── middleware/requireAuth.ts
│   │   ├── routes/                 ← offers, calc (proxy)
│   │   ├── services/               ← calcService, offerRecalc, externalAuth, onecIntegration, offerPdf
│   │   ├── utils/                  ← offerListSearch, pagination
│   │   └── index.ts
│   ├── .env.example
│   └── package.json
├── frontend/                       ← React + Vite
│   ├── src/
│   │   ├── components/             ← Calculator, KpPage, KpList, LoginModal, AppHeader, …
│   │   ├── context/AuthContext.jsx
│   │   ├── services/               ← apiClient, authApi, offersApi, constructionApi, priceApi
│   │   ├── utils/offerMapper.js
│   │   └── ...
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── docker-compose.yml              ← postgres + adminer
├── Makefile                        ← все команды разработки
├── PROJECT_PLAN.md                 ← архитектурный план
├── DB_SCHEMA.html                  ← схема данных (визуал)
└── .github/workflows/deploy.yml    ← GitHub Pages для фронта
```

---

## Переменные окружения

Backend — `backend/.env` (создаётся из `.env.example` через `make env`):

| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `NODE_ENV` | `development` | — |
| `PORT` | `3006` | Порт backend-API |
| `CORS_ORIGIN` | `http://localhost:5175,http://localhost:5176` | Список origin'ов через запятую (для `credentials: true`). По умолчанию разрешены оба стандартных порта Vite |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5435/ag_co_worker?schema=public` | Соединение с PostgreSQL |
| `AUTH_SERVICE_URL` | `http://localhost:3005` | База внешнего auth-сервиса — `requireAuth` валидирует сессию через его `GET /auth/session` |
| `CALC_SERVICE_URL` | `https://dev3.constrtodo.ru:3005` | База внешнего сервиса расчёта |
| `CALC_SERVICE_TIMEOUT_MS` | `60000` | Таймаут запроса к calc-сервису (прайс `/api/v2/data` на dev3 часто >15s) |
| `ONEC_SERVICE_URL` | значение `AUTH_SERVICE_URL` | База сервиса выгрузки КП в 1С (`/integration/onec/isolation/document`) |
| `ONEC_TIMEOUT_MS` | `60000` | Таймаут выгрузки в 1С (ручка сама считает материалы) |
| `ONEC_EXPORT_ENABLED` | `true` | `false` — полностью отключить выгрузку в 1С |

Frontend (опционально — через `frontend/.env.local`):

| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `VITE_API_URL` | `http://localhost:3007` | URL backend-API |

---

## Запуск без Make

На случай если `make` недоступен:

```bash
# 1) Poднять БД и Adminer
docker compose up -d postgres adminer

# 2) Установить зависимости
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3) Создать backend/.env
cp backend/.env.example backend/.env

# 4) Применить миграции
cd backend && npx prisma migrate deploy && cd ..

# 5) Запустить backend и frontend в отдельных терминалах
cd backend && npm run dev          # терминал 1
cd frontend && npm run dev         # терминал 2
```

---

## Production-сборка

```bash
make build
```

Генерирует:
- `backend/dist/` — скомпилированный TypeScript (запуск: `cd backend && npm start`).
- `frontend/dist/` — статический фронт (раздаётся любым CDN/nginx или GitHub Pages).

---

## Деплой фронта на GitHub Pages

Фронт автоматически собирается и публикуется через [.github/workflows/deploy.yml](.github/workflows/deploy.yml) на каждый push в `main`.

Настройка один раз:
1. В `Settings` → `Pages` → `Source` = **GitHub Actions**.
2. После первого успешного деплоя ссылка: https://lvp0110.github.io/ag_co_worker/

**Важно:** фронт для прода общается напрямую с `dev3.constrtodo.ru:3005`, так что на backend должен быть CORS для `https://lvp0110.github.io`. Если нужно чтобы прод-фронт смотрел на ваш задеплоенный backend — соберите с `VITE_API_URL=https://your-api.example.com npm run build`.

---

## Частые проблемы

**Docker не запущен**
`make db-up` выдаст:
```
✗ Docker не запущен. Запустите Docker Desktop.
```
→ Запустите Docker Desktop и повторите.

**Порт 5432 занят локальным Postgres**
Контейнер замаплен на **5435**, так что конфликта с локальным Postgres нет. Если в `.env` остался `localhost:5432` от старой установки — замените на `5433`.

**CORS-ошибка `Access-Control-Allow-Origin has a value 'http://localhost:5175' that is not equal to the supplied origin`**
Vite при занятом 5173 автоинкрементит порт до 5174+, а backend CORS пропускает только указанные origin'ы.
- По умолчанию разрешены оба: `http://localhost:5175,http://localhost:5176`.
- Если Vite поднялся ещё выше (5175+) — добавьте порт в `backend/.env`: `CORS_ORIGIN=http://localhost:5175,http://localhost:5176,http://localhost:5175` и перезапустите backend.
- Альтернатива — освободить 5173 (`make stop`) и перезапустить фронт.

**401 Unauthorized после логина при запросах с фронта**
Проверьте, что:
- backend `.env` имеет `CORS_ORIGIN` с правильным origin'ом фронта (см. выше);
- браузер не блокирует cookies третьей стороны (для localhost обычно ок).

**Ошибка валидации при сохранении КП**
Обычно означает, что payload не совпадает со схемой. Ответ backend теперь содержит `issues[]` с путями — по ним видно, какое именно поле не прошло.

**Зависшие dev-процессы после Ctrl-C**
```bash
make stop      # убивает tsx watch и vite
make status    # показывает что ещё крутится
```

**`The table public.users does not exist in the current database` (Prisma code `P2021`)**
База поднялась, но миграции не применены. Запустите:
```bash
make db-migrate
```
(в текущем `Makefile` это уже происходит автоматически при `make dev`; ошибка вылезает только если backend стартовал без предварительного `db-migrate`).

**`npm error ENOTEMPTY` при `make install` / `make setup`**
Полусломанный `node_modules` после прерванного предыдущего install. Чистая переустановка:
```bash
make reinstall    # rm -rf node_modules + package-lock.json в backend/ и frontend/, затем npm install заново
```

---

## Лицензия

Private project.

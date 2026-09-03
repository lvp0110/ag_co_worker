# ag_co_worker

Калькулятор акустических конструкций с генерацией коммерческих предложений (КП) и админкой справочников. **Только фронт**: React + Vite, в проде — статика за тонким Node-прокси.

**Своего backend и БД нет** — auth, расчёт, админ-API и выгрузка КП в 1С живут во внешнем сервисе ConstrTodo (`:3005`).

---

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 19, Vite, React Router 7, zustand |
| Prod-сервер | `node server.js` (express + http-proxy-middleware): статика + прокси в upstream |
| Auth | ConstrTodo: `POST /login`, `GET /auth/session`, `POST /auth/refresh`, `POST /auth/logout`; cookie `access_token` (httpOnly) + `csrf_token` |
| Расчёт | ConstrTodo v2: `POST /api/v2/calculations/isolation/by-construction`; параметры и состав конструкций — из БД, редактируются в админке |
| КП | ConstrTodo → 1С: `/integration/onec/isolation/document(s)`; список и карточка читаются с сервера, `sessionStorage` — кэш на вкладку |
| Админка | `/admin` — конструкции, материалы, регионы, картинки (`/admin/*`, `/content/*`, `/commerce/*`) |
| Внешний сервис | `:3005` — всё перечисленное в одном сервисе (локально `localhost:3005`, staging `dev3.constrtodo.ru:3005`) |
| Prod | host nginx + systemd (`ag-co-worker-frontend`) |

---

## Требования

- **Node.js** ≥ 20
- **npm** ≥ 10
- **make** (предустановлен на macOS/Linux)
- Внешний ConstrTodo на `:3005` (для локальной разработки)

---

## Быстрый старт

```bash
make setup && make dev
```

После `make dev`:

| Сервис | URL |
|--------|-----|
| Frontend | [http://localhost:5175](http://localhost:5175) |
| ConstrTodo (внешний) | `http://localhost:3005` |

Если локального `:3005` нет — положите в `frontend/.env.development.local`:

```bash
UPSTREAM_TARGET=https://dev3.constrtodo.ru:3005
```

---

## Команды (Makefile)

| Команда | Описание |
|---------|----------|
| `make help` | Список всех команд |
| `make setup` | Первая инициализация: установка зависимостей |
| `make install` | Установить зависимости |
| `make reinstall` | Чистая переустановка зависимостей (на случай сбоев npm / ENOTEMPTY) |
| `make dev` / `make frontend` | Запустить vite dev на :5175 |
| `make stop` | Убить зависший vite |
| `make build` | Production-сборка (`vite build` → `frontend/dist/`) |
| `make clean` | Удалить `node_modules` и `dist` |
| `make status` | Занятость портов 3005 / 5175 |

Prod-деплой: `make deploy-frontend`, `make deploy-bootstrap`, `make deploy-status`, `make deploy-nginx-sync`, `make deploy-nginx-reload`. Подробности — в [deploy/README.md](deploy/README.md).

Кратко по прод-топологии: host nginx `:443` → `127.0.0.1:3008` (`node server.js`) → ConstrTodo на `dev3.constrtodo.ru:3005`. Юнит — `deploy/systemd/ag-co-worker-frontend.service`, адрес upstream и секреты — `$DEPLOY_DIR/.env.prod`.

---

## Как фронт ходит в API

Своих ручек у проекта нет. Фронт использует **относительные** пути, а проксирует их:

- в dev — vite ([frontend/vite.config.js](frontend/vite.config.js));
- в проде — [frontend/server.js](frontend/server.js).

Набор путей одинаков в обоих режимах: `/login`, `/auth/*`, `/api/*`, `/integration/*`, `/admin/*`, `/content/*`, `/commerce/*`. Добавляете новый серверный путь — вписывайте в оба файла.

| Что | Путь в upstream |
|-----|-----------------|
| Логин / сессия / refresh / логаут | `POST /login`, `GET /auth/session`, `POST /auth/refresh`, `POST /auth/logout` |
| Расчёт конструкции (основной) | `POST /api/v2/calculations/isolation/by-construction` |
| Публичный каталог и параметры | `GET /api/v2/constructions/{category}`, `.../{code}`, `.../{code}/calculation-params` |
| Legacy-расчёт и каталог v1 | `POST /api/v1/calcIsolation/byProduct`, `GET /api/v1/AllIsolationConstr`, `GET /api/v1/IsolationConstrMaterials/{code}` |
| Прайс | `GET /api/v2/data` |
| Картинки конструкций | `GET /api/v2/public/image/{filename}` |
| КП | `POST`/`PUT /integration/onec/isolation/document`, `GET /integration/onec/isolation/documents`, `.../documents/{id}`, `.../documents/{id}/retry`, `DELETE .../documents/{id}` |
| Админка | `/admin/materials/*`, `/admin/constructions/*`, `/admin/commerce/*`, `/admin/images/*`, `/content/*`, `/commerce/*` |

`/health` и `/__front_health` отдаёт сам `server.js` — это живость фронт-процесса, а не upstream.

Все запросы идут с `credentials: 'include'`; мутации требуют заголовка `X-CSRF-Token` со значением из читаемой cookie `csrf_token`. На 401 клиент один раз пробует `POST /auth/refresh`, при неудаче открывает окно логина.

### Расчёт: v2 и legacy v1

Основной путь — v2 `by-construction`: параметры конструкции, ограничения размеров, группы замены и опциональные материалы приходят из БД и редактируются в админке.

`POST /api/v1/calcIsolation/byProduct` остался только третьим фолбэком материалов на странице «Инфо» (`api.js:loadInfoPageMaterialsList`): состав из админки → `IsolationConstrMaterials` → v1-расчёт → v2-props. Размеры там типовые, поэтому количества ориентировочные. Подмены артикулов под шифры, которых v1 не знает (`*_ul_tape`, `*_eco_s`, герметик «Ультракустик»), лежат в [utils/constructionCiphers.js](frontend/src/utils/constructionCiphers.js) и работают только на этом пути.

---

## Структура проекта

```
ag_co_worker/
├── frontend/                       ← весь код проекта
│   ├── src/
│   │   ├── components/             ← Calculator, KpList, KpPage, AdminPage, PricePage, …
│   │   ├── context/AuthContext.jsx
│   │   ├── services/               ← apiClient, authApi, offersApi, constructionApi, adminApi, priceApi
│   │   ├── stores/                 ← calculatorStore, kpOnecDocumentsStore
│   │   ├── utils/                  ← isolationCalcV2, constructionCiphers, onecDocumentMapper, offerMapper
│   │   └── ...
│   ├── server.js                   ← prod: статика + прокси в upstream + /health
│   ├── vite.config.js              ← dev-прокси (тот же набор путей)
│   ├── public/
│   └── package.json
├── deploy/                         ← SSH-деплой, nginx, systemd, bootstrap
│   ├── systemd/                    ← ag-co-worker-frontend.service
│   └── nginx/                      ← ag_co_worker.conf (шаблон server block)
├── Makefile                        ← команды разработки и деплоя
└── .github/workflows/              ← GitHub Pages + prod-deploy
```

---

## Переменные окружения

Dev (опционально, `frontend/.env.development.local` — шаблон в [frontend/.env.example](frontend/.env.example)):

| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `UPSTREAM_TARGET` | `http://localhost:3005` | Куда dev-прокси отправляет все API-пути |
| `VITE_API_URL` | `""` (same-origin) | Override базы API. Нужен только для сборок без прокси (GitHub Pages) |

Prod (`$DEPLOY_DIR/.env.prod` на сервере, шаблон — [deploy/.env.prod.example](deploy/.env.prod.example)):

| Переменная | Описание |
|------------|----------|
| `UPSTREAM_URL` | База ConstrTodo, в проде `https://dev3.constrtodo.ru:3005`. Историческое имя `AUTH_SERVICE_URL` тоже читается |
| `NODE_ENV` | `production` |

`PORT` и `DIST_DIR` задаёт systemd-юнит.

---

## Запуск без Make

```bash
cd frontend && npm install && npm run dev
```

---

## Production-сборка

```bash
make build
```

Генерирует `frontend/dist/` — статику, которую в проде раздаёт `frontend/server.js`.

---

## Деплой фронта на GitHub Pages

Фронт автоматически собирается и публикуется через [.github/workflows/deploy.yml](.github/workflows/deploy.yml) на каждый push в `main` (`BASE_PATH=/ag_co_worker/`).

Настройка один раз:
1. В `Settings` → `Pages` → `Deploy from a branch` → ветка **gh-pages**, folder **/ (root)**.
   Не выбирайте `main` — иначе вместо приложения откроется README.
   Workflow при деплое сам пытается переключить источник на `gh-pages`.
2. После первого успешного деплоя ссылка: https://lvp0110.github.io/ag_co_worker/

**Важно:** на Pages прокси нет вообще. Сборка ходит на `https://dev3.constrtodo.ru:3005` напрямую (`VITE_API_URL`) и использует HashRouter (`/#/calc`). Значит запросы cross-origin, и чтобы работали логин, каталог, админка и КП, на стороне ConstrTodo нужны CORS для `https://lvp0110.github.io` и cookies `SameSite=None; Secure`. Полноценный контур — systemd, см. [deploy/README.md](deploy/README.md).

---

## Частые проблемы

**Внешний сервис на :3005 недоступен**
`make dev` его не поднимает. Логин, каталог, расчёт и КП требуют работающий ConstrTodo на `UPSTREAM_TARGET` (по умолчанию `http://localhost:3005`).

**«Расчёт не вернул материалы для выбранного варианта конструкции»**
v2-расчёт читает состав из таблиц `construction_materials` / `construction_optional_materials`. Если они пустые (частый случай на свежем дампе), сервис отвечает `200` с пустым списком, и калькулятор показывает эту ошибку. Проверить можно прямым запросом к `:3005` — состав наполняется через админку или миграцией данных.

**401 Unauthorized при запросах с фронта**
Убедитесь, что запросы идут по относительным путям (тогда cookies same-origin), что upstream отвечает на `GET /auth/session`, и что вход выполнен в этой же вкладке. Абсолютный URL на `:3005` из кода фронта ломает cookies — так делает только сборка Pages, и ей нужны CORS + `SameSite=None`.

**Создание КП падает с 404**
ConstrTodo отвечает 404 при отсутствии session-cookie — нужно перелогиниться. `offersApi` перед выгрузкой сам проверяет сессию и даёт понятный текст.

**КП сохранился, но в списке `sync_error`**
Документ создан локально в ConstrTodo, а синхронизация с 1С не прошла — текст в `last_error_message`. Типичная причина на стенде: не заданы креды 1С (`ONEC_ENDPOINT` / `ONEC_USERNAME` / `ONEC_PASSWORD` на стороне ConstrTodo). Повторить синхронизацию — `POST /integration/onec/isolation/documents/{id}/retry`.

**JSON-ответ вдруг пришёл как HTML**
Значит путь не попал в `pathFilter` прокси и уехал в SPA-fallback. Добавьте префикс в `frontend/server.js` и `frontend/vite.config.js`.

**Список КП пуст после перезагрузки вкладки**
Список читается с сервера (`GET /integration/onec/isolation/documents`); `sessionStorage` — только кэш. Если список пуст, значит на сервере нет документов этого пользователя.

**Зависший dev-процесс после Ctrl-C**
```bash
make stop
make status
```

**`npm error ENOTEMPTY` при `make install` / `make setup`**
Полусломанный `node_modules` после прерванного install:
```bash
make reinstall
```

---

## Лицензия

Private project.

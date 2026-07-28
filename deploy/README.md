# Deploy ag_co_worker — Linux-сервер

Кратко: один Linux-сервер, всё приложение в Docker (postgres + backend + frontend), TLS и маршрутизация по домену — на **хостовом системном nginx**. Деплой — SSH из локального Makefile.

## Архитектура

```
Интернет  :443 / :80 (redirect)
   ↓
[host nginx]  /etc/nginx/sites-enabled/ag_co_worker.conf
   └─ server_name ag.example.com
      ssl_certificate /etc/letsencrypt/live/ag.example.com/*
      proxy_pass → 127.0.0.1:3008
   ↓
[frontend container]  bind: 127.0.0.1:3008 (loopback only)
   ├─ express.static('/app/dist')       ← статика (rsync сюда)
   └─ /api/*  →  http://backend:3006     ← proxy в docker network
   ↓
[backend container]  ports: ∅  (only internal docker network)
   └─ Node/Express + Prisma
   ↓
[postgres container]  ports: ∅  (only internal docker network)
   └─ volume: ag_co_worker_pg_data
```

Наружу виден **только** nginx на 80/443. Backend и postgres не публикуются вообще, frontend слушает только на loopback.

---

## Первый запуск сервера

### 1. Подготовка машины (вручную, один раз)

```bash
# Docker
sudo apt update
sudo apt install -y docker.io docker-compose-plugin

# Системный nginx
sudo apt install -y nginx

# certbot (для Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# Firewall — открываем только 80/443; 3004/3006/5432 остаются закрытыми.
sudo ufw allow 80,443/tcp
sudo ufw --force enable

# Пользователь для деплоя (если ещё нет) — должен быть в группе docker
sudo usermod -aG docker deploy
```

### 2. Получить TLS-сертификат

```bash
sudo certbot certonly --nginx -d ag.example.com
# → /etc/letsencrypt/live/ag.example.com/{fullchain,privkey}.pem
```

certbot установит systemd-timer, который будет обновлять сертификаты сам. После обновления нужен `sudo systemctl reload nginx` (certbot ставит renewal hook автоматически).

### 3. nginx server block

```bash
# На локальной машине — склонировали репо, смотрим эталон:
cat deploy/nginx/ag_co_worker.conf

# На сервере:
sudo cp deploy/nginx/ag_co_worker.conf /etc/nginx/sites-available/

# Внутри заменить <domain> на реальный (ag.example.com) в трёх местах:
sudo sed -i 's|<domain>|ag.example.com|g' /etc/nginx/sites-available/ag_co_worker.conf

sudo ln -s /etc/nginx/sites-available/ag_co_worker.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Положить секреты и настроить локальный `.env.deploy`

**На локальной машине:**
```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# Заполнить DEPLOY_HOST / DEPLOY_DIR / DEPLOY_DOMAIN.
```

**На сервере** (потом положит туда `make deploy-bootstrap`, но `.env.prod` нужно подготовить заранее):
```bash
# На сервере после первого git clone:
cd /srv/ag_co_worker
cp deploy/.env.prod.example .env.prod
# Заполнить POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CORS_ORIGIN.
# openssl rand -hex 32  — для секретов.
chmod 600 .env.prod
```

### 5. Первый запуск

```bash
make deploy-bootstrap   # локально
```

Скрипт:
1. Клонирует репо в `$DEPLOY_DIR`.
2. Проверяет, что `.env.prod`, nginx и конфиг на месте.
3. Поднимает postgres + backend.
4. Прогоняет `prisma migrate deploy`.
5. Поднимает frontend (пока без статики — dist ещё не залит).
6. Дёргает `https://<domain>/health`.

Сразу после bootstrap — залить фронт:
```bash
make deploy-frontend
```

---

## Регулярный деплой

| Ситуация                              | Команда                         | Что произойдёт                                                                                                        |
|---------------------------------------|----------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Изменился код backend (без миграций)   | `make deploy-backend`            | git fetch + checkout backend/ → rebuild backend-образа → `up -d --no-deps backend` (postgres/frontend не трогаются).  |
| Изменился frontend                     | `make deploy-frontend`           | Локально `vite build` → `rsync` dist на сервер. Контейнер frontend НЕ перезапускается, статика обновляется на лету.    |
| Изменились `server.js` / frontend Dockerfile | `REBUILD=1 make deploy-frontend` | Плюсом пересобирается frontend-контейнер и перезапускается `--no-deps`.                                               |
| Нужно применить миграции               | `make deploy-migrate`            | `docker compose run --rm backend npx prisma migrate deploy` — одноразовый контейнер, работающий backend не трогает.    |
| Откат backend на прошлую ревизию       | `REV=<commit> make deploy-backend` | Тот же скрипт, но `git checkout $REV` вместо `origin/main`.                                                            |
| Правка nginx конфига на сервере        | `make deploy-nginx-sync && make deploy-nginx-reload` | Залить шаблон из репо на сервер, валидировать `nginx -t`, перечитать. |
| Посмотреть статус прод-стека           | `make deploy-status`             | `docker compose ps` + `curl /health`.                                                                                  |

### Zero-downtime миграции (expand/contract)

Для additive-изменений (новая nullable-колонка, новая таблица):
```
1. make deploy-migrate   ← применить миграцию, БД обновилась
2. make deploy-backend   ← выкатить новый код, использующий новую колонку
```

Для breaking (rename/drop) — 2 этапа через промежуточный совместимый билд:
```
1. Деплой кода, совместимого и со старой, и с новой схемой:   make deploy-backend
2. Миграция:                                                  make deploy-migrate
3. (в следующий релиз) Деплой кода, использующего только новую схему: make deploy-backend
```

---

## Бэкапы БД

Cron на сервере (под пользователем с правами на docker):
```
0 3 * * * cd /srv/ag_co_worker && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres ag_co_worker | gzip > /var/backups/ag_co_worker/$(date +\%F).sql.gz
```

Восстановление:
```bash
cd /srv/ag_co_worker
gunzip -c /var/backups/ag_co_worker/2026-04-21.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ag_co_worker
```

---

## Диагностика

```bash
# Статус прод-стека
make deploy-status

# Логи приложения
ssh $DEPLOY_HOST "cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml logs --tail=200 -f backend"
ssh $DEPLOY_HOST "cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml logs --tail=200 -f frontend"

# Логи nginx
ssh $DEPLOY_HOST "sudo tail -f /var/log/nginx/ag_co_worker.error.log"
ssh $DEPLOY_HOST "sudo tail -f /var/log/nginx/ag_co_worker.access.log"

# Проверка изоляции (все три должны быть "connection refused")
nc -vz ag.example.com 3004
nc -vz ag.example.com 3006
nc -vz ag.example.com 5432
```

## Что НЕ делают скрипты

- Не создают и не пишут TLS-сертификаты (их ставит certbot отдельно).
- Не перезапускают `postgres` никогда в обычном флоу.
- Не пишут в `.env.prod` — он под контролем оператора.

`deploy-nginx-sync.sh` синхронизирует шаблон `deploy/nginx/ag_co_worker.conf` на сервер и валидирует `nginx -t`; `deploy-nginx-reload.sh` перечитывает конфиг — это разделение позволяет CI прогнать sync без reload, увидеть ошибку и не убить трафик.

---

## GitHub Actions auto-deploy (push в `main`)

Workflow [.github/workflows/prod-deploy.yml](../.github/workflows/prod-deploy.yml) делает то же самое, что `make deploy-*` локально: SSH-ится на прод, дёргает скрипты из `deploy/`. CI работает как «удалённая dev-машина» — никакой особой логики дублирующей `deploy/*.sh` в workflow нет.

### Триггеры

- **push в `main`** — полный rollout (backend → миграции [если есть] → nginx [если менялся] → frontend → smoke + Telegram).
- **workflow_dispatch** (`Actions → Prod deploy → Run workflow`) — те же шаги, плюс ручные входы:
  - `force_migrate: auto|yes|no` — по умолчанию `auto` (по diff). `yes`/`no` принудительно вкл/выкл `deploy-migrate.sh`.
  - `rev` — необязательная ревизия (тег, ветка или SHA), которая попадёт в `DEPLOY_REV` и будет передана в `deploy-backend.sh` / `deploy-migrate.sh`. **Используется для отката**: `Run workflow → rev = <previous-sha>`.

### Условия запуска шагов (на `push` в `main`)

| Шаг | Когда запускается |
|-----|---------------------|
| `deploy-backend.sh` | если менялись `backend/**` или `docker-compose.prod.yml` |
| `deploy-migrate.sh` | если менялись `backend/prisma/migrations/**` |
| `deploy-nginx-sync.sh` + `deploy-nginx-reload.sh` | если менялись `deploy/nginx/**` |
| `deploy-frontend.sh` | если менялись `frontend/**` |
| `deploy-status.sh` | всегда (smoke test) |

На `workflow_dispatch` все четыре rollout-шага запускаются принудительно (use case — force redeploy или откат через `rev`); миграции — по input'у `force_migrate`.

### Требуемые GitHub Secrets

`Settings → Secrets and variables → Actions → Repository secrets`:

| Секрет | Назначение |
|--------|------------|
| `DEPLOY_HOST` | SSH-цель, формат `deploy@ag.example.com` |
| `DEPLOY_DIR` | абсолютный путь репо на сервере (например `/srv/ag_co_worker`) |
| `DEPLOY_DOMAIN` | домен (для curl-smoke и подстановки `<domain>` в `server_name` nginx) |
| `DEPLOY_CERT_DIR` | **опционально.** Абсолютный путь к директории с `fullchain.pem` / `privkey.pem`. Если не задано — fallback на `/etc/letsencrypt/live/$DEPLOY_DOMAIN`. Примеры: `/etc/letsencrypt/live/constrtodo.ru` (wildcard certbot), `/home/leonidl/certs` (cert вне certbot). |
| `DEPLOY_SSH_KEY` | приватный ed25519-ключ deploy-юзера (полный PEM, включая `-----BEGIN…END-----`) |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 <host>` — отпечаток сервера, чтобы CI не цеплялся к TOFU |
| `TELEGRAM_BOT_TOKEN` | токен бота для уведомлений |
| `TELEGRAM_CHAT_ID` | id чата (для группового чата с `-100…`) |

Получить fingerprint сервера для `DEPLOY_KNOWN_HOSTS`:
```bash
ssh-keyscan -t ed25519 ag.example.com
```

### NOPASSWD-sudo на сервере (нужно для CI и для `make deploy-nginx-sync`)

Файл `/etc/sudoers.d/deploy-nginx`:
```
deploy ALL=(root) NOPASSWD: /usr/bin/cp * /etc/nginx/sites-available/*, \
                            /usr/bin/ln -sf /etc/nginx/sites-available/* /etc/nginx/sites-enabled/*, \
                            /usr/sbin/nginx -t, \
                            /bin/systemctl reload nginx
```
Для `make deploy-nginx-reload` достаточно последних двух строк (они уже могли быть).

### Откат

```bash
# Найти последний рабочий SHA в гите (например, тег предыдущего релиза)
gh workflow run prod-deploy.yml -f rev=<previous-sha> -f force_migrate=no
```

Через UI: `Actions → Prod deploy → Run workflow → rev = …`.

### Что workflow НЕ делает

- Не строит backend-образ в CI и не пушит в registry — `docker compose build backend` идёт **на сервере**, как и при ручном `make deploy-backend`. Это исключает необходимость в registry и сохраняет существующую модель «один источник правды — git на сервере».
- Не управляет certbot/Let's Encrypt — systemd-timer на сервере.
- Не трогает `.env.prod` — никогда.

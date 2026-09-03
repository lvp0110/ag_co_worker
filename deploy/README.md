# Deploy ag_co_worker — Linux-сервер

Кратко: один Linux-сервер, приложение как **один** Node-процесс под systemd, TLS и маршрутизация по домену — на **хостовом nginx**. Деплой — SSH из локального Makefile. Своего backend и БД у проекта нет: auth, расчёт, админ-API и выгрузка КП в 1С живут во внешнем сервисе ConstrTodo.

## Архитектура

```
Интернет  :443 / :80 (redirect)
   ↓
[host nginx]  /etc/nginx/sites-enabled/ag_co_worker.conf
   └─ server_name ag.example.com
      ssl_certificate …
      proxy_pass → 127.0.0.1:3008
   ↓
[frontend]  systemd: ag-co-worker-frontend.service
            node server.js  (bind 127.0.0.1:3008)
   ├─ express.static(frontend/dist)                     ← статика (rsync сюда)
   ├─ /login, /auth/*, /api/*, /integration/*,
   │  /admin/* (API), /content/*, /commerce/*  →  UPSTREAM_URL
   ├─ /health, /__front_health                          ← живость самого процесса
   └─ SPA-fallback на index.html
   ↓
[ConstrTodo :3005]  auth / calc / админ-API / 1С
```

Наружу виден **только** nginx на 80/443, процесс приложения слушает loopback. Юнит: `deploy/systemd/ag-co-worker-frontend.service`; `PORT` и `DIST_DIR` заданы в нём, адрес upstream и остальное — в `$DEPLOY_DIR/.env.prod` (`EnvironmentFile`).

---

## Первый запуск сервера

### 1. Подготовка машины (вручную, один раз)

```bash
# Node.js ≥ 20
# (пример: NodeSource / nvm / distro package — как принято на машине)

# Системный nginx
sudo apt update
sudo apt install -y nginx

# certbot (для Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# Firewall — открываем только 80/443; 3008 снаружи закрыт
sudo ufw allow 80,443/tcp
sudo ufw --force enable
```

### 2. Получить TLS-сертификат

```bash
sudo certbot certonly --nginx -d ag.example.com
# → /etc/letsencrypt/live/ag.example.com/{fullchain,privkey}.pem
```

certbot установит systemd-timer на обновление сертификатов. После обновления нужен `sudo systemctl reload nginx` (certbot ставит renewal hook автоматически).

### 3. nginx server block

```bash
# На локальной машине — эталон:
cat deploy/nginx/ag_co_worker.conf

# На сервере:
sudo cp deploy/nginx/ag_co_worker.conf /etc/nginx/sites-available/

# Внутри заменить <domain> на реальный (ag.example.com) и пути к сертификатам:
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
# Заполнить UPSTREAM_URL (адрес ConstrTodo). Историческое имя AUTH_SERVICE_URL
# тоже читается — server.js берёт UPSTREAM_URL || AUTH_SERVICE_URL.
chmod 600 .env.prod
```

### 5. Первый запуск

```bash
make deploy-bootstrap   # локально
```

Скрипт:
1. Клонирует репо в `$DEPLOY_DIR`.
2. Проверяет, что `.env.prod`, nginx и конфиг на месте.
3. Ставит systemd-юнит из `deploy/systemd/`, доставляет prod-deps фронта и поднимает сервис.
4. Дёргает `https://<domain>/health`.

Сразу после bootstrap — залить фронт:
```bash
make deploy-frontend
```

---

## Регулярный деплой

| Ситуация | Команда | Что произойдёт |
|----------|---------|----------------|
| Изменился фронт (статика) | `make deploy-frontend` | Локально `vite build` → `rsync` dist на сервер. Юнит не перезапускается — `server.js` читает обновлённый `dist` на лету. |
| Изменился `server.js` / prod-deps фронта | `REBUILD=1 make deploy-frontend` | Плюсом переустановка prod-deps на сервере и `systemctl restart ag-co-worker-frontend`. |
| Сменился адрес upstream | правка `.env.prod` на сервере + `ssh $DEPLOY_HOST 'sudo systemctl restart ag-co-worker-frontend'` | `UPSTREAM_URL` читается при старте процесса. |
| Правка nginx конфига на сервере | `make deploy-nginx-sync && make deploy-nginx-reload` | Залить шаблон из репо на сервер, валидировать `nginx -t`, перечитать. |
| Посмотреть статус прода | `make deploy-status` | `systemctl status` юнита, порт 3008, доступность upstream и `curl /health` через домен. |

---

## Диагностика

```bash
# Статус прод-стека
make deploy-status

# Логи приложения
ssh $DEPLOY_HOST "journalctl -u ag-co-worker-frontend -n 200 -f"

# Логи nginx
ssh $DEPLOY_HOST "sudo tail -f /var/log/nginx/ag_co_worker.error.log"
ssh $DEPLOY_HOST "sudo tail -f /var/log/nginx/ag_co_worker.access.log"

# Проверка изоляции (снаружи должно быть "connection refused")
nc -vz ag.example.com 3008

# Доступен ли upstream с сервера
ssh $DEPLOY_HOST "set -a; . /srv/ag_co_worker/.env.prod; set +a; \
  curl -s -o /dev/null -w '%{http_code}\n' \"\${UPSTREAM_URL%/}/auth/session\""
```

Типичные случаи:

- **502 от nginx** — процесс лежит: `journalctl -u ag-co-worker-frontend`.
- **Логин отдаёт 403 с пустым телом** — upstream отбил запрос по `Origin`. `server.js` снимает этот заголовок перед проксированием; если правили прокси, проверьте, что `proxyReq.removeHeader("origin")` на месте.
- **Вместо JSON приходит HTML** — путь не попал в `pathFilter` и ушёл в SPA-fallback. Добавьте префикс в `frontend/server.js` (и в `frontend/vite.config.js`, чтобы dev и prod не разъезжались).
- **Логин или расчёт не работают целиком** — проверьте `UPSTREAM_URL` в `.env.prod`: `127.0.0.1:3005` на этой машине может быть занят чужим контейнером. Быстрая проверка — `make deploy-status`, шаг «upstream».

## Что НЕ делают скрипты

- Не создают и не пишут TLS-сертификаты (их ставит certbot отдельно).
- Не пишут в `.env.prod` — он под контролем оператора.
- Не останавливают юниты, которых больше нет в репозитории. После удаления Node-бэкенда старый юнит надо погасить руками: `ssh $DEPLOY_HOST 'sudo systemctl disable --now ag-co-worker-backend'` — иначе он продолжит слушать 3006.

`deploy-nginx-sync.sh` синхронизирует шаблон `deploy/nginx/ag_co_worker.conf` на сервер и валидирует `nginx -t`; `deploy-nginx-reload.sh` перечитывает конфиг — это разделение позволяет CI прогнать sync без reload, увидеть ошибку и не убить трафик.

---

## GitHub Actions auto-deploy (push в `main`)

Workflow [.github/workflows/prod-deploy.yml](../.github/workflows/prod-deploy.yml) делает то же самое, что `make deploy-*` локально: SSH-ится на прод, дёргает скрипты из `deploy/`. CI работает как «удалённая dev-машина» — никакой особой логики дублирующей `deploy/*.sh` в workflow нет.

### Триггеры

- **push в `main`** — rollout (nginx [если менялся] → frontend → smoke + Telegram).
- **workflow_dispatch** (`Actions → Prod deploy → Run workflow`) — те же шаги, плюс ручной вход:
  - `rev` — необязательная ревизия (тег, ветка или SHA), которая попадёт в `DEPLOY_REV`. **Используется для отката**: `Run workflow → rev = <previous-sha>`.

### Условия запуска шагов (на `push` в `main`)

| Шаг | Когда запускается |
|-----|---------------------|
| `deploy-nginx-sync.sh` + `deploy-nginx-reload.sh` | если менялись `deploy/nginx/**` |
| `deploy-frontend.sh` | если менялись `frontend/**` |
| `REBUILD=1` для frontend | если менялись `frontend/server.js`, `frontend/package.json` или unit-файл |
| `deploy-status.sh` | всегда (smoke test) |

На `workflow_dispatch` все rollout-шаги запускаются принудительно (use case — force redeploy или откат через `rev`).

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

Для установки/перезапуска юнита при bootstrap и деплое deploy-пользователю также нужен NOPASSWD на `systemctl` для `ag-co-worker-frontend` (и копирование unit-файла в `/etc/systemd/system/` при bootstrap).

### Откат

```bash
# Найти последний рабочий SHA в гите (например, тег предыдущего релиза)
gh workflow run prod-deploy.yml -f rev=<previous-sha>
```

Через UI: `Actions → Prod deploy → Run workflow → rev = …`.

### Что workflow НЕ делает

- Не управляет certbot/Let's Encrypt — systemd-timer на сервере.
- Не трогает `.env.prod` — никогда.
- Не собирает и не деплоит никакой backend: серверная часть живёт в отдельном проекте (ConstrTodo), этот пайплайн катит только статику и прокси.

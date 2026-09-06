# Deploy ag_co_worker → isocalc.constrtodo.ru

Прод: **Docker Compose** на `51.250.51.86` (hostname `webtest`, Ubuntu 24.04), TLS и маршрутизация по домену — на **хостовом nginx**. Деплой — SSH из локального Makefile или из GitHub Actions. **Своего backend и БД нет** — в стеке один сервис (frontend), а auth, calc, админ-API и выгрузка КП в 1С живут во внешнем ConstrTodo.

Машина общая: рядом живут `constr-todo-web`, `hr-todo-web`, `ag_sound_calc`, `acoustic_calc`, `cad-*`. Все — в Docker, исходники в `/home/leonidl/<project>`. Этот проект следует той же конвенции.

## Архитектура

```
Интернет :443 / :80 (redirect)
   ↓
[host nginx]  /etc/nginx/sites-enabled/ag_co_worker.conf
   └─ server_name isocalc.constrtodo.ru
      ssl_certificate /home/leonidl/certs/{fullchain,privkey}.pem   (wildcard *.constrtodo.ru)
      proxy_pass → 127.0.0.1:3007
   ↓
[frontend]  контейнер ag_co_worker-frontend   127.0.0.1:3007 → :3008
   ├─ express.static(/app/dist)        ← vite build, собран внутри образа
   ├─ /health, /__front_health         ← отвечает сам (живость процесса)
   └─ /login, /auth/*, /api/*, /integration/*, /admin/* (API), /content/*,
      /commerce/*                      → UPSTREAM_URL
   ↓
[внешний ConstrTodo] https://dev3.constrtodo.ru:3005 — auth / calc / админ-API / 1С
```

Наружу смотрит только nginx на 80/443, frontend опубликован на loopback.

### Почему именно такие порты

| Порт | Кто | Замечание |
|------|-----|-----------|
| `127.0.0.1:3007` | frontend (host) | Свободен. 3000–3006 на машине заняты соседями. |
| `3008` | frontend (в контейнере) | — |

`:3005` на хосте — это контейнер `hr-todo-web`, **не ConstrTodo**. Поэтому в `.env.prod` нельзя писать `UPSTREAM_URL=http://127.0.0.1:3005` — нужен `https://dev3.constrtodo.ru:3005`.

---

## Первый запуск

### 1. Предусловия на сервере (один раз, под root)

Docker и группа `docker` на webtest уже настроены (docker 27.4, compose v2.31, `leonidl` в группе). Node на хосте — 18, но он **не участвует**: vite собирается внутри образа на Node 22.

Сертификат тоже уже есть: общий wildcard `*.constrtodo.ru` (GlobalSign, до 2026-12-07) в `/home/leonidl/certs`. **Certbot не нужен.**

### 2. nginx server block (нужен sudo с паролем)

Без этого блока `isocalc.constrtodo.ru` попадает в чужой catch-all и отдаёт постороннюю страницу.

```bash
ssh leonidl@51.250.51.86
cd /home/leonidl/ag_co_worker   # после шага 3, либо просто скопируйте файл руками
sudo sed -e 's|<domain>|isocalc.constrtodo.ru|g' \
         -e 's|<cert_dir>|/home/leonidl/certs|g' \
         deploy/nginx/ag_co_worker.conf \
  | sudo tee /etc/nginx/sites-available/ag_co_worker.conf >/dev/null
sudo ln -sf /etc/nginx/sites-available/ag_co_worker.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. `.env.prod` на сервере

```bash
ssh leonidl@51.250.51.86
git clone https://github.com/lvp0110/ag_co_worker.git /home/leonidl/ag_co_worker
cd /home/leonidl/ag_co_worker
cp deploy/.env.prod.example .env.prod
chmod 600 .env.prod
# Проверить UPSTREAM_URL (или историческое имя AUTH_SERVICE_URL).
```

`bootstrap.sh` сделает clone сам, но `.env.prod` он не создаёт и не перезаписывает — файл под контролем оператора.

### 4. Локальный `.env.deploy` и bootstrap

```bash
cp deploy/.env.deploy.example deploy/.env.deploy   # уже заполнен под isocalc
make deploy-bootstrap
```

`bootstrap.sh`: clone/fetch → проверка предусловий (docker, доступ без sudo, nginx) → `docker compose up -d --build` → health → smoke по домену.

---

## Регулярный деплой

| Ситуация | Команда | Что произойдёт |
|----------|---------|----------------|
| Менялся frontend | `make deploy-frontend` | `git checkout frontend/` → `up -d --build frontend` (vite build внутри образа) → health + smoke по домену. |
| Откат | `REV=<sha> make deploy-frontend` | Тот же скрипт, но `git checkout <sha>` вместо `origin/main`. |
| Правка nginx | `make deploy-nginx-sync && make deploy-nginx-reload` | Требует NOPASSWD-sudo (см. ниже). Иначе — вручную по шагу 2. |
| Статус | `make deploy-status` | `compose ps` + ревизия + health фронта и домена. |
| Логи | `make deploy-logs` | `TAIL=500`, `FOLLOW=1`. |

Локальный Node для деплоя **не нужен** — вся сборка на сервере в образах.

---

## GitHub Actions auto-deploy (push в `main`)

[.github/workflows/prod-deploy.yml](../.github/workflows/prod-deploy.yml) дёргает те же `deploy/*.sh`. Node в runner'е не ставится.

### Триггеры

- **push в `main`** — селективный rollout по изменённым путям + smoke + Telegram.
- **workflow_dispatch** — все шаги принудительно, плюс вход `rev` для **отката**.

### Условия шагов (на push)

| Шаг | Когда |
|-----|-------|
| `deploy-frontend.sh` | менялись `frontend/**` или `docker-compose.prod.yml` |
| nginx sync + reload | менялись `deploy/nginx/**` **и** переменная `NGINX_AUTOSYNC=true` |
| `deploy-status.sh` | всегда |

### Требуемые GitHub Secrets

`Settings → Secrets and variables → Actions → Repository secrets`:

| Секрет | Значение для isocalc |
|--------|----------------------|
| `DEPLOY_HOST` | `leonidl@51.250.51.86` |
| `DEPLOY_DIR` | `/home/leonidl/ag_co_worker` |
| `DEPLOY_DOMAIN` | `isocalc.constrtodo.ru` |
| `DEPLOY_CERT_DIR` | `/home/leonidl/certs` |
| `DEPLOY_SSH_KEY` | приватный ed25519-ключ deploy-юзера (полный PEM с `-----BEGIN…END-----`) |
| `DEPLOY_KNOWN_HOSTS` | `51.250.51.86 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDxXwEwTYlSMhk6S1PEVAjmWI/ZEYfOYKZfqOBoedgXH` |
| `TELEGRAM_BOT_TOKEN` | токен бота |
| `TELEGRAM_CHAT_ID` | id чата (для группы — с `-100…`) |

Переменная (не секрет), `Settings → Variables`:

| Переменная | Смысл |
|------------|-------|
| `NGINX_AUTOSYNC` | `true` — разрешить CI синхронизировать nginx-конфиг. Требует NOPASSWD-sudo. По умолчанию выключено. |

### SSH-ключ для CI

Сейчас локальный `deploy/.env.deploy` указывает на `~/.ssh/hrtodo_deploy` — это рабочий ключ, но он «чужой» (от hr-todo-web). Лучше завести отдельный:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/isocalc_deploy -C "github-actions ag_co_worker" -N ""
ssh-copy-id -i ~/.ssh/isocalc_deploy.pub leonidl@51.250.51.86
```

Затем в `deploy/.env.deploy` поменять `DEPLOY_SSH_KEY_FILE=~/.ssh/isocalc_deploy`, а содержимое `~/.ssh/isocalc_deploy` (приватный!) положить в секрет `DEPLOY_SSH_KEY`.

### NOPASSWD-sudo (опционально, только для авто-nginx)

Деплой контейнеров sudo **не требует** — `leonidl` в группе `docker`. Sudo нужен исключительно для nginx. Если хотите, чтобы CI сам применял конфиг, `/etc/sudoers.d/deploy-nginx`:

```
leonidl ALL=(root) NOPASSWD: /usr/bin/cp * /etc/nginx/sites-available/*, \
                             /usr/bin/ln -sf /etc/nginx/sites-available/* /etc/nginx/sites-enabled/*, \
                             /usr/sbin/nginx -t, \
                             /bin/systemctl reload nginx
```

После этого выставить `NGINX_AUTOSYNC=true`.

### Откат

```bash
gh workflow run prod-deploy.yml -f rev=<previous-sha>
```

Или UI: `Actions → Prod deploy → Run workflow → rev = …`.

---

## Диагностика

```bash
make deploy-status              # compose ps + health
make deploy-logs                # логи frontend-контейнера
FOLLOW=1 make deploy-logs       # то же в режиме follow

# nginx (нужен sudo)
ssh leonidl@51.250.51.86 "sudo tail -f /var/log/nginx/ag_co_worker.error.log"

# Изоляция: снаружи должно быть закрыто
nc -vz 51.250.51.86 3007    # ожидаем refused (только loopback)
```

Частые случаи:

- **Домен отдаёт постороннюю страницу** — не активирован nginx server block (шаг 2).
- **502 от nginx** — фронт-контейнер лежит: `make deploy-logs`.
- **Логин не работает** — проверьте `UPSTREAM_URL` (или `AUTH_SERVICE_URL`) в `.env.prod`: `127.0.0.1:3005` на этой машине это hr-todo-web, нужен `https://dev3.constrtodo.ru:3005`.
- **Контейнер поднялся, но nginx даёт 502** — в `.env.prod` появился `HOST=127.0.0.1`. Его быть не должно: внутри контейнера нужен bind на `0.0.0.0`.

## Что скрипты НЕ делают

- Не ставят и не обновляют TLS-сертификаты (wildcard живёт вне проекта).
- Не пишут `.env.prod` — он под контролем оператора.
- Не ставят nginx server block без NOPASSWD-sudo — по умолчанию это ручной шаг.

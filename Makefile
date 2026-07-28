# Makefile для локальной разработки ag_co_worker.
#
# Быстрый старт с нуля:
#   make setup    — поставить зависимости, создать .env, поднять БД, прогнать миграции
#   make dev      — запустить postgres + backend + frontend (Ctrl-C остановит всё)
#
# Сервисы после `make dev`:
#   postgres       → localhost:5435 (контейнер ag_co_worker_postgres)
#   backend API    → http://localhost:3007  (Swagger: /api/docs)
#   frontend       → http://localhost:5175
#   Adminer (SQL)  → http://localhost:8081
#   Prisma Studio  → http://localhost:5556  (после `make db-ui`)

SHELL := /bin/bash
BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: help setup install reinstall env db-up db-down db-migrate db-reset db-ui \
        backend frontend frontend-docker dev dev-docker dev-docker-build stop build clean status \
        deploy-bootstrap deploy-backend deploy-frontend deploy-migrate \
        deploy-create-admin deploy-nginx-sync deploy-nginx-reload deploy-status

.DEFAULT_GOAL := help

help: ## Показать список команд
	@echo "Команды:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── one-shot setup ─────────────────────────────────────────────────────────

setup: install env db-up db-migrate ## Первая инициализация: deps + .env + БД + миграции
	@echo ""
	@echo "✓ Готово. Запустите:  make dev"

# ─── deps ───────────────────────────────────────────────────────────────────

install: ## Установить зависимости (backend + frontend)
	@echo "→ backend deps"
	cd $(BACKEND_DIR) && npm install
	@echo "→ puppeteer Chromium (PDF КП; пропустится, если уже в кэше)"
	cd $(BACKEND_DIR) && npx puppeteer browsers install chrome
	@echo "→ prisma client (postinstall; на случай пропуска — явный generate)"
	cd $(BACKEND_DIR) && npx prisma generate
	@echo "→ frontend deps"
	cd $(FRONTEND_DIR) && npm install

reinstall: ## Чистая переустановка зависимостей (на случай сбоев npm / ENOTEMPTY)
	@echo "→ удаляю node_modules и package-lock.json"
	rm -rf $(BACKEND_DIR)/node_modules $(BACKEND_DIR)/package-lock.json \
	       $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/package-lock.json
	@$(MAKE) --no-print-directory install

env: ## Создать backend/.env из .env.example, если отсутствует
	@if [ ! -f $(BACKEND_DIR)/.env ]; then \
	  echo "→ создаю $(BACKEND_DIR)/.env"; \
	  cp $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env; \
	else \
	  echo "✓ $(BACKEND_DIR)/.env уже есть — не перезаписываю"; \
	fi

# ─── database ───────────────────────────────────────────────────────────────

db-up: ## Поднять postgres + adminer в docker и дождаться healthcheck
	@docker info >/dev/null 2>&1 || { echo "✗ Docker не запущен. Запустите Docker Desktop."; exit 1; }
	docker compose up -d postgres adminer
	@echo "→ жду healthcheck postgres..."
	@for i in $$(seq 1 30); do \
	  status=$$(docker inspect -f '{{.State.Health.Status}}' ag_co_worker_postgres 2>/dev/null); \
	  if [ "$$status" = "healthy" ]; then echo "✓ postgres healthy ($$i s)"; exit 0; fi; \
	  sleep 1; \
	done; \
	echo "✗ postgres не стал healthy за 30 s"; exit 1

db-down: ## Остановить контейнеры docker compose
	docker compose down

db-migrate: ## Применить миграции prisma к локальной БД
	cd $(BACKEND_DIR) && npx prisma migrate deploy

db-reset: ## ⚠️  Полностью пересоздать БД и применить миграции (ВСЕ ДАННЫЕ БУДУТ СТЁРТЫ)
	cd $(BACKEND_DIR) && npx prisma migrate reset --force --skip-seed

db-ui: ## Prisma Studio на http://localhost:5556
	cd $(BACKEND_DIR) && npm run db:ui

# ─── dev runners ────────────────────────────────────────────────────────────

backend: ## Запустить backend (tsx watch) на :3007
	cd $(BACKEND_DIR) && npm run dev

frontend: ## Запустить frontend (vite) на :5175
	cd $(FRONTEND_DIR) && npm run dev

frontend-docker: ## Запустить только frontend (vite) в docker на :5175 (поднимет и backend как зависимость)
	@docker info >/dev/null 2>&1 || { echo "✗ Docker не запущен. Запустите Docker Desktop."; exit 1; }
	docker compose up --build frontend

dev: ## Запустить postgres + миграции + backend + frontend (Ctrl-C остановит всё)
	@$(MAKE) --no-print-directory db-up
	@$(MAKE) --no-print-directory db-migrate
	@echo ""
	@echo "→ backend: http://localhost:3007  |  frontend: http://localhost:5175"
	@echo "→ Ctrl-C остановит backend и frontend (postgres продолжит работать)"
	@echo ""
	@trap 'echo ""; echo "→ останавливаю dev-процессы"; kill 0' INT TERM; \
	 ( cd $(BACKEND_DIR) && npm run dev ) & \
	 ( cd $(FRONTEND_DIR) && npm run dev ) & \
	 wait

dev-docker: ## Поднять ВЕСЬ стек в docker (postgres + adminer + backend + frontend) одной командой
	@docker info >/dev/null 2>&1 || { echo "✗ Docker не запущен. Запустите Docker Desktop."; exit 1; }
	@echo "→ backend: http://localhost:3007  |  frontend: http://localhost:5175  |  adminer: http://localhost:8081"
	@echo "→ миграции применяются автоматически при старте backend-контейнера"
	@echo "→ Ctrl-C остановит контейнеры"
	@echo "→ пересборка образов: make dev-docker-build"
	docker compose up

dev-docker-build: ## Пересобрать образы и поднять весь docker-стек (медленнее, нужно после смены Dockerfile/deps)
	@docker info >/dev/null 2>&1 || { echo "✗ Docker не запущен. Запустите Docker Desktop."; exit 1; }
	@echo "→ backend: http://localhost:3007  |  frontend: http://localhost:5175  |  adminer: http://localhost:8081"
	docker compose up --build

stop: ## Убить зависшие backend/frontend процессы (host) + остановить docker-контейнеры стека
	@pkill -f "tsx watch src/index.ts" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@for pid in $$(lsof -tiTCP:5175 -sTCP:LISTEN 2>/dev/null); do kill $$pid 2>/dev/null || true; done
	@docker compose stop frontend backend 2>/dev/null || true
	@echo "✓ backend и frontend остановлены"

# ─── builds ─────────────────────────────────────────────────────────────────

build: ## Production-сборка backend (tsc) + frontend (vite)
	cd $(BACKEND_DIR) && npm run build
	cd $(FRONTEND_DIR) && npm run build

# ─── housekeeping ───────────────────────────────────────────────────────────

clean: ## Удалить node_modules и dist
	rm -rf $(BACKEND_DIR)/node_modules $(BACKEND_DIR)/dist \
	       $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/dist

status: ## Проверить, что где крутится
	@echo "— docker:"
	@docker ps --filter "name=ag_co_worker" --format "  {{.Names}}  {{.Status}}  {{.Ports}}" || true
	@echo "— listen ports:"
	@for port in 3007 5175 5435 5556 8081; do \
	  if lsof -iTCP:$$port -sTCP:LISTEN -n -P 2>/dev/null | tail -n +2 | head -1 >/dev/null; then \
	    echo "  :$$port — busy"; \
	  else \
	    echo "  :$$port — free"; \
	  fi; \
	done

# ─── prod deploy (SSH + Makefile) ───────────────────────────────────────────
# Требуется deploy/.env.deploy (копия из deploy/.env.deploy.example).

deploy-bootstrap: ## Первый запуск на чистом сервере (клонирует репо, проверяет nginx+.env.prod, поднимает все сервисы, мигрирует)
	bash deploy/bootstrap.sh

deploy-backend: ## Роллаут backend на прод (БД/frontend не трогает). REV=<commit> для точечной ревизии
	bash deploy/deploy-backend.sh

deploy-frontend: ## Локальный vite build + rsync dist на прод. REBUILD=1 если менялся server.js/Dockerfile
	bash deploy/deploy-frontend.sh

deploy-migrate: ## Применить prisma migrate deploy на проде (отдельный run --rm, не трогает работающий backend)
	bash deploy/deploy-migrate.sh

deploy-create-admin: ## Создать/повысить рутового админа на проде (креды из .env.prod: ADMIN_EMAIL/ADMIN_PASSWORD)
	bash deploy/deploy-create-admin.sh

deploy-nginx-sync: ## Залить nginx server block из deploy/nginx/ на сервер и валидировать nginx -t
	bash deploy/deploy-nginx-sync.sh

deploy-nginx-reload: ## nginx -t && systemctl reload nginx на сервере
	bash deploy/deploy-nginx-reload.sh

deploy-status: ## Состояние прод-стека (compose ps + curl /health)
	bash deploy/deploy-status.sh

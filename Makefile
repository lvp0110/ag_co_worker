# Makefile для локальной разработки ag_co_worker.
#
# Быстрый старт с нуля:
#   make setup    — поставить зависимости, создать .env
#   make dev      — запустить backend + frontend (Ctrl-C остановит всё)
#
# Сервисы после `make dev`:
#   backend API    → http://localhost:3007  (Swagger: /api/docs)
#   frontend       → http://localhost:5175
# Auth / calc / 1С → http://localhost:3005  (внешний сервис)
#
# Prod: host Node + systemd (без Docker). См. deploy/README.md.

SHELL := /bin/bash
BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: help setup install reinstall env \
        backend frontend dev stop build clean status \
        deploy-bootstrap deploy-backend deploy-frontend \
        deploy-nginx-sync deploy-nginx-reload deploy-status

.DEFAULT_GOAL := help

help: ## Показать список команд
	@echo "Команды:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── one-shot setup ─────────────────────────────────────────────────────────

setup: install env ## Первая инициализация: deps + .env
	@echo ""
	@echo "✓ Готово. Запустите:  make dev"
	@echo "  (нужен внешний сервис auth/calc/1С на :3005)"

# ─── deps ───────────────────────────────────────────────────────────────────

install: ## Установить зависимости (backend + frontend)
	@echo "→ backend deps"
	cd $(BACKEND_DIR) && npm install
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

# ─── dev runners ────────────────────────────────────────────────────────────

backend: ## Запустить backend (tsx watch) на :3007
	cd $(BACKEND_DIR) && npm run dev

frontend: ## Запустить frontend (vite) на :5175
	cd $(FRONTEND_DIR) && npm run dev

dev: ## Запустить backend + frontend (Ctrl-C остановит всё)
	@echo ""
	@echo "→ backend: http://localhost:3007  |  frontend: http://localhost:5175"
	@echo "→ Ctrl-C остановит backend и frontend"
	@echo ""
	@trap 'echo ""; echo "→ останавливаю dev-процессы"; kill 0' INT TERM; \
	 ( cd $(BACKEND_DIR) && npm run dev ) & \
	 ( cd $(FRONTEND_DIR) && npm run dev ) & \
	 wait

stop: ## Убить зависшие backend/frontend процессы
	@pkill -f "tsx watch src/index.ts" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@for pid in $$(lsof -tiTCP:5175 -sTCP:LISTEN 2>/dev/null); do kill $$pid 2>/dev/null || true; done
	@echo "✓ backend и frontend остановлены"

# ─── builds ─────────────────────────────────────────────────────────────────

build: ## Production-сборка backend (tsc) + frontend (vite)
	cd $(BACKEND_DIR) && npm run build
	cd $(FRONTEND_DIR) && npm run build

# ─── housekeeping ───────────────────────────────────────────────────────────

clean: ## Удалить node_modules и dist
	rm -rf $(BACKEND_DIR)/node_modules $(BACKEND_DIR)/dist \
	       $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/dist

status: ## Проверить занятость портов
	@echo "— listen ports:"
	@for port in 3005 3007 5175; do \
	  if lsof -iTCP:$$port -sTCP:LISTEN -n -P 2>/dev/null | tail -n +2 | head -1 >/dev/null; then \
	    echo "  :$$port — busy"; \
	  else \
	    echo "  :$$port — free"; \
	  fi; \
	done

# ─── prod deploy (SSH + systemd) ────────────────────────────────────────────
# Требуется deploy/.env.deploy (копия из deploy/.env.deploy.example).

deploy-bootstrap: ## Первый запуск на чистом сервере (git + systemd units + npm build)
	bash deploy/bootstrap.sh

deploy-backend: ## Роллаут backend (npm ci/build + systemctl restart). REV=<commit> для точечной ревизии
	bash deploy/deploy-backend.sh

deploy-frontend: ## Локальный vite build + rsync dist. REBUILD=1 если менялся server.js
	bash deploy/deploy-frontend.sh

deploy-nginx-sync: ## Залить nginx server block из deploy/nginx/ на сервер и валидировать nginx -t
	bash deploy/deploy-nginx-sync.sh

deploy-nginx-reload: ## nginx -t && systemctl reload nginx на сервере
	bash deploy/deploy-nginx-reload.sh

deploy-status: ## Состояние прод-стека (systemctl + curl /health)
	bash deploy/deploy-status.sh

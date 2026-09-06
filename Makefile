# Makefile для локальной разработки ag_co_worker.
#
# Быстрый старт с нуля:
#   make setup    — поставить зависимости
#   make dev      — запустить frontend (Ctrl-C остановит)
#
# Своего backend у проекта нет: auth, calc, админ-API и выгрузка КП в 1С — это
# внешний ConstrTodo на :3005, dev-прокси vite отправляет запросы туда.
#
# Сервисы после `make dev`:
#   frontend             → http://localhost:5175
#   ConstrTodo (внешний) → http://localhost:3005
#
# Prod: Docker Compose на webtest, домен isocalc.constrtodo.ru. См. deploy/README.md.

SHELL := /bin/bash
FRONTEND_DIR := frontend

.PHONY: help setup install reinstall \
        frontend dev stop build clean status \
        deploy-bootstrap deploy-frontend \
        deploy-nginx-sync deploy-nginx-reload deploy-status deploy-logs

.DEFAULT_GOAL := help

help: ## Показать список команд
	@echo "Команды:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── one-shot setup ─────────────────────────────────────────────────────────

setup: install ## Первая инициализация: deps
	@echo ""
	@echo "✓ Готово. Запустите:  make dev"
	@echo "  (нужен внешний ConstrTodo на :3005 — или UPSTREAM_TARGET на staging,"
	@echo "   см. frontend/.env.example)"

# ─── deps ───────────────────────────────────────────────────────────────────

install: ## Установить зависимости
	cd $(FRONTEND_DIR) && npm install

reinstall: ## Чистая переустановка зависимостей (на случай сбоев npm / ENOTEMPTY)
	@echo "→ удаляю node_modules и package-lock.json"
	rm -rf $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/package-lock.json
	@$(MAKE) --no-print-directory install

# ─── dev runners ────────────────────────────────────────────────────────────

frontend: ## Запустить frontend (vite) на :5175
	cd $(FRONTEND_DIR) && npm run dev

dev: frontend ## Алиас для make frontend (Ctrl-C остановит)

stop: ## Убить зависший vite
	@pkill -f "vite" 2>/dev/null || true
	@for pid in $$(lsof -tiTCP:5175 -sTCP:LISTEN 2>/dev/null); do kill $$pid 2>/dev/null || true; done
	@echo "✓ frontend остановлен"

# ─── builds ─────────────────────────────────────────────────────────────────

build: ## Production-сборка frontend (vite)
	cd $(FRONTEND_DIR) && npm run build

# ─── housekeeping ───────────────────────────────────────────────────────────

clean: ## Удалить node_modules и dist
	rm -rf $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/dist

status: ## Проверить занятость портов
	@echo "— listen ports:"
	@for port in 3005 5175; do \
	  if lsof -iTCP:$$port -sTCP:LISTEN -n -P 2>/dev/null | tail -n +2 | head -1 >/dev/null; then \
	    echo "  :$$port — busy"; \
	  else \
	    echo "  :$$port — free"; \
	  fi; \
	done

# ─── prod deploy (SSH + Docker Compose) ─────────────────────────────────────
# Требуется deploy/.env.deploy (копия из deploy/.env.deploy.example).
# Сборка идёт НА СЕРВЕРЕ внутри образов (Node 22) — локальный Node не нужен.

deploy-bootstrap: ## Первый запуск на сервере (git clone + docker compose up --build)
	bash deploy/bootstrap.sh

deploy-frontend: ## Роллаут frontend-контейнера (vite build внутри образа). REV=<commit>
	bash deploy/deploy-frontend.sh

deploy-nginx-sync: ## Залить nginx server block на сервер и валидировать nginx -t (нужен sudo)
	bash deploy/deploy-nginx-sync.sh

deploy-nginx-reload: ## nginx -t && systemctl reload nginx на сервере (нужен sudo)
	bash deploy/deploy-nginx-reload.sh

deploy-status: ## Состояние прод-стека (compose ps + health)
	bash deploy/deploy-status.sh

deploy-logs: ## Логи контейнеров. SERVICE=frontend TAIL=500 FOLLOW=1
	bash deploy/deploy-logs.sh

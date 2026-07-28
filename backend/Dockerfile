# syntax=docker/dockerfile:1

# ─── build stage ─────────────────────────────────────────────────────────────
# Debian slim вместо alpine — bundled Chromium у puppeteer собран под glibc.
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Кэш Chromium кладём внутри /app, чтобы переехать в runtime-стадию COPY-ем.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# tar + unzip нужны postinstall'у puppeteer для распаковки chrome-headless-shell;
# в slim-образе их нет. ca-certificates — для HTTPS-загрузки.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      tar \
      unzip \
      python3 \
      make \
      g++ \
    && rm -rf /var/lib/apt/lists/*

# Все зависимости (включая dev) — нужны tsc, prisma, @types/*.
# package.json postinstall запускает `prisma generate` — поэтому схема нужна ДО npm ci.
# postinstall у puppeteer выкачает Chromium в PUPPETEER_CACHE_DIR.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build
# /app/dist — скомпилированный JS.

# ─── runtime stage ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Системные библиотеки headless Chromium + кириллические шрифты для рендера КП.
# Без font'ов кириллица в PDF превращается в "тофу" (квадратики).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-color-emoji \
      libnss3 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Только prod-зависимости. `--ignore-scripts` отключает postinstall'ы
# (prisma generate здесь не нужен — клиент COPY-нем из build-стадии;
# puppeteer-postinstall не должен снова качать Chromium — бинарь тоже из build).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Сгенерированный Prisma-клиент из build-стадии (чтобы не тащить prisma CLI в prod).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Native-биндинги модулей, чей postinstall был выключен `--ignore-scripts`.
# bcrypt'у нужен .node-файл, который собирается/скачивается postinstall'ом.
COPY --from=build /app/node_modules/bcrypt ./node_modules/bcrypt

# Chromium из puppeteer-postinstall build-стадии.
COPY --from=build /app/.cache/puppeteer ./.cache/puppeteer

# Скомпилированный код + схема/миграции (нужны для `prisma migrate deploy`).
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

# Mount-point для пользовательских загрузок (логотипы КП). Реальные данные
# подъедут из named volume ag_co_worker_uploads, но директория должна
# существовать в образе, чтобы node-юзер мог писать в неё на первом старте.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Backend доступен только во внутренней docker network — порт на хост не публикуется.
EXPOSE 3006

USER node

CMD ["node", "dist/index.js"]

# ─── dev stage ───────────────────────────────────────────────────────────────
# Для локальной разработки в docker compose: tsx watch + prisma CLI (dev-deps),
# chromium для PDF + runtime-библиотеки + кириллические шрифты. Исходники и
# node_modules монтируются из compose (bind-mount + named volume), поэтому здесь
# ставим зависимости лишь для инициализации volume и скачивания Chromium.
FROM node:20-bookworm-slim AS dev
WORKDIR /app
ENV NODE_ENV=development
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
# У Chrome-for-Testing нет linux-arm64 сборки: puppeteer на Apple Silicon
# выкачивает x86-64 Chromium, который под arm64-контейнером падает в Rosetta
# (rosetta error: ld-linux-x86-64.so.2 not found). Поэтому в dev берём нативный
# системный Chromium из apt (совпадает с архитектурой образа) и не качаем бандл.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      tar \
      unzip \
      python3 \
      make \
      g++ \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-color-emoji \
      libnss3 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*

# package.json postinstall → prisma generate; puppeteer postinstall → выкачка Chromium.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

EXPOSE 3006
CMD ["npm", "run", "dev"]

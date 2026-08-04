# ag_co_worker backend — Express API (прокси calc + создание КП в 1С).
#
# Multi-stage: tsc собирается с dev-deps, в рантайм уезжает только dist + prod-deps.
# Node 22 — на хосте webtest стоит 18, поэтому версию фиксируем в образе.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# HOST намеренно НЕ задаём: src/index.ts при пустом HOST биндит все интерфейсы.
# Внутри контейнера это обязательно — иначе frontend не дотянется до backend:3006.
# Наружу порт не публикуется (см. docker-compose.prod.yml), только в compose-сеть.
EXPOSE 3006
USER node
CMD ["node", "dist/index.js"]

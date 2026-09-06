# ag_co_worker frontend — vite build + Node-прокси (server.js).
#
# Multi-stage: vite собирается с dev-deps, в рантайме остаётся server.js,
# dist и prod-deps (express + http-proxy-middleware).
# Node 22 — vite 7 требует ≥20.19, а на хосте webtest стоит 18.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# VITE_API_URL="" → apiClient.js бьёт по относительным путям, а server.js
# проксирует их в ConstrTodo (single-origin auth).
# BASE_PATH не задаём: отдаём с корня домена, а не из подпути как на GH Pages.
# VITE_ROUTER_HASH не задаём: с корня домена нужен BrowserRouter.
ENV VITE_API_URL=""
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY --from=build /app/dist ./dist

ENV DIST_DIR=/app/dist
EXPOSE 3008
USER node
CMD ["node", "server.js"]

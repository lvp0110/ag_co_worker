# syntax=docker/dockerfile:1
#
# Runtime-образ фронта: только express-server, который отдаёт статику и
# проксирует /api в backend. Сама статика (dist/) НЕ копируется в образ —
# она монтируется bind-mount'ом из ./frontend/dist:/app/dist:ro в compose.
# Это позволяет роллить фронт rsync'ом без rebuild'а контейнера.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.prod.json ./package.json
RUN npm install --omit=dev

COPY server.js ./

# Контейнер слушает только на loopback-bind в compose — здесь просто экспозим.
EXPOSE 3004

USER node

CMD ["node", "server.js"]

# Production deploy

Frontend запускается в Docker на `prodfront` и доступен gateway только по
приватному адресу `10.0.0.249:3011`. Публичный адрес
`https://isocalc.constrtodo.ru` и wildcard TLS обслуживаются `gatewaytodo`.

Своего backend у проекта нет. Node-сервер frontend проксирует auth, calculator,
admin, content, commerce и integration-запросы во внутренний ConstrTodo по
адресу `http://prodbackend.mcs.local:3005`.

Первый запуск:

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# заполнить/проверить deploy/.env.deploy
REV=origin/newdeploy make deploy-bootstrap
```

Bootstrap клонирует репозиторий, создаёт `.env.prod` из шаблона при его
отсутствии и останавливается. После заполнения `.env.prod` команда запускается
повторно.

Последующие команды:

```bash
make deploy-frontend
make deploy-status
make deploy-logs
FOLLOW=1 make deploy-logs
```

Обязательные GitHub Actions secrets:

- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`
- `DEPLOY_HOST=altair@prodfront.mcs.local`
- `DEPLOY_JUMP_HOST=antares@138.16.206.30`
- `DEPLOY_DIR=/home/altair/work/ag_co_worker`
- `DEPLOY_DOMAIN=isocalc.constrtodo.ru`

`TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` необязательны.

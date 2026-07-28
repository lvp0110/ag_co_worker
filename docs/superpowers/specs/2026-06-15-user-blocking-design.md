# Блокировка пользователя администратором

Дата: 2026-06-15

## Цель

Дать администратору возможность заблокировать/разблокировать пользователя.
Блокировка действует **мгновенно**: заблокированный не может войти заново, а его
уже активные сессии перестают работать на следующем же запросе.

## DB

[schema.prisma](../../../backend/prisma/schema.prisma), модель `User`:

```prisma
isBlocked Boolean @default(false) @map("is_blocked")
```

Миграция: `cd backend && npx prisma migrate dev --name add_user_is_blocked`.

## Backend — мгновенный эффект

- [requireAuth.ts](../../../backend/src/middleware/requireAuth.ts): сейчас
  stateless (только верификация JWT). Добавляется запрос к БД
  `prisma.user.findUnique({ where: { id: payload.userId }, select: { isBlocked: true } })`.
  Если пользователь не найден или `isBlocked === true` →
  `403 { error: "Account is blocked" }`. Middleware становится async.
  Цена — +1 лёгкий индексированный запрос на каждый авторизованный запрос;
  для внутреннего инструмента приемлемо.
- [auth.ts](../../../backend/src/routes/auth.ts) `/login`: проверка
  `isBlocked` **после** сверки пароля (чтобы не раскрывать статус блокировки до
  верных кредов) → `403 { error: "Учётная запись заблокирована" }`.
- [auth.ts](../../../backend/src/routes/auth.ts) `/refresh`: если
  `user.isBlocked` → `clearAuthCookies(res)` + `401 { error: "Account is blocked" }`.

## Backend — управление

Новый эндпоинт в [admin.ts](../../../backend/src/routes/admin.ts) (под
`requireAuth, requireAdmin`):

- `PATCH /api/admin/users/:id/block`, тело `{ is_blocked: boolean }`.
- Валидация:
  - `is_blocked` должен быть boolean — иначе `400 { error: "is_blocked must be a boolean" }`;
  - пользователь существует — иначе `404 { error: "User not found" }`;
  - **самоблокировка запрещена**: если `req.auth.userId === req.params.id` →
    `400 { error: "Нельзя заблокировать собственную учётную запись" }`.
- Обновляет только поле `isBlocked`, возвращает `200` с `toUserDto(updated)`.

`toUserDto` ([userDto.ts](../../../backend/src/utils/userDto.ts)) получает поле
`is_blocked: user.isBlocked`.

## Frontend

- [adminApi.js](../../../frontend/src/services/adminApi.js): новая функция
  `setUserBlocked(id, isBlocked)` →
  `PATCH /api/admin/users/${id}/block`, body `{ is_blocked: isBlocked }`.
- [AdminUsersPage.jsx](../../../frontend/src/components/AdminUsersPage.jsx):
  - новая колонка «Доступ» с тумблером (toggle switch);
  - **ON = пользователь активен** (доступ есть), **OFF = заблокирован**;
  - переключение → `setUserBlocked(u.id, !checked)` → обновление строки в `users`
    из ответа; при ошибке — показать в `error` и не менять состояние;
  - тумблер для **своей** строки (`u.id === currentUser.id`) задизейблен;
  - заблокированная строка слегка приглушена (CSS).
  - текущий пользователь берётся из `useAuth()` (AuthContext).
- [Admin.css](../../../frontend/src/components/Admin.css): стили тумблера и
  приглушённой строки.

## Вне scope (YAGNI)

- Причина блокировки, дата/автор блокировки, аудит.
- Массовая блокировка.

## Проверка

- Миграция применяется в Docker-postgres.
- `tsc --noEmit` в `backend/`.
- `npm run build` во `frontend/`.
- E2E через Docker:
  1. залогиниться пользователем → получить активную сессию;
  2. админом заблокировать его → следующий запрос активной сессии даёт `403`;
  3. логин заблокированным → `403`;
  4. разблокировать → логин снова `200`;
  5. попытка админа заблокировать себя → `400`.

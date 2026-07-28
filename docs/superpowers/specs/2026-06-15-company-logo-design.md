# Логотип на уровне компании (вместо КП)

Дата: 2026-06-15

## Цель

Логотип, который сейчас задаётся на каждом КП (`Offer.logoUrl`), переносится на
**компанию**. КП использует логотип компании владельца оффера. Управление
логотипом — в админке (Компании). Логотип **обязателен** для компании,
дефолтного логотипа больше нет.

## Решения (согласовано)

- Управление логотипом — в админке → Компании (форма компании).
- Загрузка логотипа на странице КП убирается полностью.
- Старые логотипы существующих КП отбрасываются (бэкфилла нет).
- Дефолтный логотип (`DEFAULT_LOGO_BLOCK`) удаляется.
- Логотип обязателен для компании (см. модель обязательности ниже).

## Модель обязательности

`Company.logoUrl` в БД остаётся **nullable**: существующую компанию нельзя
перевести в `NOT NULL` без файла для бэкфилла (старые лого отброшены).
Обязательность обеспечивается на уровне приложения:

- POST `/api/admin/companies` — без `logo_url` → `400`.
- PATCH `/api/admin/companies/:id` — `logo_url` нельзя очистить (пустая строка →
  `400`); допускается только замена на новый непустой url.
- В админ-UI нет кнопки «Удалить логотип» — только «Загрузить»/«Заменить».
- Существующей компании админ обязан один раз загрузить логотип; до этого её КП
  рендерятся без картинки логотипа.

Доведение колонки до `NOT NULL` — вне scope (отдельной миграцией, когда у всех
компаний будут логотипы).

## DB

[schema.prisma](../../../backend/prisma/schema.prisma):

- `Company`: добавить `logoUrl String? @map("logo_url")`.
- `Offer`: удалить поле `logoUrl` (и `logo_url` колонку).

Миграция: `cd backend && npx prisma migrate dev --name move_logo_to_company`
(добавляет `companies.logo_url`, удаляет `offers.logo_url`).

## Backend

- `toCompanyDto` ([userDto.ts](../../../backend/src/utils/userDto.ts)): добавить
  `logo_url: company.logoUrl`.
- Admin-эндпоинты компаний ([admin.ts](../../../backend/src/routes/admin.ts)):
  - POST `/companies`: принимать `logo_url`; **обязателен** (400, если пусто).
  - PATCH `/companies/:id`: принимать `logo_url`; если передан — должен быть
    непустым (400 при пустой строке); иначе не трогаем.
- Загрузка файла: переиспользуем существующий `POST /api/uploads/logo`
  (под `requireAuth`, админ авторизован), формат ответа и хранилище те же
  (`/uploads/logo-<sha256>.<ext>`).
- PDF-роут ([offers.ts](../../../backend/src/routes/offers.ts)): `logo_url`
  берётся из `dto.company?.logo_url` вместо `dto.logo_url`.
- Удалить всё про `Offer.logoUrl`:
  - `verifyLogoFile` и её вызовы в `loadOfferDto`;
  - `logoUrl` в POST/PATCH offers, в `toOfferDto`, в `source.logoUrl`;
  - поля логотипа в Zod-схемах ([schemas.ts](../../../backend/src/docs/schemas.ts))
    и swagger ([swagger.ts](../../../backend/src/docs/swagger.ts)).
- Шаблон [offerKp.ts](../../../backend/src/templates/offerKp.ts):
  - удалить `DEFAULT_LOGO_BLOCK`;
  - `buildLogoBlockHtml(logoUrl)`: если `logoUrl` пуст или файл не найден →
    вернуть пустую строку (логотип не выводится), без дефолта.
  - входное поле `logo_url` в типе остаётся (заполняется логотипом компании).

## Frontend

- [AdminCompaniesPage.jsx](../../../frontend/src/components/AdminCompaniesPage.jsx):
  в форму компании добавить блок логотипа — превью + «Загрузить»/«Заменить»
  (без «Удалить»). Загрузка через `POST /api/uploads/logo` → полученный
  `url` кладётся в `logo_url` и сохраняется PATCH/POST компании. Валидация:
  при создании логотип обязателен.
- [adminApi.js](../../../frontend/src/services/adminApi.js): добавить
  `uploadLogo(file)` (или импортировать существующий из offersApi) для
  загрузки файла логотипа.
- [KpPage.jsx](../../../frontend/src/components/KpPage.jsx): удалить секцию
  логотипа (≈1809–1862) и связанную логику: `logoUrl` в инициализации формы,
  `isUploadingLogo`/`logoUploadError`/`logoInputRef`,
  `triggerLogoPicker`/`onLogoFileChange`/`onLogoRemove`/`onLogoLoadError`,
  импорт `uploadLogo`.
- [offerMapper.js](../../../frontend/src/utils/offerMapper.js): убрать `logo_url`
  из payload и `logoUrl` из маппинга оффера.
- CSS-правила `kp-page__logo*` в [KpPage.css](../../../frontend/src/components/KpPage.css)
  убрать (или оставить мёртвыми — предпочтительно убрать).

## Проверка

- Миграция применяется в Docker-postgres (добавлена `companies.logo_url`,
  удалена `offers.logo_url`).
- `tsc --noEmit` в `backend/`.
- `npm run build` во `frontend/`.
- E2E через Docker:
  1. админом загрузить логотип компании в админке → сохранить;
  2. сгенерировать PDF КП пользователя этой компании → в PDF логотип компании;
  3. у компании без логотипа PDF рендерится без картинки (дефолта нет);
  4. создание компании без логотипа → отклоняется (400);
  5. страница КП больше не содержит секции логотипа.

# Телефон компании в колонтитуле + телефон менеджера рядом с почтой

Дата: 2026-06-15

## Цель

1. Добавить телефон компании и выводить его в колонтитуле (footer) PDF КП.
2. Телефон, который менеджер указывает в форме КП (`Offer.phone`), выводить в
   теле КП — там же, где почта менеджера (блок подписи).

## Контекст (как сейчас)

- Колонтитул `buildFooterHtml` ([offerKp.ts](../../../backend/src/templates/offerKp.ts))
  в строке «Тел./факс» использует `offer.phone` — это **телефон менеджера** из
  формы. Это исправляется: footer должен показывать телефон **компании**.
- В теле КП есть `{{MANAGER_NAME}}` и `{{MANAGER_EMAIL}}` (блок `.signature` в
  [offerKp.html](../../../backend/src/templates/offerKp.html)), но телефона
  менеджера нет.

## Решения

- Телефон компании — **необязательное** поле (как адрес/ОГРН; обязателен только
  логотип).
- Телефон менеджера выводится прямо под строкой с email в блоке подписи.

## DB

[schema.prisma](../../../backend/prisma/schema.prisma), модель `Company`:

```prisma
phone String? @db.VarChar(50)
```

Миграция: `cd backend && npx prisma migrate dev --name add_company_phone`.

## Backend

- `toCompanyDto` ([userDto.ts](../../../backend/src/utils/userDto.ts)): добавить
  `phone: company.phone`.
- `CompanySchema` ([schemas.ts](../../../backend/src/docs/schemas.ts)): добавить
  `phone: z.string().nullable()`.
- company-блок в `toOfferDto` ([offers.ts](../../../backend/src/routes/offers.ts)):
  добавить `phone: company.phone`.
- `OfferForRender` ([offerKp.ts](../../../backend/src/templates/offerKp.ts)):
  добавить `company_phone: string | null`.
- `buildFooterHtml`: строка «Тел./факс» берёт `offer.company_phone` вместо
  `offer.phone`. `DEFAULT_FOOTER` без изменений.
- Плейсхолдеры рендера: добавить `MANAGER_PHONE: esc(offer.phone ?? "")`
  (`offer.phone` — телефон менеджера из формы).
- PDF-роут ([offers.ts](../../../backend/src/routes/offers.ts), `/:id/pdf`):
  прокидывать `company_phone: dto.company?.phone ?? null`. Поле `phone: dto.phone`
  (телефон менеджера) сохраняется — теперь оно идёт в тело КП.
- Admin-эндпоинты компаний ([admin.ts](../../../backend/src/routes/admin.ts))
  POST/PATCH `/companies`: принимать `phone` через `trimOrNull` (необязательно).

## Шаблон

[offerKp.html](../../../backend/src/templates/offerKp.html), блок `.signature`:
после `{{MANAGER_EMAIL}}` добавить `<div class="phone">{{MANAGER_PHONE}}</div>`.
В стилях — `.signature .phone { margin-top: 1mm; color: #1a1a1a; }` и
`.signature .phone:empty { display: none; }` (по образцу `.email`).

## Frontend

[AdminCompaniesPage.jsx](../../../frontend/src/components/AdminCompaniesPage.jsx),
`CompanyModal`: добавить необязательное поле «Телефон» (в `form`, `onChange`,
в `body` для create/update). Телефон менеджера в форме КП уже есть — изменений
не требуется.

## Вне scope

- Телефон компании в таблице компаний (не запрашивалось).

## Проверка

- Миграция применяется в Docker-postgres (`companies.phone`).
- `tsc --noEmit` в `backend/`.
- `npm run build` во `frontend/`.
- E2E через Docker:
  1. админом задать телефон компании → сохранить;
  2. сгенерировать PDF КП пользователя этой компании;
  3. в колонтитуле PDF — телефон компании; в теле под именем/почтой менеджера —
     его телефон из формы КП.

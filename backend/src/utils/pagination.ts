/**
 * Утилиты серверной пагинации для списочных эндпоинтов.
 *
 * Контракт ответа единый для всех списков:
 *   { items, total, page, limit, pages }
 *
 * `?all=1` отдаёт весь список одной «страницей» (skip:0, большой take) — нужно,
 * например, дропдауну компаний в форме пользователя, которому требуется полный
 * перечень, а не первые 20.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ALL_TAKE = 100_000;

export type Pagination = { page: number; limit: number; skip: number; take: number };

export const parsePagination = (
  query: Record<string, unknown>,
  defaultLimit = DEFAULT_LIMIT
): Pagination => {
  if (String(query.all) === "1" || String(query.all) === "true") {
    return { page: 1, limit: ALL_TAKE, skip: 0, take: ALL_TAKE };
  }
  const rawPage = parseInt(String(query.page ?? ""), 10);
  const rawLimit = parseInt(String(query.limit ?? ""), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : defaultLimit;
  return { page, limit, skip: (page - 1) * limit, take: limit };
};

export const paginated = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  total,
  page,
  limit,
  pages: Math.max(1, Math.ceil(total / limit)),
});

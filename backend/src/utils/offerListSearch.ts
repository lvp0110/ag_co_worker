import type { Prisma } from "@prisma/client";

/**
 * Нормализует фильтр даты к возможным значениям kp_date в БД
 * («дд.мм.гггг» или «гггг-мм-дд»).
 * Принимает ISO из `<input type="date">` или уже «дд.мм.гггг».
 */
export function normalizeDateFilter(date: unknown): string[] | null {
  const raw = typeof date === "string" ? date.trim() : "";
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return [`${yyyy}-${mm}-${dd}`, `${dd}.${mm}.${yyyy}`];
  }

  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (dotted) {
    const [, dd, mm, yyyy] = dotted;
    return [`${yyyy}-${mm}-${dd}`, `${dd}.${mm}.${yyyy}`];
  }

  return null;
}

type OffersListFilters = {
  q?: unknown;
  date?: unknown;
};

/** WHERE для списка КП: свои офферы + поиск по объекту/document_id и фильтр по дате. */
export function buildOffersListWhere(
  userId: string,
  filters: OffersListFilters = {}
): Prisma.OfferWhereInput {
  const where: Prisma.OfferWhereInput = { userId };
  const and: Prisma.OfferWhereInput[] = [];

  const query = typeof filters.q === "string" ? filters.q.trim() : "";
  if (query) {
    const or: Prisma.OfferWhereInput[] = [
      { objectName: { contains: query, mode: "insensitive" } },
    ];
    // document_id = Offer.id (UUID): точное совпадение при полном id в запросе
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        query
      )
    ) {
      or.push({ id: query });
    }
    and.push({ OR: or });
  }

  const dateVariants = normalizeDateFilter(filters.date);
  if (dateVariants) {
    and.push({ kpDate: { in: dateVariants } });
  }

  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

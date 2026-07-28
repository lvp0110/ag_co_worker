import "./Pagination.css";

/**
 * Контролы серверной пагинации: «‹ 1 2 … N ›» + текст «X–Y из Z».
 *
 * props:
 *   page    — текущая страница (1-based)
 *   pages   — всего страниц
 *   total   — всего записей
 *   limit   — размер страницы
 *   onChange(nextPage) — переход на страницу
 *
 * Не рендерится, если страница всего одна (total ≤ limit).
 */

/** Номера страниц с многоточиями: всегда первая/последняя + соседи текущей. */
function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = new Set([1, pages, page, page - 1, page + 1]);
  const sorted = [...items].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push(`gap-${p}`);
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({ page, pages, total, limit, onChange }) {
  if (!pages || pages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const go = (p) => {
    if (p < 1 || p > pages || p === page) return;
    onChange(p);
  };

  return (
    <nav className="pagination" aria-label="Пагинация">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label="Предыдущая страница"
      >
        ‹
      </button>
      {pageItems(page, pages).map((item) =>
        typeof item === "number" ? (
          <button
            key={item}
            type="button"
            className={`pagination__btn pagination__btn--page${
              item === page ? " pagination__btn--active" : ""
            }`}
            onClick={() => go(item)}
            aria-current={item === page ? "page" : undefined}
          >
            {item}
          </button>
        ) : (
          <span key={item} className="pagination__gap" aria-hidden="true">
            …
          </span>
        )
      )}
      <button
        type="button"
        className="pagination__btn"
        onClick={() => go(page + 1)}
        disabled={page >= pages}
        aria-label="Следующая страница"
      >
        ›
      </button>
      <span className="pagination__info">
        {from}–{to} из {total}
      </span>
    </nav>
  );
}

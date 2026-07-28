function normalizeSearchToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isArticleQuery(value) {
  const query = String(value ?? "").trim();
  if (!query) return false;
  // Артикул считаем запросом без букв: цифры + разделители.
  return !/[\p{L}]/u.test(query) && /[\p{N}]/u.test(query);
}

function matchesArticleSearch(row, query) {
  const q = String(query ?? "").trim().toLowerCase();
  const article = String(row?.article ?? "").toLowerCase();
  const normalizedQuery = normalizeSearchToken(q);
  if (!normalizedQuery) return false;
  if (article.includes(q)) return true;
  const normalizedArticle = normalizeSearchToken(article);
  return normalizedArticle.includes(normalizedQuery);
}

function matchesNameSearch(row, query) {
  const q = String(query ?? "").trim().toLowerCase();
  const name = String(row?.name ?? "").toLowerCase();
  const normalizedQuery = normalizeSearchToken(q);
  if (!normalizedQuery) return false;
  if (name.includes(q)) return true;
  const normalizedName = normalizeSearchToken(name);
  return normalizedName.includes(normalizedQuery);
}

export function matchesPriceSearch(row, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  if (isArticleQuery(q)) return matchesArticleSearch(row, q);
  return matchesNameSearch(row, q);
}

export function isExactPriceSearchMatch(row, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return false;
  const normalizedQuery = normalizeSearchToken(q);
  if (!normalizedQuery) return false;

  const article = String(row?.article ?? "").toLowerCase();
  const name = String(row?.name ?? "").toLowerCase();
  const articleMode = isArticleQuery(q);

  if (articleMode) {
    return normalizeSearchToken(article) === normalizedQuery;
  }
  return normalizeSearchToken(name) === normalizedQuery;
}

function isExactFieldMatch(value, query) {
  return normalizeSearchToken(value) === normalizeSearchToken(query);
}

export function filterPriceRows(rows, query) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const q = String(query ?? "").trim();
  if (!q) return rows;

  const exact = rows.filter(
    (row) => isExactFieldMatch(row?.article, q) || isExactFieldMatch(row?.name, q)
  );
  if (exact.length > 0) return exact;

  let matched;
  if (isArticleQuery(q)) {
    const matchedByArticle = rows.filter((row) => matchesArticleSearch(row, q));
    matched =
      matchedByArticle.length > 0
        ? matchedByArticle
        : rows.filter((row) => matchesNameSearch(row, q));
  } else {
    matched = rows.filter((row) => matchesNameSearch(row, q));
  }

  return matched;
}

export { normalizeSearchToken };

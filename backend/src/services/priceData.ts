import { env } from "../config/env.js";
import { getPriceRegionCoefficient, resolvePriceRegionKey } from "../utils/priceRegion.js";
import { fetchUpstreamCached } from "./upstreamCache.js";

/**
 * Серверный аналог frontend/src/services/priceApi.js — нужен для генерации
 * PDF КП на бэке (фронтовый кэш недоступен). Тянет тот же /api/v2/data через
 * общий upstreamCache, парсит и нормализует строки по тем же ключам-алиасам.
 *
 * Возвращает фабрику `lookup(article)`, которая по артикулу отдаёт цены
 * с учётом региона (regional → msk fallback → базовая).
 */

export type PriceRow = {
  article: string;
  name: string;
  pricePerM2?: number;
  pricePerUnit?: number;
  regionalPrices: Record<string, { pricePerM2?: number; pricePerUnit?: number }>;
};

const CALC_PATH = "/api/v2/data";

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value == null || value === "") return undefined;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
};

const pick = (obj: Record<string, unknown> | null | undefined, keys: string[]): unknown => {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] != null) return obj[key];
  }
  return undefined;
};

const looksLikeRegionalMapKey = (key: string): boolean =>
  /(regions?|регион|pricesByRegion|regionPrices|поРегионам)/i.test(key);

const toRegionPricePair = (
  value: unknown
): { pricePerM2?: number; pricePerUnit?: number } | null => {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") {
    return { pricePerM2: undefined, pricePerUnit: toNumberOrUndefined(value) };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const pricePerM2 = toNumberOrUndefined(
    pick(obj, ["pricePerM2", "m2", "price_m2", "priceM2", "priceM2Rub", "price_m2_rub", "ЦенаЗаМ2", "sqm"])
  );
  const pricePerUnit = toNumberOrUndefined(
    pick(obj, ["pricePerUnit", "perUnit", "price_unit", "priceUnit", "price", "Price", "unitPrice", "ЦенаЗаЕд"])
  );
  if (pricePerM2 == null && pricePerUnit == null) return null;
  return { pricePerM2, pricePerUnit };
};

const extractRegionalPrices = (
  raw: Record<string, unknown>
): Record<string, { pricePerM2?: number; pricePerUnit?: number }> => {
  const regions: Record<string, { pricePerM2?: number; pricePerUnit?: number }> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!looksLikeRegionalMapKey(key)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [regionName, regionValue] of Object.entries(value as Record<string, unknown>)) {
      const name = String(regionName).trim();
      const pair = toRegionPricePair(regionValue);
      if (!name || !pair) continue;
      regions[name] = pair;
    }
  }
  // Flat keys: msk_m2 / msk_price, ural_m2 / ural_price, ...
  for (const [key, value] of Object.entries(raw)) {
    const m = /^([a-z0-9_]+)_(m2|price)$/i.exec(String(key));
    if (!m) continue;
    const region = String(m[1]).trim();
    if (!region) continue;
    const num = toNumberOrUndefined(value);
    if (num == null) continue;
    const metric = m[2].toLowerCase();
    const current = regions[region] ?? { pricePerM2: undefined, pricePerUnit: undefined };
    if (metric === "m2") current.pricePerM2 = num;
    if (metric === "price") current.pricePerUnit = num;
    regions[region] = current;
  }
  return regions;
};

const normalizeRow = (raw: unknown): PriceRow | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const articleRaw = pick(obj, ["article", "Article", "code", "Code", "Артикул"]);
  const articleFromApi = pick(obj, ["articulus", "Articulus"]);
  const articleSource = articleRaw ?? articleFromApi;
  const article = articleSource == null ? "" : String(articleSource).trim();
  if (!article) return null;

  const nameRaw = pick(obj, ["name", "Name", "title", "Title", "Наименование"]);
  const name = nameRaw == null ? "" : String(nameRaw);

  let pricePerM2 = toNumberOrUndefined(
    pick(obj, ["pricePerM2", "m2", "price_m2", "ЦенаЗаМ2", "priceM2", "priceM2Rub", "price_m2_rub"])
  );
  let pricePerUnit = toNumberOrUndefined(
    pick(obj, ["pricePerUnit", "perUnit", "price_unit", "ЦенаЗаЕд", "priceUnit", "price", "Price", "unitPrice"])
  );
  const regionalPrices = extractRegionalPrices(obj);
  if (pricePerM2 == null && regionalPrices.msk?.pricePerM2 != null) {
    pricePerM2 = regionalPrices.msk.pricePerM2;
  }
  if (pricePerUnit == null && regionalPrices.msk?.pricePerUnit != null) {
    pricePerUnit = regionalPrices.msk.pricePerUnit;
  }

  return { article, name, pricePerM2, pricePerUnit, regionalPrices };
};

const collectRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.data)) return p.data;
    if (Array.isArray(p.items)) return p.items;
    // { "Москва": [rows], "СПб": [rows] } — приводим к плоскому виду без регионального обогащения
    // (regionalPrices будут пустые, что для большинства материалов ок: они юзают базовую цену).
    const flat: unknown[] = [];
    for (const value of Object.values(p)) {
      if (Array.isArray(value)) flat.push(...value);
    }
    return flat;
  }
  return [];
};

const storePriceRow = (out: Map<string, PriceRow>, key: string, row: PriceRow): void => {
  out.set(key, row);
  const lower = key.toLowerCase();
  if (lower !== key) out.set(lower, row);
};

const buildByArticle = (rows: PriceRow[]): Map<string, PriceRow> => {
  const out = new Map<string, PriceRow>();
  for (const row of rows) {
    const key = row.article.trim();
    if (!key) continue;
    const existing = out.get(key) ?? out.get(key.toLowerCase());
    if (!existing) {
      storePriceRow(out, key, row);
      continue;
    }
    const merged: PriceRow = {
      ...existing,
      name: row.name && row.name.trim() ? row.name : existing.name,
      pricePerM2: existing.pricePerM2 ?? row.pricePerM2,
      pricePerUnit: existing.pricePerUnit ?? row.pricePerUnit,
      regionalPrices: { ...existing.regionalPrices, ...row.regionalPrices },
    };
    storePriceRow(out, key, merged);
  }
  return out;
};

const fetchPriceRows = async (): Promise<Map<string, PriceRow>> => {
  try {
    const targetBase = env.calcServiceUrl.replace(/\/$/, "");
    const cached = await fetchUpstreamCached("v2/data", async () => {
      const upstream = await fetch(`${targetBase}${CALC_PATH}`, {
        method: "GET",
        headers: { accept: "application/json", origin: targetBase, referer: `${targetBase}/` },
        signal: AbortSignal.timeout(env.calcServiceTimeoutMs),
      });
      const headers: Record<string, string> = {};
      for (const name of ["content-type", "cache-control", "etag", "last-modified"]) {
        const v = upstream.headers.get(name);
        if (v) headers[name] = v;
      }
      const body = upstream.body ? Buffer.from(await upstream.arrayBuffer()) : Buffer.alloc(0);
      return { status: upstream.status, headers, body };
    });

    if (cached.status >= 400 || cached.body.length === 0) return new Map();
    let payload: unknown = null;
    try {
      payload = JSON.parse(cached.body.toString("utf-8"));
    } catch {
      return new Map();
    }
    const raw = collectRows(payload);
    const rows = raw.map(normalizeRow).filter((r): r is PriceRow => r !== null);
    return buildByArticle(rows);
  } catch {
    // Таймаут/сеть dev3 — PDF всё равно соберётся с Name из calc, как на КП без прайса.
    return new Map();
  }
};

const normalizeRegion = (region: string | null | undefined): string =>
  resolvePriceRegionKey(region);

export type PriceLookup = (article: string | null | undefined) => {
  name?: string;
  pricePerM2?: number;
  pricePerUnit?: number;
};

const pickRegionalOrBase = (
  row: PriceRow,
  region: string,
  key: "pricePerM2" | "pricePerUnit"
): number | undefined => {
  if (region) {
    const regional = row.regionalPrices[region]?.[key];
    if (regional != null) return regional;
  }
  const msk = row.regionalPrices.msk?.[key];
  if (msk != null) return msk;
  return row[key];
};

const applyPriceCoefficient = (
  price: number | undefined,
  region: string | null | undefined
): number | undefined => {
  if (price == null) return undefined;
  const coef = getPriceRegionCoefficient(region);
  return coef === 1 ? price : price * coef;
};

/**
 * Загружает прайс и строит замыкание-lookup по артикулу.
 * Регион — slug из offer.region (как фронт его пишет, например "moscow"/"msk").
 */
export const buildPriceLookup = async (
  region: string | null | undefined
): Promise<PriceLookup> => {
  const byArticle = await fetchPriceRows();
  const reg = normalizeRegion(region);
  return (article) => {
    if (article == null || article === "") return {};
    const key = String(article).trim();
    const row = byArticle.get(key) ?? byArticle.get(key.toLowerCase());
    if (!row) return {};
    const pricePerM2 = pickRegionalOrBase(row, reg, "pricePerM2");
    const pricePerUnit = pickRegionalOrBase(row, reg, "pricePerUnit");
    const name = typeof row.name === "string" ? row.name.trim() || undefined : undefined;
    return {
      name,
      pricePerM2: reg === "ural" ? applyPriceCoefficient(pricePerM2, region) : pricePerM2,
      pricePerUnit:
        reg === "ural" ? applyPriceCoefficient(pricePerUnit, region) : pricePerUnit,
    };
  };
};

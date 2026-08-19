import { useEffect, useState } from "react";
import {
  applyDerivedRegionPrices,
  REGION_SELECT_OPTIONS,
} from "../constants/regionSelectOptions.js";
import {
  getPriceRegionBaseId,
  isDirectPriceRegion,
  normalizePriceRegion,
  orderPriceRegions,
} from "./adminApi.js";
import { BASE_URL } from "./apiClient";

/**
 * Прайс: GET /commerce/price-list/{regionCode}
 * Регионы: GET /commerce/regions, иначе GET /admin/commerce/regions
 * (как в админке). Если оба недоступны — ключи из REGION_SELECT_OPTIONS.
 *
 * Список регионов — справочник админки (code + name, включая дочерние).
 * Для дочерних регионов прайс берётся у базового и умножается на
 * price_coefficient: в material_prices своих строк у derived нет.
 */
const COMMERCE_REGIONS_URL = `${BASE_URL}/commerce/regions`;
const ADMIN_COMMERCE_REGIONS_URL = `${BASE_URL}/admin/commerce/regions`;
const commercePriceListUrl = (regionCode) =>
  `${BASE_URL}/commerce/price-list/${encodeURIComponent(regionCode)}`;

/** Bump when normalized row shape / source changes — forces refetch after HMR. */
const NORMALIZE_SCHEMA_VERSION = 5;

const cache = {
  byArticle: new Map(),
  list: [],
  regions: [],
  regionCatalog: [],
  selectedRegion: "",
  loaded: false,
  loadingPromise: null,
  error: null,
  schemaVersion: 0,
  /** Кэш прайса по коду региона, чтобы не дергать API при каждом переключении. */
  listByRegion: new Map(),
};

const invalidatePriceCacheIfStale = () => {
  if (cache.schemaVersion === NORMALIZE_SCHEMA_VERSION) return;
  cache.schemaVersion = NORMALIZE_SCHEMA_VERSION;
  cache.loaded = false;
  cache.list = [];
  cache.byArticle = new Map();
  cache.listByRegion = new Map();
  cache.regionCatalog = [];
  cache.regions = [];
  cache.loadingPromise = null;
  cache.error = null;
};

const DEFAULT_REGION_CANDIDATES = ["msk", "moscow", "москва"];
const REGION_LABELS = {
  msk: "Москва",
  minsk: "Минск",
  kasan: "Казань",
  kazan: "Казань",
  south: "Юг",
  ural: "Урал",
  kasahstan: "Казахстан",
  kazahstan: "Казахстан",
  kazakhstan: "Казахстан",
};

const listeners = new Set();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

const toNumberOrUndefined = (value) => {
  if (value == null || value === "") return undefined;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
};

const normalizeRegionName = (value) => {
  if (value == null) return "";
  return String(value).trim();
};

const unwrapList = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.items)) return body.items;
  return [];
};

const toActiveCatalog = (rows) =>
  orderPriceRegions(rows).filter(
    (row) => row.is_active !== false && normalizeRegionName(row.code)
  );

/** Регионы из селекта городов — fallback, если справочник API недоступен. */
const fallbackRegionCatalog = () => {
  const seen = new Set();
  const rows = [];
  for (const option of REGION_SELECT_OPTIONS) {
    const code = normalizeRegionName(option.regionKey);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    rows.push({
      id: rows.length + 1,
      code,
      name: REGION_LABELS[code.toLowerCase()] || option.label,
      pricing_mode: "direct",
      price_coefficient: 1,
      is_active: true,
    });
  }
  return rows;
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
};

const catalogFromBody = (body) =>
  toActiveCatalog(unwrapList(body).map(normalizePriceRegion).filter(Boolean));

/**
 * Справочник регионов как в админке.
 * Сначала GET /commerce/regions (любой залогиненный), затем admin.
 */
const fetchCommerceRegionCatalog = async () => {
  for (const url of [COMMERCE_REGIONS_URL, ADMIN_COMMERCE_REGIONS_URL]) {
    try {
      const rows = catalogFromBody(await fetchJson(url));
      if (rows.length) return rows;
    } catch {
      // следующий источник
    }
  }
  return null;
};

/**
 * Строка GET /commerce/price-list/{regionCode}
 * → формат, совместимый с PricePage / getPricePerM2.
 */
const normalizeCommercePriceRow = (raw, regionCode) => {
  if (!raw || typeof raw !== "object") return null;
  const article = String(raw.code ?? raw.article ?? "").trim();
  if (!article) return null;

  const pricePerM2 = toNumberOrUndefined(raw.m2 ?? raw.pricePerM2);
  const pricePerUnit = toNumberOrUndefined(
    raw.price ?? raw.pricePerUnit ?? raw.price_unit
  );
  const region = normalizeRegionName(regionCode);
  const name = String(raw.product_name ?? raw.name ?? "").trim();
  const units = String(raw.units ?? "").trim();

  return {
    article,
    name,
    units,
    pricePerM2,
    pricePerUnit,
    regionalPrices: region
      ? { [region]: { pricePerM2, pricePerUnit } }
      : {},
  };
};

const fetchCommercePriceList = async (regionCode) => {
  const region = normalizeRegionName(regionCode);
  if (!region) return [];
  const body = await fetchJson(commercePriceListUrl(region));
  return unwrapList(body)
    .map((row) => normalizeCommercePriceRow(row, region))
    .filter(Boolean);
};

const pickDefaultRegion = (regions) => {
  if (!Array.isArray(regions) || !regions.length) return "";
  const found = regions.find((region) =>
    DEFAULT_REGION_CANDIDATES.includes(String(region).toLowerCase())
  );
  return found ?? regions[0] ?? "";
};

const applyCatalogToCache = (catalog) => {
  const rows = Array.isArray(catalog) ? catalog : [];
  cache.regionCatalog = [...rows];
  cache.regions = rows.map((row) => row.code);
  if (!cache.regions.includes(cache.selectedRegion)) {
    cache.selectedRegion = pickDefaultRegion(cache.regions);
  }
};

const applyRowsToCache = (rows) => {
  cache.list = rows;
  cache.byArticle = new Map(rows.map((row) => [row.article, row]));
  cache.loaded = true;
  cache.error = null;
};

const pickRegionalOrBasePrice = (row, selectedRegion, key) => {
  if (!row) return undefined;
  const region = normalizeRegionName(selectedRegion);
  const regional = region ? row.regionalPrices?.[region]?.[key] : undefined;
  if (regional != null) return regional;
  if (row[key] != null) return row[key];
  const mskFallback = row.regionalPrices?.msk?.[key];
  if (mskFallback != null) return mskFallback;
  return undefined;
};

const findCatalogRegion = (regionCode) => {
  const needle = normalizeRegionName(regionCode).toLowerCase();
  if (!needle) return null;
  return (
    cache.regionCatalog.find(
      (row) => String(row.code).toLowerCase() === needle
    ) ?? null
  );
};

/** Дочерний регион: прайс базового × коэффициент из админки. */
const resolvePriceListSource = (regionCode) => {
  const row = findCatalogRegion(regionCode);
  if (!row || isDirectPriceRegion(row)) {
    return { fetchCode: regionCode, coefficient: 1 };
  }
  const baseId = getPriceRegionBaseId(row);
  const baseFromCatalog = baseId
    ? cache.regionCatalog.find((item) => item.id === baseId)
    : null;
  const baseCode = normalizeRegionName(
    row.base_region_code || row.base_region?.code || baseFromCatalog?.code
  );
  return {
    fetchCode: baseCode || regionCode,
    coefficient: Number(row.price_coefficient) || 1,
  };
};

const loadPriceListForRegion = async (regionCode) => {
  const region = normalizeRegionName(regionCode);
  if (!region) {
    applyRowsToCache([]);
    return;
  }

  if (cache.listByRegion.has(region)) {
    applyRowsToCache(cache.listByRegion.get(region));
    return;
  }

  const source = resolvePriceListSource(region);
  let sourceRows;
  if (cache.listByRegion.has(source.fetchCode)) {
    sourceRows = cache.listByRegion.get(source.fetchCode);
  } else {
    sourceRows = await fetchCommercePriceList(source.fetchCode);
    cache.listByRegion.set(source.fetchCode, sourceRows);
  }

  const rows =
    source.fetchCode === region
      ? sourceRows
      : applyDerivedRegionPrices(sourceRows, {
          regionCode: region,
          coefficient: source.coefficient,
        });

  cache.listByRegion.set(region, rows);
  applyRowsToCache(rows);
};

/**
 * Загрузка регионов + прайса для текущего/дефолтного региона.
 * @param {{ forceRegion?: string }} [options]
 */
export const ensurePriceDataLoaded = async (options = {}) => {
  invalidatePriceCacheIfStale();

  const forceRegion = normalizeRegionName(options.forceRegion);
  if (forceRegion) {
    cache.selectedRegion = forceRegion;
  }

  const regionReady =
    cache.selectedRegion && cache.listByRegion.has(cache.selectedRegion);

  if (!forceRegion && regionReady && cache.regionCatalog.length > 0) {
    if (!cache.loaded) {
      applyRowsToCache(cache.listByRegion.get(cache.selectedRegion));
      notifyListeners();
    }
    return;
  }

  if (cache.loadingPromise) {
    await cache.loadingPromise;
    if (
      cache.selectedRegion &&
      cache.listByRegion.has(cache.selectedRegion)
    ) {
      return;
    }
  }

  cache.loadingPromise = (async () => {
    try {
      if (!cache.regionCatalog.length) {
        const fromApi = await fetchCommerceRegionCatalog();
        applyCatalogToCache(fromApi?.length ? fromApi : fallbackRegionCatalog());
      }

      if (!cache.selectedRegion || !cache.regions.includes(cache.selectedRegion)) {
        cache.selectedRegion = pickDefaultRegion(cache.regions);
      }

      await loadPriceListForRegion(cache.selectedRegion);
    } catch (error) {
      cache.error = error instanceof Error ? error.message : "unknown error";
      cache.loaded = true;
      cache.list = [];
      cache.byArticle = new Map();
    } finally {
      cache.loadingPromise = null;
      notifyListeners();
    }
  })();

  await cache.loadingPromise;
};

export const subscribePriceData = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getPricePerM2 = (article) => {
  if (article == null || article === "") return undefined;
  const key = String(article).trim();
  const row = cache.byArticle.get(key);
  return pickRegionalOrBasePrice(row, cache.selectedRegion, "pricePerM2");
};

export const getPricePerUnit = (article) => {
  if (article == null || article === "") return undefined;
  const key = String(article).trim();
  const row = cache.byArticle.get(key);
  return pickRegionalOrBasePrice(row, cache.selectedRegion, "pricePerUnit");
};

export const getPriceName = (article) => {
  if (article == null || article === "") return "";
  const key = String(article).trim();
  const row = cache.byArticle.get(key);
  if (!row) return "";
  return row.name == null ? "" : String(row.name).trim();
};

export const getRegionLabel = (region) => {
  const code = normalizeRegionName(region);
  if (!code) return "";
  const fromCatalog = cache.regionCatalog.find(
    (row) => String(row.code).toLowerCase() === code.toLowerCase()
  );
  if (fromCatalog?.name) return fromCatalog.name;
  return REGION_LABELS[code.toLowerCase()] ?? code;
};

export const setPriceRegion = (region) => {
  const nextRegion = normalizeRegionName(region);
  if (!nextRegion || nextRegion === cache.selectedRegion) return;
  if (cache.regions.length > 0 && !cache.regions.includes(nextRegion)) {
    return;
  }
  cache.selectedRegion = nextRegion;
  cache.loaded = false;
  cache.error = null;
  notifyListeners();
  void ensurePriceDataLoaded({ forceRegion: cache.selectedRegion });
};

export const getPriceState = () => ({
  loaded: cache.loaded,
  loading: Boolean(cache.loadingPromise),
  error: cache.error,
  list: cache.list,
  regions: cache.regions,
  regionCatalog: cache.regionCatalog,
  selectedRegion: cache.selectedRegion,
});

export const usePriceData = () => {
  const [state, setState] = useState(getPriceState);

  useEffect(() => {
    const unsubscribe = subscribePriceData(() => {
      setState(getPriceState());
    });

    ensurePriceDataLoaded();

    return unsubscribe;
  }, []);

  return state;
};

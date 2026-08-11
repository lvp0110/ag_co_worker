import { useEffect, useState } from "react";
import {
  REGION_SELECT_OPTIONS,
  findRegionOptionByValue,
  getPriceCoefficient,
} from "../constants/regionSelectOptions.js";
import { BASE_URL } from "./apiClient";

/**
 * Прайс: GET /commerce/price-list/{regionCode}
 * Регионы: GET /admin/commerce/regions (если недоступно — ключи из REGION_SELECT_OPTIONS).
 *
 * Раньше регионы вытаскивались из полей /api/v2/data; теперь список регионов
 * отдельный, а прайс грузится по выбранному regionCode.
 */
const COMMERCE_REGIONS_URL = `${BASE_URL}/admin/commerce/regions`;
const commercePriceListUrl = (regionCode) =>
  `${BASE_URL}/commerce/price-list/${encodeURIComponent(regionCode)}`;

/** Bump when normalized row shape / source changes — forces refetch after HMR. */
const NORMALIZE_SCHEMA_VERSION = 3;

const cache = {
  byArticle: new Map(),
  list: [],
  regions: [],
  selectedRegion: "",
  /** Slug города (moscow, kazan, …) — совпадает с form.region на КП и селектом прайса. */
  selectedCityRegion: "",
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
const HIDDEN_REGION_KEYS = new Set([
  "minsk",
  "минск",
  "kasahstan",
  "kazahstan",
  "kazakhstan",
  "казахстан",
]);

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

const shouldHideRegion = (region) => {
  const normalized = normalizeRegionName(region).toLowerCase();
  if (!normalized) return false;
  const mappedLabel = REGION_LABELS[normalized]?.toLowerCase();
  return HIDDEN_REGION_KEYS.has(normalized) || HIDDEN_REGION_KEYS.has(mappedLabel);
};

const unwrapList = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.items)) return body.items;
  return [];
};

/** Регионы из селекта городов — fallback, если /admin/commerce/regions недоступен. */
const fallbackRegionCodes = () => {
  const codes = new Set();
  for (const option of REGION_SELECT_OPTIONS) {
    const code = normalizeRegionName(option.regionKey);
    if (code && !shouldHideRegion(code)) codes.add(code);
  }
  return [...codes];
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

/**
 * GET /admin/commerce/regions → коды активных регионов.
 * Без прав admin возвращает null (вызывающий использует fallback).
 */
const fetchCommerceRegionCodes = async () => {
  try {
    const body = await fetchJson(COMMERCE_REGIONS_URL);
    const codes = unwrapList(body)
      .filter((row) => row && row.is_active !== false)
      .map((row) => normalizeRegionName(row.code))
      .filter((code) => code && !shouldHideRegion(code));
    return codes.length ? [...new Set(codes)] : null;
  } catch {
    return null;
  }
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

const applyRowsToCache = (rows, regions) => {
  cache.list = rows;
  cache.byArticle = new Map(rows.map((row) => [row.article, row]));
  if (Array.isArray(regions) && regions.length) {
    cache.regions = [...regions];
  }
  if (!cache.regions.includes(cache.selectedRegion)) {
    cache.selectedRegion = pickDefaultRegion(cache.regions);
  }
  cache.loaded = true;
  cache.error = null;
};

const applyPriceCoefficient = (price, cityValue) => {
  if (price == null) return undefined;
  const coef = getPriceCoefficient(cityValue ?? cache.selectedCityRegion);
  return coef === 1 ? price : price * coef;
};

const pickRegionalOrBasePrice = (row, selectedRegion, key) => {
  if (!row) return undefined;
  const region = normalizeRegionName(selectedRegion);
  const regional = region ? row.regionalPrices?.[region]?.[key] : undefined;
  if (regional != null) {
    return region === "ural" ? applyPriceCoefficient(regional) : regional;
  }
  const mskFallback = row.regionalPrices?.msk?.[key];
  if (mskFallback != null) return mskFallback;
  return row[key];
};

const loadPriceListForRegion = async (regionCode) => {
  const region = normalizeRegionName(regionCode);
  if (!region) {
    applyRowsToCache([], cache.regions);
    return;
  }

  if (cache.listByRegion.has(region)) {
    applyRowsToCache(cache.listByRegion.get(region), cache.regions);
    return;
  }

  const rows = await fetchCommercePriceList(region);
  cache.listByRegion.set(region, rows);
  applyRowsToCache(rows, cache.regions);
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

  if (!forceRegion && regionReady && cache.regions.length > 0) {
    if (!cache.loaded) {
      applyRowsToCache(
        cache.listByRegion.get(cache.selectedRegion),
        cache.regions
      );
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
      if (!cache.regions.length) {
        const fromApi = await fetchCommerceRegionCodes();
        cache.regions = fromApi?.length ? fromApi : fallbackRegionCodes();
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
  const normalized = normalizeRegionName(region).toLowerCase();
  return REGION_LABELS[normalized] ?? normalizeRegionName(region);
};

export const setPriceRegion = (region, { cityValue } = {}) => {
  const nextRegion = normalizeRegionName(region);
  let cityChanged = false;
  let regionChanged = false;

  if (cityValue != null && cityValue !== "") {
    const cityOption = findRegionOptionByValue(cityValue);
    if (cityOption && cache.selectedCityRegion !== cityOption.value) {
      cache.selectedCityRegion = cityOption.value;
      cityChanged = true;
    }
  }

  if (nextRegion && nextRegion !== cache.selectedRegion) {
    if (cache.regions.length > 0 && !cache.regions.includes(nextRegion)) {
      if (cityChanged) notifyListeners();
      return;
    }
    cache.selectedRegion = nextRegion;
    regionChanged = true;
  }

  if (regionChanged) {
    cache.loaded = false;
    cache.error = null;
    notifyListeners();
    void ensurePriceDataLoaded({ forceRegion: cache.selectedRegion });
    return;
  }

  if (cityChanged) notifyListeners();
};

export const getPriceState = () => ({
  loaded: cache.loaded,
  loading: Boolean(cache.loadingPromise),
  error: cache.error,
  list: cache.list,
  regions: cache.regions,
  selectedRegion: cache.selectedRegion,
  selectedCityRegion: cache.selectedCityRegion,
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

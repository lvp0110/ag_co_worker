import { useEffect, useState } from "react";
import {
  findRegionOptionByValue,
  getPriceCoefficient,
} from "../constants/regionSelectOptions.js";
import { BASE_URL } from "./apiClient";

const PRICE_API_URL = `${BASE_URL}/api/v2/data`;
/** Bump when normalized row shape changes — forces refetch after HMR without full reload. */
const NORMALIZE_SCHEMA_VERSION = 2;

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
};

const invalidatePriceCacheIfStale = () => {
  if (cache.schemaVersion === NORMALIZE_SCHEMA_VERSION) return;
  cache.schemaVersion = NORMALIZE_SCHEMA_VERSION;
  cache.loaded = false;
  cache.list = [];
  cache.byArticle = new Map();
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

const pick = (obj, keys) => {
  for (const key of keys) {
    if (obj?.[key] != null) return obj[key];
  }
  return undefined;
};

const normalizeRow = (raw) => {
  const articleRaw = pick(raw, ["article", "Article", "code", "Code", "Артикул"]);
  const articleFromApi = pick(raw, ["articulus", "Articulus"]);
  const articleSource = articleRaw ?? articleFromApi;
  const article =
    articleSource == null || String(articleSource).trim() === ""
      ? undefined
      : String(articleSource).trim();
  if (!article) return null;

  const name = pick(raw, ["name", "Name", "title", "Title", "Наименование"]);
  const unitsRaw = pick(raw, ["units", "Units", "unit", "Unit", "ЕдИзм", "Ед.изм."]);
  const units =
    unitsRaw == null || String(unitsRaw).trim() === ""
      ? ""
      : String(unitsRaw).trim();
  let pricePerM2 = toNumberOrUndefined(
    pick(raw, [
      "pricePerM2",
      "m2",
      "price_m2",
      "ЦенаЗаМ2",
      "priceM2",
      "priceM2Rub",
      "price_m2_rub",
    ])
  );
  let pricePerUnit = toNumberOrUndefined(
    pick(raw, [
      "pricePerUnit",
      "perUnit",
      "price_unit",
      "ЦенаЗаЕд",
      "priceUnit",
      "price",
      "Price",
      "unitPrice",
    ])
  );

  const regionalPrices = extractRegionalPrices(raw);
  if (pricePerM2 == null && regionalPrices.msk?.pricePerM2 != null) {
    pricePerM2 = regionalPrices.msk.pricePerM2;
  }
  if (pricePerUnit == null && regionalPrices.msk?.pricePerUnit != null) {
    pricePerUnit = regionalPrices.msk.pricePerUnit;
  }

  return {
    article,
    name: name == null ? "" : String(name),
    units,
    pricePerM2,
    pricePerUnit,
    regionalPrices,
  };
};

const normalizePayload = (payload) => {
  const rows = collectRows(payload);
  const normalizedRows = rows.map(normalizeRow).filter(Boolean);
  const mergedByArticle = new Map();

  normalizedRows.forEach((row) => {
    const articleKey = String(row.article).trim().toLowerCase();
    const existing = mergedByArticle.get(articleKey);
    if (!existing) {
      mergedByArticle.set(articleKey, row);
      return;
    }

    mergedByArticle.set(articleKey, {
      ...existing,
      // Если в более поздней строке есть заполненное имя, используем его.
      name: row.name?.trim() ? row.name : existing.name,
      units: row.units?.trim() ? row.units : existing.units,
      // Сохраняем первую валидную базовую цену, а при отсутствии берём из дубля.
      pricePerM2: existing.pricePerM2 ?? row.pricePerM2,
      pricePerUnit: existing.pricePerUnit ?? row.pricePerUnit,
      // Объединяем региональные цены из всех дублей.
      regionalPrices: {
        ...(existing.regionalPrices ?? {}),
        ...(row.regionalPrices ?? {}),
      },
    });
  });

  return [...mergedByArticle.values()];
};

const applyRowsToCache = (rows) => {
  cache.list = rows;
  cache.byArticle = new Map(rows.map((row) => [row.article, row]));
  const regionsFromRows = new Set();
  rows.forEach((row) => {
    Object.keys(row.regionalPrices ?? {}).forEach((region) => {
      const normalized = normalizeRegionName(region);
      if (normalized && !shouldHideRegion(normalized)) regionsFromRows.add(normalized);
    });
  });
  cache.regions = [...regionsFromRows].sort((a, b) =>
    a.localeCompare(b, "ru-RU")
  );
  if (!cache.regions.includes(cache.selectedRegion)) {
    cache.selectedRegion =
      cache.regions.find((region) =>
        DEFAULT_REGION_CANDIDATES.includes(region.toLowerCase())
      ) ??
      cache.regions[0] ??
      "";
  }
  cache.loaded = true;
  cache.error = null;
};

const toRegionPricePair = (value) => {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") {
    return {
      pricePerM2: undefined,
      pricePerUnit: toNumberOrUndefined(value),
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const pricePerM2 = toNumberOrUndefined(
    pick(value, [
      "pricePerM2",
      "m2",
      "price_m2",
      "priceM2",
      "priceM2Rub",
      "price_m2_rub",
      "ЦенаЗаМ2",
      "sqm",
    ])
  );
  const pricePerUnit = toNumberOrUndefined(
    pick(value, [
      "pricePerUnit",
      "perUnit",
      "price_unit",
      "priceUnit",
      "price",
      "Price",
      "unitPrice",
      "ЦенаЗаЕд",
    ])
  );
  if (pricePerM2 == null && pricePerUnit == null) return null;
  return { pricePerM2, pricePerUnit };
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

const looksLikeRegionalMapKey = (key) =>
  /(regions?|регион|pricesByRegion|regionPrices|поРегионам)/i.test(key);

const extractRegionalPrices = (raw) => {
  if (!raw || typeof raw !== "object") return {};
  const regions = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!looksLikeRegionalMapKey(key)) return;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    Object.entries(value).forEach(([regionName, regionValue]) => {
      const normalizedName = normalizeRegionName(regionName);
      const pair = toRegionPricePair(regionValue);
      if (!normalizedName || !pair) return;
      regions[normalizedName] = pair;
    });
  });

  // Flat API shape: msk_m2, msk_price, ural_m2, ural_price, ...
  Object.entries(raw).forEach(([key, value]) => {
    const match = /^([a-z0-9_]+)_(m2|price)$/i.exec(String(key));
    if (!match) return;
    const [, rawRegion, rawMetric] = match;
    const region = normalizeRegionName(rawRegion);
    if (!region) return;
    const numValue = toNumberOrUndefined(value);
    if (numValue == null) return;
    const metric = rawMetric.toLowerCase();
    const current = regions[region] ?? {
      pricePerM2: undefined,
      pricePerUnit: undefined,
    };
    if (metric === "m2") current.pricePerM2 = numValue;
    if (metric === "price") current.pricePerUnit = numValue;
    regions[region] = current;
  });

  return regions;
};

const collectRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (!payload || typeof payload !== "object") return [];

  // Fallback for payload shape: { "Москва": [rows], "СПб": [rows] }.
  const groupedRows = [];
  Object.entries(payload).forEach(([regionName, value]) => {
    if (!Array.isArray(value)) return;
    const normalizedRegion = normalizeRegionName(regionName);
    value.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const currentRegions =
        row.regionalPrices && typeof row.regionalPrices === "object"
          ? row.regionalPrices
          : {};
      groupedRows.push({
        ...row,
        regionalPrices: {
          ...currentRegions,
          ...(normalizedRegion
            ? { [normalizedRegion]: toRegionPricePair(row) ?? {} }
            : {}),
        },
      });
    });
  });
  return groupedRows;
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

export const ensurePriceDataLoaded = async () => {
  invalidatePriceCacheIfStale();
  if (cache.loaded && cache.list.length > 0) return;
  if (cache.loadingPromise) {
    await cache.loadingPromise;
    return;
  }

  if (cache.loaded && cache.list.length === 0) {
    cache.loaded = false;
    cache.error = null;
  }

  cache.loadingPromise = (async () => {
    try {
      const response = await fetch(PRICE_API_URL, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const rows = normalizePayload(payload);
      applyRowsToCache(rows);
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
  let changed = false;

  if (cityValue != null && cityValue !== "") {
    const cityOption = findRegionOptionByValue(cityValue);
    if (cityOption && cache.selectedCityRegion !== cityOption.value) {
      cache.selectedCityRegion = cityOption.value;
      changed = true;
    }
  }

  if (!cache.regions.includes(nextRegion)) {
    if (changed) notifyListeners();
    return;
  }

  if (nextRegion !== cache.selectedRegion) {
    cache.selectedRegion = nextRegion;
    changed = true;
  }

  if (!changed) return;
  notifyListeners();
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

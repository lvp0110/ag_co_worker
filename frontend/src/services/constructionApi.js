/**
 * API сервис для расчета конструкций
 */

import { BASE_URL, request } from "./apiClient";
import { getPriceState } from "./priceApi.js";
import { useCalculatorStore } from "../stores/calculatorStore.js";
import {
  SOUND_CONSTRUCTION_CATEGORY,
  extractCalcProducts,
  unwrapApiData,
} from "../utils/isolationCalcV2.js";
import {
  ecoSWoolFallbackCalcCode,
  isEcoSWoolCalcCode,
  isUlTapeCalcCode,
  isUltracousticFloorSealant,
  mapDefaultEcoWoolToEcoS,
  mapVibrosilSealantToUltracoustic,
  mapVibrostekMaterialsToUlTape,
  ulTapeFallbackCalcCodes,
} from "../utils/calcUlTapeFallback.js";

export const calculateConstruction = async (constrList) => {
  if (!constrList || constrList.length === 0) {
    return { data: [] };
  }

  const apiUrl = `${BASE_URL}/api/v1/calcIsolation/byProduct`;

  const payload = JSON.stringify(constrList);
  if (import.meta.env.DEV) {
    console.log(
      `[calc] POST ${apiUrl} → ${constrList.length} constr:`,
      JSON.parse(payload),
    );
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: payload,
    credentials: "include",
  });

  let rows;
  if (!response.ok) {
    let errorText = "";
    try {
      const clonedResponse = response.clone();
      const errorData = await clonedResponse.json();
      errorText =
        errorData.error || errorData.message || JSON.stringify(errorData);
    } catch {
      try {
        const clonedResponse = response.clone();
        errorText = await clonedResponse.text();
      } catch {
        errorText = `HTTP ${response.status}: ${response.statusText}`;
      }
    }

    let errorMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorText;
    } catch {
      // Если не JSON, используем как есть
    }

    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorMessage}`
    );
  }

  const data = await response.json();

  if (data && data.data) {
    rows = data.data;
  } else if (Array.isArray(data)) {
    rows = data;
  } else {
    rows = [];
  }

  // Внешний calc пока не знает *_ul_tape (пустой data при HTTP 200).
  if (
    rows.length === 0 &&
    constrList.length === 1 &&
    isUlTapeCalcCode(constrList[0]?.Code)
  ) {
    for (const fallbackCode of ulTapeFallbackCalcCodes(constrList[0].Code)) {
      const fallbackPayload = constrList.map((item) => ({
        ...item,
        Code: fallbackCode,
      }));
      const fallback = await calculateConstruction(fallbackPayload);
      const mapped = mapVibrostekMaterialsToUlTape(fallback?.data ?? []);
      if (mapped?.length) {
        return { data: mapped };
      }
    }
  }

  // Внешний calc пока не знает *_eco_s (пустой data при HTTP 200).
  if (
    rows.length === 0 &&
    constrList.length === 1 &&
    isEcoSWoolCalcCode(constrList[0]?.Code)
  ) {
    const fallbackCode = ecoSWoolFallbackCalcCode(constrList[0].Code);
    const fallbackPayload = constrList.map((item) => ({
      ...item,
      Code: fallbackCode,
    }));
    const fallback = await calculateConstruction(fallbackPayload);
    const mapped = mapDefaultEcoWoolToEcoS(fallback?.data ?? []);
    if (mapped?.length) {
      return { data: mapped };
    }
  }

  if (rows.length > 0 && isUltracousticFloorSealant(constrList[0]?.FloorSealant)) {
    const sealantMapped = mapVibrosilSealantToUltracoustic(rows);
    if (sealantMapped?.length) {
      rows = sealantMapped;
    }
  }

  return { data: rows };
};

/**
 * Минимальный объект расчёта для получения перечня материалов (как в калькуляторе, без ввода размеров пользователем).
 * Количества ориентировочные; названия и артикулы совпадают с расчётом.
 */
export const buildMinimalCalcPayloadForMaterialsList = (code) => {
  if (!code) return null;
  const payload = {
    Code: code,
    LenX: 3000,
    LenY: 3000,
    LenZ: 2700,
    AddCeilShift: 0,
    step: 600,
    dframe: false,
    Area: 9,
    Perimeter: 12,
    Openings: [],
  };
  if (code === "AG.L401" || code === "AG.W101" || code === "AG.W105") {
    payload.dframe = true;
  }
  if (code === "AG.F615" || code === "AG.F615_vibroflex_LD") {
    payload.step = 400;
  }
  return payload;
};

/**
 * Список материалов через POST /api/v1/calcIsolation/byProduct (когда v2/props недоступен или пустой).
 */
export const getMaterialsListViaCalc = async (code) => {
  const payload = buildMinimalCalcPayloadForMaterialsList(code);
  if (!payload) return null;
  try {
    const result = await calculateConstruction([payload]);
    const rows = result?.data;
    if (Array.isArray(rows) && rows.length > 0) return rows;
  } catch {
    // часть шифров или размеров может быть отклонена API
  }
  return null;
};

/** Код региона для GET /api/v2/constructions/{category}/{regionCode}/... */
export const resolveConstructionRegionCode = (regionCode) => {
  const fromArg = String(regionCode ?? "").trim();
  if (fromArg) return fromArg;
  const fromStore = String(
    useCalculatorStore.getState().calcRegion || ""
  ).trim();
  if (fromStore) return fromStore;
  return String(getPriceState().selectedRegion || "").trim();
};

/**
 * GET /api/v2/constructions/{category}/{regionCode}
 * swagger: categoryCode + regionCode в path, type — query.
 */
export const listPublicConstructions = async (
  categoryCode = SOUND_CONSTRUCTION_CATEGORY,
  typeCode = "",
  regionCode
) => {
  const region = resolveConstructionRegionCode(regionCode);
  if (!region) return [];
  const params = new URLSearchParams();
  if (typeCode) params.set("type", typeCode);
  const qs = params.toString();
  const path = `${constructionPath(categoryCode, region)}${qs ? `?${qs}` : ""}`;
  const body = await request(path, {}, { silent401: true });
  const data = unwrapApiData(body);
  return Array.isArray(data) ? data : [];
};

const constructionPath = (categoryCode, regionCode, code = "", suffix = "") => {
  const category = encodeURIComponent(categoryCode || SOUND_CONSTRUCTION_CATEGORY);
  const region = encodeURIComponent(regionCode);
  if (!code) return `/api/v2/constructions/${category}/${region}`;
  const constr = encodeURIComponent(code);
  return `/api/v2/constructions/${category}/${region}/${constr}${suffix}`;
};

/** GET /api/v2/constructions/{category}/{region}/{code}/calculation-params */
export const getConstructionCalculationParams = async (
  code,
  categoryCode = SOUND_CONSTRUCTION_CATEGORY,
  regionCode
) => {
  if (!code) return { construction_code: "", params: [], size_limits: [] };
  const region = resolveConstructionRegionCode(regionCode);
  if (!region) {
    return { construction_code: code, params: [], size_limits: [] };
  }
  const body = await request(
    constructionPath(categoryCode, region, code, "/calculation-params"),
    {},
    { allowNotFound: true, silent401: true }
  );
  return (
    unwrapApiData(body) || {
      construction_code: code,
      params: [],
      size_limits: [],
    }
  );
};

const publicConstructionCache = new Map();

/** GET /api/v2/constructions/{category}/{region}/{code} — состав и группы замены. */
export const getPublicConstruction = async (
  code,
  categoryCode = SOUND_CONSTRUCTION_CATEGORY,
  regionCode
) => {
  if (!code) return null;
  const region = resolveConstructionRegionCode(regionCode);
  if (!region) return null;
  const key = `${categoryCode}:${region}:${code}`;
  if (publicConstructionCache.has(key)) {
    return publicConstructionCache.get(key);
  }
  const body = await request(
    constructionPath(categoryCode, region, code),
    {},
    { allowNotFound: true, silent401: true }
  );
  const data = unwrapApiData(body);
  publicConstructionCache.set(key, data);
  return data;
};

/**
 * POST /api/v2/calculations/isolation/by-construction/{regionCode}
 * без regionCode — тот же путь без региона (материалы без цен).
 * @param {object[]} items IsolationCalculationRequestItem[]
 * @param {string} [regionCode]
 */
export const calculateIsolationByConstruction = async (items, regionCode) => {
  if (!items || items.length === 0) return { data: [] };
  const region = String(regionCode ?? "").trim();
  const path = region
    ? `/api/v2/calculations/isolation/by-construction/${encodeURIComponent(region)}`
    : "/api/v2/calculations/isolation/by-construction";
  const body = await request(path, {
    method: "POST",
    body: items,
  });
  const products = extractCalcProducts(body);
  return { data: products, raw: body };
};

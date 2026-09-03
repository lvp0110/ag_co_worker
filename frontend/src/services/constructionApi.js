/**
 * API-сервис расчёта конструкций.
 *
 * Основной путь — v2: `calculateIsolationByConstruction`
 * (`POST /api/v2/calculations/isolation/by-construction`). Его использует
 * калькулятор и пересчёт при загрузке КП; параметры, замены и опциональные
 * материалы сервер берёт из данных админки.
 *
 * LEGACY (v1): `calculateConstruction` + `getMaterialsListViaCalc`
 * (`POST /api/v1/calcIsolation/byProduct`) остались ТОЛЬКО как третий фолбэк
 * материалов на странице «Инфо» (см. `api.js:loadInfoPageMaterialsList`).
 * Размеры там фиктивные, количества ориентировочные. Вся пост-обработка
 * (`*_ul_tape`, `*_eco_s`, герметик) применяется только на этом пути.
 * Удалять v1 можно только после того, как состав конструкций будет заполнен в
 * БД (`construction_materials`, `construction_optional_materials`) — иначе
 * «Инфо» останется без материалов.
 */

import { BASE_URL, request } from "./apiClient";
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
} from "../utils/constructionCiphers.js";

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
 * LEGACY-фолбэк «Инфо»: список материалов через
 * POST /api/v1/calcIsolation/byProduct, когда состав из админки и
 * IsolationConstrMaterials пустые. Размеры — типовые из
 * `buildMinimalCalcPayloadForMaterialsList`, поэтому количества ориентировочные.
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

/** GET /api/v2/constructions/{category} — публичный каталог. */
export const listPublicConstructions = async (
  categoryCode = SOUND_CONSTRUCTION_CATEGORY,
  typeCode = ""
) => {
  const params = new URLSearchParams();
  if (typeCode) params.set("type", typeCode);
  const qs = params.toString();
  const path = `/api/v2/constructions/${encodeURIComponent(
    categoryCode || SOUND_CONSTRUCTION_CATEGORY
  )}${qs ? `?${qs}` : ""}`;
  const body = await request(path, {}, { silent401: true, allowNotFound: true });
  const data = unwrapApiData(body);
  return Array.isArray(data) ? data : [];
};

const constructionPath = (categoryCode, code, suffix = "") => {
  const category = encodeURIComponent(categoryCode || SOUND_CONSTRUCTION_CATEGORY);
  const constr = encodeURIComponent(code);
  return `/api/v2/constructions/${category}/${constr}${suffix}`;
};

/** GET /api/v2/constructions/{category}/{code}/calculation-params — params + size_limits. */
export const getConstructionCalculationParams = async (
  code,
  categoryCode = SOUND_CONSTRUCTION_CATEGORY
) => {
  if (!code) return { construction_code: "", params: [], size_limits: [] };
  const body = await request(
    constructionPath(categoryCode, code, "/calculation-params"),
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

/** GET /api/v2/constructions/{category}/{code} — состав и группы замены. */
export const getPublicConstruction = async (
  code,
  categoryCode = SOUND_CONSTRUCTION_CATEGORY
) => {
  if (!code) return null;
  const key = `${categoryCode}:${code}`;
  if (publicConstructionCache.has(key)) {
    return publicConstructionCache.get(key);
  }
  const body = await request(
    constructionPath(categoryCode, code),
    {},
    { allowNotFound: true, silent401: true }
  );
  const data = unwrapApiData(body);
  publicConstructionCache.set(key, data);
  return data;
};

/**
 * POST /api/v2/calculations/isolation/by-construction
 * @param {object[]} items IsolationCalculationRequestItem[]
 */
export const calculateIsolationByConstruction = async (items) => {
  if (!items || items.length === 0) return { data: [] };
  const body = await request("/api/v2/calculations/isolation/by-construction", {
    method: "POST",
    body: items,
  });
  const products = extractCalcProducts(body);
  return { data: products, raw: body };
};

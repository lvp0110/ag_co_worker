/**
 * API сервис для расчета конструкций
 */

import { BASE_URL } from "./apiClient";
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

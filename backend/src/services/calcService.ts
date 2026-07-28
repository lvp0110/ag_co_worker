import { env } from "../config/env.js";
import {
  AG_CU_MEM_CIPHER,
  buildUlMembraneMaterials,
  ecoSWoolFallbackCalcCode,
  isEcoSWoolCalcCode,
  isUlTapeCalcCode,
  isUltracousticFloorSealant,
  mapDefaultEcoWoolToEcoS,
  mapVibrosilSealantToUltracoustic,
  mapVibrostekMaterialsToUlTape,
  normalizeCeilingMats,
  ulTapeFallbackCalcCodes,
} from "./calcUlTapeFallback.js";
import {
  getCachedCalcMaterials,
  setCachedCalcMaterials,
} from "./calcResultCache.js";

export interface CalcParams {
  Code: string;
  LenX: number;
  LenY: number;
  LenZ: number;
  AddCeilShift: number;
  step: number;
  dframe: boolean;
  Area: number;
  Perimeter: number;
  Openings: Array<{ lenX: number; lenZ: number; Type: string }>;
}

export interface CalcMaterial {
  articul?: string;
  name: string;
  count: number;
  unit: string;
  pricePerSquareMeter?: number;
  pricePerUnit?: number;
}

export class CalcServiceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "CalcServiceError";
  }
}

const CALC_PATH = "/api/v1/calcIsolation/byProduct";

const fetchMaterialsFromCalcService = async (
  params: CalcParams
): Promise<CalcMaterial[]> => {
  const url = `${env.calcServiceUrl.replace(/\/$/, "")}${CALC_PATH}`;

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify([params]),
      signal: AbortSignal.timeout(env.calcServiceTimeoutMs),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `Calc service timeout after ${env.calcServiceTimeoutMs}ms`
        : `Calc service request failed: ${err instanceof Error ? err.message : String(err)}`;
    throw new CalcServiceError(message);
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    throw new CalcServiceError(
      `Calc service responded with ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status
    );
  }

  const payload: unknown = await response.json();
  const raw =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
  return Array.isArray(raw) ? (raw as CalcMaterial[]) : [];
};

/**
 * Вызывает внешний сервис расчёта для ОДНОЙ конструкции.
 * Возвращает плоский массив материалов этой конструкции.
 *
 * `CeilingMats` (AG.Ct_eco / AG.Cs_mat / AG.Cu_mem) — опциональные аддоны
 * для C501–503 / L401–405: считаем основную конструкцию и каждый аддон
 * с теми же размерами, материалы склеиваем. Legacy: `CeilingMat` (строка).
 */
const calculateOne = async (params: CalcParams): Promise<CalcMaterial[]> => {
  const cached = getCachedCalcMaterials(params);
  if (cached) return cached;

  const paramsRec = {
    ...(params as unknown as Record<string, unknown>),
  };
  const ceilingMats = normalizeCeilingMats(
    paramsRec.CeilingMats,
    paramsRec.CeilingMat
  );
  if (ceilingMats.length > 0) {
    delete paramsRec.CeilingMats;
    delete paramsRec.CeilingMat;
    const baseParams = paramsRec as unknown as CalcParams;
    const primary = await calculateOne(baseParams);
    if (primary.length === 0) return [];

    let merged = [...primary];
    for (const matCode of ceilingMats) {
      if (matCode === AG_CU_MEM_CIPHER) {
        const membrane = buildUlMembraneMaterials(baseParams.Area);
        if (membrane.length === 0) {
          throw new CalcServiceError(
            `Could not build materials for ceiling membrane ${matCode}`,
            502
          );
        }
        merged = [...merged, ...(membrane as CalcMaterial[])];
        continue;
      }

      const matMaterials = await calculateOne({
        ...baseParams,
        Code: matCode,
      });
      if (matMaterials.length === 0) {
        throw new CalcServiceError(
          `Calc service returned no materials for ceiling mat ${matCode}`,
          502
        );
      }
      merged = [...merged, ...matMaterials];
    }

    setCachedCalcMaterials(params, merged);
    return merged;
  }

  let materials = await fetchMaterialsFromCalcService(params);

  // Внешний calc пока не знает *_ul_tape — считаем через *_vibrostek (полы) или базовый код (потолки).
  if (materials.length === 0 && isUlTapeCalcCode(params.Code)) {
    for (const fallbackCode of ulTapeFallbackCalcCodes(params.Code)) {
      const fallbackParams = { ...params, Code: fallbackCode };
      const fallbackMaterials = await fetchMaterialsFromCalcService(fallbackParams);
      const mapped = mapVibrostekMaterialsToUlTape(fallbackMaterials);
      if (mapped) {
        materials = mapped as CalcMaterial[];
        break;
      }
    }
  }

  // Внешний calc пока не знает *_eco_s — считаем без суффикса и подменяем минвату.
  if (materials.length === 0 && isEcoSWoolCalcCode(params.Code)) {
    const fallbackParams = {
      ...params,
      Code: ecoSWoolFallbackCalcCode(params.Code),
    };
    const fallbackMaterials = await calculateOne(fallbackParams);
    const woolMapped = mapDefaultEcoWoolToEcoS(fallbackMaterials);
    if (woolMapped) {
      materials = woolMapped as CalcMaterial[];
    }
  }

  const floorSealant = (params as unknown as Record<string, unknown>).FloorSealant;
  if (isUltracousticFloorSealant(floorSealant)) {
    const sealantMapped = mapVibrosilSealantToUltracoustic(materials);
    if (sealantMapped) materials = sealantMapped as CalcMaterial[];
  }

  setCachedCalcMaterials(params, materials);
  return materials;
};

/**
 * Расчёт материалов для нескольких конструкций.
 *
 * Внешний сервис при получении массива из нескольких конструкций возвращает
 * плоский список материалов, потеряв разбивку по конструкциям. Поэтому вызываем
 * его отдельно на каждую конструкцию (так же делает фронтовый Calculator,
 * см. `src/services/constructionApi.js:calculateConstruction([one])`).
 *
 * Возвращает `Material[][]`: индекс i — материалы конструкции i.
 */
export const calculateByProduct = async (
  calcParams: CalcParams[]
): Promise<CalcMaterial[][]> => {
  if (!calcParams || calcParams.length === 0) return [];
  return Promise.all(calcParams.map((p) => calculateOne(p)));
};

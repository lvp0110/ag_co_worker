import type { CalcMaterial, CalcParams } from "./calcService.js";

type Entry = {
  materials: CalcMaterial[];
  expiresAt: number;
};

const store = new Map<string, Entry>();
const MAX_ENTRIES = 128;

const ttlMs = (): number => {
  const raw = process.env.CALC_RESULT_CACHE_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3 * 60 * 1000;
};

const keyFor = (params: CalcParams): string => JSON.stringify(params);

const evictIfNeeded = (): void => {
  if (store.size <= MAX_ENTRIES) return;
  const oldestKey = store.keys().next().value;
  if (oldestKey) store.delete(oldestKey);
};

export const getCachedCalcMaterials = (
  params: CalcParams
): CalcMaterial[] | null => {
  const hit = store.get(keyFor(params));
  if (!hit || hit.expiresAt <= Date.now()) return null;
  // Пустой ответ внешнего calc не кэшируем — для *_ul_tape / *_eco_s срабатывает fallback.
  if (hit.materials.length === 0) return null;
  return hit.materials;
};

export const setCachedCalcMaterials = (
  params: CalcParams,
  materials: CalcMaterial[]
): void => {
  if (materials.length === 0) return;
  store.set(keyFor(params), {
    materials,
    expiresAt: Date.now() + ttlMs(),
  });
  evictIfNeeded();
};

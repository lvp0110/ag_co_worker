import {
  calculateByProduct,
  type CalcMaterial,
  type CalcParams,
} from "./calcService.js";

interface ConstructionRow {
  id: string;
  position: number;
  calcParams: unknown;
  materials: unknown;
}

interface RecalcResult {
  id: string;
  position: number;
  materials: CalcMaterial[];
}

/** Извлекает ключ для матчинга по материалам. Покрывает оба контракта:
 *  внешний сервис (PascalCase: `Code`/`Name`) и тип из `types.ts` (lowercase: `articul`/`name`). */
type MaterialLike = Record<string, unknown>;
const materialKey = (m: MaterialLike): string => {
  const pick = (k: string) => {
    const v = m[k];
    return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  };
  return pick("Code") || pick("articul") || pick("Name") || pick("name");
};

/**
 * Поля, которые считаем пользовательскими правками цен. Покрываем оба формата:
 * `KpPricePerM2`/`KpPricePerUnit` — как их пишет фронт (KpPage);
 * `pricePerSquareMeter`/`pricePerUnit` — legacy-имена из types.ts.
 */
const OVERRIDE_FIELDS = [
  "KpPricePerM2",
  "KpPricePerUnit",
  "KpQuantity",
  "pricePerSquareMeter",
  "pricePerUnit",
] as const;

/**
 * Накладывает сохранённые правки цен поверх свежего расчёта.
 *
 * Порядок результата = порядок сохранённого массива (это важно: внешний calc-сервис
 * не всегда возвращает материалы в одинаковом порядке — особенно материалы без
 * артикула «Общестроительные», у которых Order = 99 одинаковый, и их порядок может
 * отличаться между вызовами. Пользовательский порядок критично сохранить.)
 *
 * Правила:
 *  - Для каждой позиции в saved ищем совпадение в fresh по ключу (Code / articul /
 *    Name / name). Если нашли — берём свежую позицию как базу и накладываем
 *    override-поля цен (KpPricePerM2/KpPricePerUnit и legacy-имена).
 *  - Если saved-позиции нет в fresh — она считается устаревшей и отбрасывается.
 *  - Материалы из fresh, которые не встречались в saved (новые позиции),
 *    добавляются в конец в порядке fresh.
 */
export const mergeMaterialOverrides = (
  fresh: CalcMaterial[],
  saved: CalcMaterial[] | null
): CalcMaterial[] => {
  const freshList: MaterialLike[] = Array.isArray(fresh)
    ? (fresh as unknown as MaterialLike[])
    : [];
  const savedList: MaterialLike[] = Array.isArray(saved)
    ? (saved as unknown as MaterialLike[])
    : [];
  if (savedList.length === 0) return freshList as unknown as CalcMaterial[];

  const freshByKey = new Map<string, MaterialLike>();
  for (const f of freshList) {
    const key = materialKey(f);
    if (key) freshByKey.set(key, f);
  }

  const usedKeys = new Set<string>();
  const result: MaterialLike[] = [];

  // 1) идём по saved, сохраняя пользовательский порядок
  for (const s of savedList) {
    const key = materialKey(s);
    if (!key) continue;
    const freshItem = freshByKey.get(key);
    if (!freshItem) continue; // устаревшая позиция — отбрасываем
    usedKeys.add(key);

    const merged = { ...freshItem };
    for (const field of OVERRIDE_FIELDS) {
      const v = s[field];
      if (v !== undefined && v !== null && v !== "") {
        merged[field] = v;
      }
    }
    result.push(merged);
  }

  // 2) добавляем fresh-новинки (которых не было в saved), в натуральном порядке
  for (const f of freshList) {
    const key = materialKey(f);
    if (!key || usedKeys.has(key)) continue;
    result.push(f);
  }

  return result as unknown as CalcMaterial[];
};

/**
 * Одним вызовом во внешний сервис получает свежие материалы для всех
 * конструкций оффера и накладывает пользовательские override по каждой.
 */
export const recalcConstructionsMaterials = async (
  constructions: ConstructionRow[]
): Promise<RecalcResult[]> => {
  if (constructions.length === 0) return [];

  const sorted = [...constructions].sort((a, b) => a.position - b.position);
  const params = sorted.map((c) => c.calcParams as CalcParams);
  const fresh = await calculateByProduct(params);

  return sorted.map((c, index) => ({
    id: c.id,
    position: c.position,
    materials: mergeMaterialOverrides(
      fresh[index] ?? [],
      (c.materials as CalcMaterial[] | null) ?? null
    ),
  }));
};

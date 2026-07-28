/**
 * Вычисляет площадь и периметр для конструкции
 */
export const calculateAreaAndPerimeter = (lenX, lenY, lenZ, currentSubCategory) => {
  let area = 0;
  let perimeter = 0;

  if (currentSubCategory == "F") {
    // Floor: Area = lenX * lenY (in mm²)
    area = Math.round(lenX * lenY);
    perimeter = Math.round(2 * (lenX + lenY)); // in mm
  } else if (currentSubCategory == "C") {
    // Ceiling: Area = lenX * lenY (in mm²)
    area = Math.round(lenX * lenY);
    perimeter = Math.round(2 * (lenX + lenY)); // in mm
  } else if (currentSubCategory == "W" || currentSubCategory == "L") {
    // Wall/Frame: Area = lenX * lenZ (in mm²)
    area = Math.round(lenX * lenZ);
    perimeter = Math.round(2 * (lenX + lenZ)); // in mm
  }

  return { area, perimeter };
};

import {
  hasEcoSWoolChoice,
  hasGklaChoice,
  stripHangerSuffix,
  stripTapeSuffix,
} from "./calcUlTapeFallback.js";

/**
 * Получает код конструкции по материалам
 */
export const getConstructionCode = (
  currentConstr,
  currentGkla,
  currentWool
) => {
  const { base: baseWithHanger, tape } = stripTapeSuffix(currentConstr);
  const { base } = stripHangerSuffix(baseWithHanger);
  const gkla = hasGklaChoice(base) ? currentGkla : "default";
  const wool = hasEcoSWoolChoice(base) ? currentWool : "default";
  let code = base;
  if (gkla == "default" && wool == "default") {
    code = base;
  } else if (gkla == "default") {
    code = `${base}_${wool}`;
  } else if (wool == "default") {
    code = `${base}_${gkla}`;
  } else {
    code = `${base}_${gkla}_${wool}`;
  }
  code += tape;
  return code;
};

/**
 * Базовый шифр для колонки «шифр» в UI (AG.L401), если в расчёт ушёл вариант
 * с суффиксом материалов (AG.L401_2500P). Сопоставление — по каталогу AllIsolationConstr.
 */
export const resolveDisplayCipher = (calcCode, titleByCode) => {
  const code = String(calcCode ?? "").trim();
  if (!code) return "";
  const codeWithoutSuffix = code.split("_")[0] || code;
  if (!(titleByCode instanceof Map) || titleByCode.size === 0) {
    return codeWithoutSuffix;
  }
  if (titleByCode.has(code)) return code;

  // Самый длинный префикс (AG.C501_ul_… → AG.C501_ul, не AG.C501).
  let best = "";
  for (const key of titleByCode.keys()) {
    const base = String(key ?? "").trim();
    if (!base) continue;
    if (code === base || code.startsWith(`${base}_`)) {
      if (base.length > best.length) best = base;
    }
  }
  return best || codeWithoutSuffix;
};













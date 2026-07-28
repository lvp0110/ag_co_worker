/** Площадь: «м2» или «м²» (в т.ч. из API). */
export const isM2Units = (units) => {
  if (units == null) return false;
  const u = String(units).trim();
  return u === "м2" || u === "м²";
};

/**
 * Количество в м² из поля Quantity calc API.
 * Крупные числа — площадь в мм² (÷10⁶); малые (1, 2…) — уже м² (metal_mesh, plywood).
 */
export const quantityInSquareMeters = (quantity) => {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return NaN;
  if (Math.abs(q) >= 1_000_000) return q / 1e6;
  if (Math.abs(q) > 1000) return q / 1e6;
  return q;
};

/**
 * Конвертирует единицы измерения материала
 */
export const convertUnits = (material) => {
  if (isM2Units(material.Units)) {
    const quantityInM2 = quantityInSquareMeters(material.Quantity);
    if (Number.isNaN(quantityInM2)) return "—";
    return quantityInM2.toFixed(2);
  }
  return material.Quantity;
};

/**
 * Фильтрует переменную (возвращает значение или "---")
 */
export const filterVariable = (variable) => {
  if (/^\d/.test(variable)) {
    return variable;
  } else {
    return "---";
  }
};










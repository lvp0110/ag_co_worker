import { isM2Units, quantityInSquareMeters } from "./formatters";

function parseKpDecimal(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Материалы, у которых calc отдаёт количество в штуках, а в прайсе цена за упаковку.
 * В калькуляторе показываем штуки; на КП — упаковки (округление вверх).
 */
export const PACK_PRICED_MATERIALS = {
  "1408.0201": { packSize: 500, kpUnits: "уп" },
};

export function materialArticleCode(material) {
  return String(material?.Code ?? material?.code ?? "").trim();
}

export function isPackPricedMaterial(material) {
  return materialArticleCode(material) in PACK_PRICED_MATERIALS;
}

/** Количество упаковок для КП (из штук, округление вверх). */
export function kpPackQuantity(material) {
  const cfg = PACK_PRICED_MATERIALS[materialArticleCode(material)];
  if (!cfg) return null;
  const pieces = Number(material?.Quantity);
  if (!Number.isFinite(pieces) || pieces <= 0) return 0;
  return Math.ceil(pieces / cfg.packSize);
}

export function kpPackDisplayUnits(material) {
  const cfg = PACK_PRICED_MATERIALS[materialArticleCode(material)];
  return cfg?.kpUnits ?? material?.Units ?? "—";
}

/** Эффективное количество для расчёта суммы на КП (KpQuantity или calc Quantity). */
export function effectiveKpQuantity(material, { forKp = false } = {}) {
  const kp = parseKpDecimal(material?.KpQuantity);
  if (kp !== null) return kp;
  if (forKp && isPackPricedMaterial(material)) {
    return kpPackQuantity(material);
  }
  if (isM2Units(material?.Units)) {
    const q = quantityInSquareMeters(material?.Quantity);
    return Number.isFinite(q) ? q : null;
  }
  const q = Number(material?.Quantity);
  return Number.isFinite(q) ? q : null;
}

/** Строка для поля ввода количества на КП. */
export function kpQuantityInputValue(material, { forKp = false } = {}) {
  if (material?.KpQuantity != null && material.KpQuantity !== "") {
    return String(material.KpQuantity);
  }
  const formatted = formatMaterialQuantity(material, { forKp });
  return formatted === "—" ? "" : formatted;
}

/** Количество для отображения: в калькуляторе — как в calc, на КП — упаковки. */
export function formatMaterialQuantity(material, { forKp = false } = {}) {
  const kp = parseKpDecimal(material?.KpQuantity);
  if (kp !== null) {
    if (forKp && isPackPricedMaterial(material)) {
      return String(kp);
    }
    if (isM2Units(material?.Units)) {
      return kp.toFixed(1);
    }
    if (Number.isFinite(kp)) return kp.toFixed(1);
    return String(material.KpQuantity);
  }
  if (forKp && isPackPricedMaterial(material)) {
    const packs = kpPackQuantity(material);
    if (!Number.isFinite(packs)) return "—";
    return String(packs);
  }
  const q = material?.Quantity;
  if (q == null || q === "") return "—";
  if (isM2Units(material?.Units)) {
    const quantityInM2 = quantityInSquareMeters(q);
    if (Number.isNaN(quantityInM2)) return "—";
    return quantityInM2.toFixed(1);
  }
  const n = Number(q);
  if (Number.isFinite(n)) return n.toFixed(1);
  return String(q);
}

export function materialDisplayUnits(material, { forKp = false } = {}) {
  if (forKp && isPackPricedMaterial(material)) {
    return kpPackDisplayUnits(material);
  }
  return material?.Units ?? "—";
}

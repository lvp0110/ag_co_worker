/** Порт frontend/src/utils/materialPackUnits.js */
export const PACK_PRICED_MATERIALS: Record<
  string,
  { packSize: number; kpUnits: string }
> = {
  "1408.0201": { packSize: 500, kpUnits: "уп" },
};

type MaterialLike = {
  Code?: string | null;
  code?: string | null;
  Quantity?: unknown;
  KpQuantity?: unknown;
  Units?: string | null;
};

const isM2Units = (units: unknown): boolean => {
  if (units == null) return false;
  const u = String(units).trim();
  return u === "м2" || u === "м²";
};

/** Порт quantityInSquareMeters из frontend/src/utils/formatters.js */
const quantityInSquareMeters = (quantity: unknown): number => {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return NaN;
  if (Math.abs(q) >= 1_000_000) return q / 1e6;
  if (Math.abs(q) > 1000) return q / 1e6;
  return q;
};

export function materialArticleCode(m: MaterialLike): string {
  return String(m?.Code ?? m?.code ?? "").trim();
}

export function isPackPricedMaterial(m: MaterialLike): boolean {
  return materialArticleCode(m) in PACK_PRICED_MATERIALS;
}

export function kpPackQuantity(m: MaterialLike): number | null {
  const cfg = PACK_PRICED_MATERIALS[materialArticleCode(m)];
  if (!cfg) return null;
  const pieces = Number(m?.Quantity);
  if (!Number.isFinite(pieces) || pieces <= 0) return 0;
  return Math.ceil(pieces / cfg.packSize);
}

export function kpPackDisplayUnits(m: MaterialLike): string {
  const cfg = PACK_PRICED_MATERIALS[materialArticleCode(m)];
  return cfg?.kpUnits ?? (typeof m.Units === "string" ? m.Units : "—");
}

const parseKpDecimal = (raw: unknown): number | null => {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Эффективное количество для расчёта суммы на КП (KpQuantity или calc Quantity). */
export function effectiveKpQuantity(
  m: MaterialLike,
  { forKp = true }: { forKp?: boolean } = {},
): number | null {
  const kp = parseKpDecimal(m.KpQuantity);
  if (kp !== null) return kp;
  if (forKp && isPackPricedMaterial(m)) {
    return kpPackQuantity(m);
  }
  if (isM2Units(m.Units)) {
    const q = quantityInSquareMeters(m.Quantity);
    return Number.isFinite(q) ? q : null;
  }
  const q = Number(m.Quantity);
  return Number.isFinite(q) ? q : null;
}

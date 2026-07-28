const VIBROSTEK_ARTICLE_CODES = new Set(["1185.1101", "1185.1102"]);

const UL_TAPE_ARTICLE = {
  Code: "1405.2101",
  Name: "Лента виброизоляционная Ультракустик F100, толщина 6мм (рулон 0,1х15м)",
  Units: "рул",
};

export const UL_TAPE_SUFFIX = "_ul_tape";
export const VIBROSTEK_SUFFIX = "_vibrostek";

/** Legacy-суффикс старых КП (выбор подвеса Ультракустик снят). */
export const UL_HANGER_SUFFIX = "_ul_hanger";

export const stripHangerSuffix = (code: string): { base: string; hanger: string } => {
  const s = String(code ?? "").trim();
  if (s.endsWith(UL_HANGER_SUFFIX)) {
    return { base: s.slice(0, -UL_HANGER_SUFFIX.length), hanger: UL_HANGER_SUFFIX };
  }
  return { base: s, hanger: "" };
};

export const isUlTapeCalcCode = (code: string): boolean => code.endsWith(UL_TAPE_SUFFIX);

export const vibrostekCodeFromUlTape = (code: string): string =>
  code.replace(new RegExp(`${UL_TAPE_SUFFIX}$`), VIBROSTEK_SUFFIX);

export const stripTapeSuffix = (code: string): { base: string; tape: string } => {
  const s = String(code ?? "").trim();
  if (s.endsWith(UL_TAPE_SUFFIX)) {
    return { base: s.slice(0, -UL_TAPE_SUFFIX.length), tape: UL_TAPE_SUFFIX };
  }
  if (s.endsWith(VIBROSTEK_SUFFIX)) {
    return { base: s.slice(0, -VIBROSTEK_SUFFIX.length), tape: VIBROSTEK_SUFFIX };
  }
  return { base: s, tape: "" };
};

export const ulTapeFallbackCalcCodes = (code: string): string[] => {
  const primary = vibrostekCodeFromUlTape(code);
  const { base } = stripTapeSuffix(code);
  return primary === base ? [primary] : [primary, base];
};

export const mapVibrostekMaterialsToUlTape = (
  materials: unknown[]
): unknown[] | null => {
  if (!Array.isArray(materials) || materials.length === 0) return null;

  let replaced = false;
  const mapped = materials.map((row) => {
    const rec =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const code = String(rec.Code ?? rec.code ?? "").trim();
    if (!VIBROSTEK_ARTICLE_CODES.has(code)) return row;
    replaced = true;
    return {
      ...rec,
      Code: UL_TAPE_ARTICLE.Code,
      Name: UL_TAPE_ARTICLE.Name,
      Units: UL_TAPE_ARTICLE.Units,
    };
  });

  return replaced ? mapped : null;
};

export const FLOOR_SEALANT_ULTRACOUSTIC = "ultracoustic";

const UL_SEALANT_BY_VIBROSIL_CODE: Record<
  string,
  { Code: string; Name: string }
> = {
  "1177.1001": {
    Code: "1177.2001",
    Name: "Герметик вибро-акустический Ультракустик, 290 мл",
  },
  "1177.1002": {
    Code: "1177.2002",
    Name: "Герметик вибро-акустический Ультракустик, 290 мл",
  },
};

export const isUltracousticFloorSealant = (sealant: unknown): boolean =>
  sealant === FLOOR_SEALANT_ULTRACOUSTIC;

export const AG_CT_ECO_CIPHER = "AG.Ct_eco";
export const AG_CS_MAT_CIPHER = "AG.Cs_mat";

/**
 * Синтетический шифр мембраны (во внешнем calc нет отдельной конструкции).
 * Материалы собираем локально по площади.
 */
export const AG_CU_MEM_CIPHER = "AG.Cu_mem";

export const UL_MEMBRANE_ARTICLE = {
  Code: "1405.0101",
  Name: "Мембрана звукоизоляционная Ультракустик с клеевым слоем, 2500х1200х3,7 мм",
  Units: "рул",
  InfoPack: "2500х1200х3,7 мм (3 м²)",
};

/** Площадь одного рулона мембраны, м². */
export const UL_MEMBRANE_AREA_PER_ROLL_M2 = 3;

const CEILING_ADDON_CODES = new Set([
  AG_CT_ECO_CIPHER,
  AG_CS_MAT_CIPHER,
  AG_CU_MEM_CIPHER,
]);

/** Нормализует один код аддона → код или null. */
export const normalizeCeilingMatCode = (value: unknown): string | null => {
  const v = String(value ?? "").trim();
  return CEILING_ADDON_CODES.has(v) ? v : null;
};

/**
 * Нормализует CeilingMats / legacy CeilingMat из calc_params → массив кодов.
 */
export const normalizeCeilingMats = (
  mats: unknown,
  legacySingle?: unknown
): string[] => {
  const out: string[] = [];
  const push = (v: unknown) => {
    const code = normalizeCeilingMatCode(v);
    if (code && !out.includes(code)) out.push(code);
  };
  if (Array.isArray(mats)) {
    for (const v of mats) push(v);
  } else if (mats != null && mats !== "") {
    push(mats);
  }
  if (legacySingle != null && legacySingle !== "") {
    push(legacySingle);
  }
  return out;
};

/** Материалы мембраны по площади конструкции (Area в мм²). */
export const buildUlMembraneMaterials = (
  areaMm2: unknown
): unknown[] => {
  const areaM2 = Number(areaMm2) / 1e6;
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return [];
  const quantity = Math.max(1, Math.ceil(areaM2 / UL_MEMBRANE_AREA_PER_ROLL_M2));
  return [
    {
      Code: UL_MEMBRANE_ARTICLE.Code,
      Name: UL_MEMBRANE_ARTICLE.Name,
      Quantity: quantity,
      Units: UL_MEMBRANE_ARTICLE.Units,
      InfoPack: UL_MEMBRANE_ARTICLE.InfoPack,
      Order: 100,
    },
  ];
};

export const WOOL_ECO_S = "eco_s";
export const WOOL_ECO_S_SUFFIX = `_${WOOL_ECO_S}`;

const DEFAULT_ECO_WOOL_ARTICLE_CODES = new Set(["1222.2202"]);

export const WOOL_ECO_S_ARTICLE = {
  Code: "961747",
  Name: "Плита звукопоглощающая Шуманет-Eco S, 1200х600х50 мм (в упак. 10шт/7,2м2/0,360м3)",
  Units: "уп",
};

export const isEcoSWoolCalcCode = (code: string): boolean =>
  code.includes(WOOL_ECO_S_SUFFIX);

export const ecoSWoolFallbackCalcCode = (code: string): string =>
  String(code ?? "").split(WOOL_ECO_S_SUFFIX).join("");

export const mapDefaultEcoWoolToEcoS = (
  materials: unknown[]
): unknown[] | null => {
  if (!Array.isArray(materials) || materials.length === 0) return null;

  let replaced = false;
  const mapped = materials.map((row) => {
    const rec =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const code = String(rec.Code ?? rec.code ?? "").trim();
    if (!DEFAULT_ECO_WOOL_ARTICLE_CODES.has(code)) return row;
    replaced = true;
    return {
      ...rec,
      Code: WOOL_ECO_S_ARTICLE.Code,
      Name: WOOL_ECO_S_ARTICLE.Name,
      Units: WOOL_ECO_S_ARTICLE.Units,
    };
  });

  return replaced ? mapped : null;
};

export const mapVibrosilSealantToUltracoustic = (
  materials: unknown[]
): unknown[] | null => {
  if (!Array.isArray(materials) || materials.length === 0) return null;

  let replaced = false;
  const mapped = materials.map((row) => {
    const rec =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const code = String(rec.Code ?? rec.code ?? "").trim();
    const replacement = UL_SEALANT_BY_VIBROSIL_CODE[code];
    if (!replacement) return row;
    replaced = true;
    return {
      ...rec,
      Code: replacement.Code,
      Name: replacement.Name,
    };
  });

  return replaced ? mapped : null;
};

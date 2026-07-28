/** Коды виброленты в ответе calc-сервиса для варианта *_vibrostek. */
const VIBROSTEK_ARTICLE_CODES = new Set(["1185.1101", "1185.1102"]);

/** Артикул «Лента виброизоляционная Ультракустик F100» в прайсе 1С. */
export const UL_TAPE_ARTICLE = {
  Code: "1405.2101",
  Name: "Лента виброизоляционная Ультракустик F100, толщина 6мм (рулон 0,1х15м)",
  Units: "рул",
};

export const UL_TAPE_SUFFIX = "_ul_tape";
export const VIBROSTEK_SUFFIX = "_vibrostek";

/** Legacy-суффикс старых КП (выбор подвеса Ультракустик снят). */
export const UL_HANGER_SUFFIX = "_ul_hanger";

/** Убирает legacy-суффикс *_ul_hanger с полного кода. */
export const stripHangerSuffix = (code) => {
  const s = String(code ?? "").trim();
  if (s.endsWith(UL_HANGER_SUFFIX)) {
    return { base: s.slice(0, -UL_HANGER_SUFFIX.length), hanger: UL_HANGER_SUFFIX };
  }
  return { base: s, hanger: "" };
};

/** Базовый шифр «Акуфлор S20» (template 2.1) — в колонке «шифр» показываем «—». */
export const AG_F_BASE_CIPHER = "AG.F";

/** AG.F / AG.F_vibrostek / AG.F_ul_tape — не AG.F601 и т.п. */
export const isAgFConstructionCipher = (agId = "", calcCode = "") => {
  const id = String(agId ?? "").trim();
  if (id === AG_F_BASE_CIPHER) return true;
  const code = String(calcCode ?? "").trim();
  if (!code) return false;
  return /^AG\.F(?:_|$)/i.test(code);
};

/** Шифр в UI (таблица КП, PDF, /info): AG.F / AG.Ct_eco / AG.Cs_mat → «—». */
export const AG_CT_ECO_CIPHER = "AG.Ct_eco";
export const AG_CS_MAT_CIPHER = "AG.Cs_mat";

const isCipherWithSuffix = (agId, calcCode, cipher) => {
  const id = String(agId ?? "").trim();
  const code = String(calcCode ?? "").trim();
  if (id === cipher || code === cipher) return true;
  return id.startsWith(`${cipher}_`) || code.startsWith(`${cipher}_`);
};

export const isAgCtEcoCipher = (agId = "", calcCode = "") =>
  isCipherWithSuffix(agId, calcCode, AG_CT_ECO_CIPHER);

export const isAgCsMatCipher = (agId = "", calcCode = "") =>
  isCipherWithSuffix(agId, calcCode, AG_CS_MAT_CIPHER);

/** Потолочные маты без параметров конструкции (шифр скрыт в КП). */
export const isSimpleCeilingMatCipher = (agId = "", calcCode = "") =>
  isAgCtEcoCipher(agId, calcCode) || isAgCsMatCipher(agId, calcCode);

/** Отдельные конструкции на креплениях Ультракустик — шифр в UI/PDF «—». */
export const ULTRACOUSTIC_MOUNT_CIPHERS = ["AG.C501_ul", "AG.L404_ul"];

export const isUltracousticMountCipher = (agId = "", calcCode = "") =>
  ULTRACOUSTIC_MOUNT_CIPHERS.some((cipher) =>
    isCipherWithSuffix(agId, calcCode, cipher),
  );

/**
 * Конструкции, к которым можно добавить мат/мембрану
 * (потолки C501–503 и облицовки L401–405).
 */
export const CEILING_MAT_CHOICE_AG_IDS = new Set([
  "AG.C501",
  "AG.C501_ul",
  "AG.C502",
  "AG.C503",
  "AG.L401",
  "AG.L402",
  "AG.L403",
  "AG.L404",
  "AG.L404_ul",
  "AG.L405",
]);

export const hasCeilingMatChoice = (agId) =>
  Boolean(agId) && CEILING_MAT_CHOICE_AG_IDS.has(String(agId).trim());

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

export const CEILING_ADDON_CODES = new Set([
  AG_CT_ECO_CIPHER,
  AG_CS_MAT_CIPHER,
  AG_CU_MEM_CIPHER,
]);

/** Нормализует один код аддона → код или null. */
export const normalizeCeilingMatCode = (value) => {
  const v = String(value ?? "").trim();
  return CEILING_ADDON_CODES.has(v) ? v : null;
};

/**
 * Нормализует CeilingMats / legacy CeilingMat из calc_params → массив кодов.
 * Поддерживает старый формат `CeilingMat: "AG.Ct_eco"`.
 */
export const normalizeCeilingMats = (mats, legacySingle) => {
  const out = [];
  const push = (v) => {
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
export const buildUlMembraneMaterials = (areaMm2) => {
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

export function constructionDisplayCipher({
  agId = "",
  calcCode = "",
} = {}) {
  if (isAgFConstructionCipher(agId, calcCode)) {
    return "—";
  }

  const id = String(agId ?? "").trim();
  const code = String(calcCode ?? "").trim();
  if (isSimpleCeilingMatCipher(id, code)) {
    return "—";
  }
  if (isUltracousticMountCipher(id, code)) {
    return "—";
  }

  return id || "—";
}

export const isUlTapeCalcCode = (code) =>
  typeof code === "string" && code.endsWith(UL_TAPE_SUFFIX);

export const vibrostekCodeFromUlTape = (code) =>
  String(code).replace(new RegExp(`${UL_TAPE_SUFFIX}$`), VIBROSTEK_SUFFIX);

/** Убирает суффикс ленты с полного кода (в т.ч. AG.C501_ul_tape). */
export const stripTapeSuffix = (code) => {
  const s = String(code ?? "").trim();
  if (s.endsWith(UL_TAPE_SUFFIX)) {
    return { base: s.slice(0, -UL_TAPE_SUFFIX.length), tape: UL_TAPE_SUFFIX };
  }
  if (s.endsWith(VIBROSTEK_SUFFIX)) {
    return { base: s.slice(0, -VIBROSTEK_SUFFIX.length), tape: VIBROSTEK_SUFFIX };
  }
  return { base: s, tape: "" };
};

/** Коды для fallback *_ul_tape: сначала *_vibrostek (полы), затем базовый (потолки). */
export const ulTapeFallbackCalcCodes = (code) => {
  const primary = vibrostekCodeFromUlTape(code);
  const { base } = stripTapeSuffix(code);
  return primary === base ? [primary] : [primary, base];
};

/**
 * В calc-сервисе пока нет *_ul_tape: берём расчёт *_vibrostek и меняем
 * виброленту на УЛ-тейп (количество и остальные позиции — как у vibrostek).
 */
export const mapVibrostekMaterialsToUlTape = (materials) => {
  if (!Array.isArray(materials) || materials.length === 0) return null;

  let replaced = false;
  const mapped = materials.map((row) => {
    const code = String(row?.Code ?? row?.code ?? "").trim();
    if (!VIBROSTEK_ARTICLE_CODES.has(code)) return row;
    replaced = true;
    return {
      ...row,
      Code: UL_TAPE_ARTICLE.Code,
      Name: UL_TAPE_ARTICLE.Name,
      Units: UL_TAPE_ARTICLE.Units,
    };
  });

  return replaced ? mapped : null;
};

/** Шаблоны полов «по периметру» (выбор ленты и герметика). */
export const FLOOR_PERIMETER_TEMPLATES = [607.1, 608.1, 609.1, 610.1, 2.1];

/** Без варианта «Ультракустик F100 по периметру» (только К2 + Вибростек). */
export const FLOOR_NO_UL_TAPE_AG_IDS = new Set(["AG.F608", "AG.F610"]);

/** Полы с пунктом «К2 по периметру» — по умолчанию базовый шифр без суффикса. */
export const FLOOR_K2_PERIMETER_AG_IDS = new Set([
  "AG.F607",
  "AG.F608",
  "AG.F609",
  "AG.F610",
]);

/** Допустимые коды варианта ленты по периметру для шифра AG.F6xx. */
export const floorPerimeterTapeCodes = (agId) => {
  if (!agId) return [];
  const codes = [agId, `${agId}_vibrostek`];
  if (!FLOOR_NO_UL_TAPE_AG_IDS.has(agId)) {
    codes.push(`${agId}_ul_tape`);
  }
  return codes;
};

/** Потолки без выбора ленты по периметру (ЗИПС-Синема). */
export const CEILING_NO_TAPE_AG_IDS = new Set(["AG.Z205"]);

export const hasCeilingTapeChoice = (agId) =>
  Boolean(agId) && !CEILING_NO_TAPE_AG_IDS.has(agId);

/** Допустимые коды ленты по периметру для потолков (AG.C5xx, AG.Z20x). */
export const ceilingPerimeterTapeCodes = (agId) => {
  if (!hasCeilingTapeChoice(agId)) return [];
  return [agId, `${agId}${UL_TAPE_SUFFIX}`];
};

/** ЗИПС-облицовка без выбора ленты (Синема). */
export const FACING_NO_TAPE_AG_IDS = new Set(["AG.Z205"]);

/** Облицовка с выбором ленты (каркас / Виброфлекс / Ультракустик). */
export const FACING_TAPE_L_AG_IDS = new Set([
  "AG.L401",
  "AG.L404",
  "AG.L404_ul",
  "AG.L405",
]);

/** Перегородки с выбором ленты по периметру. */
export const PARTITION_TAPE_AG_IDS = new Set(["AG.W103", "AG.W104", "AG.W105"]);

/** Конструкции без выбора типа гипсокартона (фиксированный состав). */
export const GKLA_NO_CHOICE_AG_IDS = new Set(["AG.W108"]);

export const hasGklaChoice = (agId) =>
  Boolean(agId) && !GKLA_NO_CHOICE_AG_IDS.has(String(agId).trim());

/** Значение currentWool → суффикс *_eco_s в шифре расчёта. */
export const WOOL_ECO_S = "eco_s";

export const WOOL_ECO_S_SUFFIX = `_${WOOL_ECO_S}`;

/** Артикул минваты «Шуманет-ЭКО» в расчёте базового шифра (default wool). */
const DEFAULT_ECO_WOOL_ARTICLE_CODES = new Set(["1222.2202"]);

/** Минвата «Шуманет-Eco S» в прайсе 1С (/api/v2/data). */
export const WOOL_ECO_S_ARTICLE = {
  Code: "961747",
  Name: "Плита звукопоглощающая Шуманет-Eco S, 1200х600х50 мм (в упак. 10шт/7,2м2/0,360м3)",
  Units: "уп",
};

/** Конструкции с вариантом минваты «Шуманет-Eco S». */
export const WOOL_ECO_S_CHOICE_AG_IDS = new Set([
  "AG.C501",
  "AG.C501_ul",
  "AG.C502",
  "AG.C503",
  "AG.L401",
  "AG.L403",
  "AG.L404",
  "AG.L404_ul",
  "AG.L405",
  "AG.W101",
  "AG.W103",
  "AG.W104",
  "AG.W105",
  "AG.W107",
  "AG.W108",
]);

export const hasEcoSWoolChoice = (agId) =>
  Boolean(agId) && WOOL_ECO_S_CHOICE_AG_IDS.has(String(agId).trim());

export const isEcoSWoolCalcCode = (code) =>
  typeof code === "string" && code.includes(WOOL_ECO_S_SUFFIX);

/** Убирает *_eco_s из шифра (AG.W101_2500P_eco_s → AG.W101_2500P). */
export const ecoSWoolFallbackCalcCode = (code) =>
  String(code ?? "").split(WOOL_ECO_S_SUFFIX).join("");

/**
 * Внешний calc пока не знает *_eco_s: считаем вариант без суффикса (default wool)
 * и подменяем Шуманет-ЭКО на Шуманет-Eco S; количество — как у расчёта.
 */
export const mapDefaultEcoWoolToEcoS = (materials) => {
  if (!Array.isArray(materials) || materials.length === 0) return null;

  let replaced = false;
  const mapped = materials.map((row) => {
    const code = String(row?.Code ?? row?.code ?? "").trim();
    if (!DEFAULT_ECO_WOOL_ARTICLE_CODES.has(code)) return row;
    replaced = true;
    return {
      ...row,
      Code: WOOL_ECO_S_ARTICLE.Code,
      Name: WOOL_ECO_S_ARTICLE.Name,
      Units: WOOL_ECO_S_ARTICLE.Units,
    };
  });

  return replaced ? mapped : null;
};

export const hasFacingTapeChoice = (agId) => {
  if (!agId || FACING_NO_TAPE_AG_IDS.has(agId)) return false;
  if (FACING_TAPE_L_AG_IDS.has(agId)) return true;
  if (PARTITION_TAPE_AG_IDS.has(agId)) return true;
  return String(agId).startsWith("AG.Z");
};

/** Допустимые коды ленты по периметру для облицовки. */
export const facingPerimeterTapeCodes = (agId) => {
  if (!hasFacingTapeChoice(agId)) return [];
  return [agId, `${agId}${UL_TAPE_SUFFIX}`];
};

/** Базовые шифры полов с выбором типа герметика (AG.F603 … AG.F615). */
export const FLOOR_SEALANT_BASE_AG_IDS = new Set([
  "AG.F603",
  "AG.F604",
  "AG.F605",
  "AG.F606",
  "AG.F611",
  "AG.F612",
  "AG.F613",
  "AG.F614",
  "AG.F615",
]);

/** Базовый шифр AG.F6xx из полного кода (AG.F606_30, AG.F615_vibroflex_LD …). */
export const floorSealantBaseAgId = (codeOrAgId) => {
  const code = String(codeOrAgId ?? "").trim();
  const match = code.match(/^(AG\.F\d{3})/);
  return match ? match[1] : "";
};

export const hasFloorSealantChoice = ({ agId, code } = {}) => {
  const base = floorSealantBaseAgId(agId || code);
  return FLOOR_SEALANT_BASE_AG_IDS.has(base);
};

export const FLOOR_SEALANT_VIBROSIL = "vibrosil";
export const FLOOR_SEALANT_ULTRACOUSTIC = "ultracoustic";

const UL_SEALANT_BY_VIBROSIL_CODE = {
  "1177.1001": {
    Code: "1177.2001",
    Name: "Герметик вибро-акустический Ультракустик, 290 мл",
  },
  "1177.1002": {
    Code: "1177.2002",
    Name: "Герметик вибро-акустический Ультракустик, 290 мл",
  },
};

export const isFloorPerimeterTemplate = (template) =>
  FLOOR_PERIMETER_TEMPLATES.includes(template);

export const isUltracousticFloorSealant = (sealant) =>
  sealant === FLOOR_SEALANT_ULTRACOUSTIC;

/** Calc всегда отдаёт Вибросил; при выборе «Ультракустик» подменяем артикул в материалах. */
export const mapVibrosilSealantToUltracoustic = (materials) => {
  if (!Array.isArray(materials) || materials.length === 0) return null;

  let replaced = false;
  const mapped = materials.map((row) => {
    const code = String(row?.Code ?? row?.code ?? "").trim();
    const replacement = UL_SEALANT_BY_VIBROSIL_CODE[code];
    if (!replacement) return row;
    replaced = true;
    return {
      ...row,
      Code: replacement.Code,
      Name: replacement.Name,
    };
  });

  return replaced ? mapped : null;
};

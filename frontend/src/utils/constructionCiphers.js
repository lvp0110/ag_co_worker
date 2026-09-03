/**
 * Шифры конструкций для UI + подмены артикулов на legacy-пути расчёта v1.
 *
 * Две независимые части:
 *
 * 1. Шифр в интерфейсе (`constructionDisplayCipher`, `isAgCtEcoCipher`, …) —
 *    используется калькулятором, таблицей конструкций и страницей «Инфо».
 *
 * 2. Фолбэки под шифры, которых не знал внешний calc v1 (`*_ul_tape`,
 *    `*_eco_s`, герметик «Ультракустик»). Они вызываются ТОЛЬКО из
 *    `services/constructionApi.js:calculateConstruction` — то есть из
 *    legacy-пути `POST /api/v1/calcIsolation/byProduct`, который остался
 *    третьим фолбэком материалов на «Инфо». Основной расчёт (v2
 *    `by-construction`) их не использует: подмены и опциональные материалы
 *    там делает сервер по данным админки.
 *
 * Вторую часть можно удалить, когда состав конструкций будет заполнен в БД и
 * страница «Инфо» перестанет опираться на расчёт v1.
 */

/* ─── 1. Шифр в интерфейсе ─────────────────────────────────────────────── */

/** Legacy-суффикс старых КП (выбор подвеса Ультракустик снят). */
const UL_HANGER_SUFFIX = "_ul_hanger";

/** Убирает legacy-суффикс *_ul_hanger с полного кода. */
export const stripHangerSuffix = (code) => {
  const s = String(code ?? "").trim();
  if (s.endsWith(UL_HANGER_SUFFIX)) {
    return { base: s.slice(0, -UL_HANGER_SUFFIX.length), hanger: UL_HANGER_SUFFIX };
  }
  return { base: s, hanger: "" };
};

/** Базовый шифр «Акуфлор S20» (template 2.1) — в колонке «шифр» показываем «—». */
const AG_F_BASE_CIPHER = "AG.F";

/** AG.F / AG.F_vibrostek / AG.F_ul_tape — не AG.F601 и т.п. */
const isAgFConstructionCipher = (agId = "", calcCode = "") => {
  const id = String(agId ?? "").trim();
  if (id === AG_F_BASE_CIPHER) return true;
  const code = String(calcCode ?? "").trim();
  if (!code) return false;
  return /^AG\.F(?:_|$)/i.test(code);
};

/** Шифр в UI (таблица КП, /info): AG.F / AG.Ct_eco / AG.Cs_mat → «—». */
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
const isSimpleCeilingMatCipher = (agId = "", calcCode = "") =>
  isAgCtEcoCipher(agId, calcCode) || isAgCsMatCipher(agId, calcCode);

/** Отдельные конструкции на креплениях Ультракустик — шифр в UI «—». */
const ULTRACOUSTIC_MOUNT_CIPHERS = ["AG.C501_ul", "AG.L404_ul"];

const isUltracousticMountCipher = (agId = "", calcCode = "") =>
  ULTRACOUSTIC_MOUNT_CIPHERS.some((cipher) =>
    isCipherWithSuffix(agId, calcCode, cipher),
  );

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

/* ─── 2. Фолбэки legacy-пути v1 ────────────────────────────────────────── */
/* Всё ниже вызывается только из constructionApi.js:calculateConstruction.  */

/** Коды виброленты в ответе calc-сервиса для варианта *_vibrostek. */
const VIBROSTEK_ARTICLE_CODES = new Set(["1185.1101", "1185.1102"]);

/** Артикул «Лента виброизоляционная Ультракустик F100» в прайсе 1С. */
const UL_TAPE_ARTICLE = {
  Code: "1405.2101",
  Name: "Лента виброизоляционная Ультракустик F100, толщина 6мм (рулон 0,1х15м)",
  Units: "рул",
};

const UL_TAPE_SUFFIX = "_ul_tape";
const VIBROSTEK_SUFFIX = "_vibrostek";

export const isUlTapeCalcCode = (code) =>
  typeof code === "string" && code.endsWith(UL_TAPE_SUFFIX);

const vibrostekCodeFromUlTape = (code) =>
  String(code).replace(new RegExp(`${UL_TAPE_SUFFIX}$`), VIBROSTEK_SUFFIX);

/** Убирает суффикс ленты с полного кода (в т.ч. AG.C501_ul_tape). */
const stripTapeSuffix = (code) => {
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
 * В calc v1 нет *_ul_tape: берём расчёт *_vibrostek и меняем виброленту на
 * УЛ-тейп (количество и остальные позиции — как у vibrostek).
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

/** Суффикс *_eco_s в шифре расчёта (минвата Шуманет-ЭКО-С). */
const WOOL_ECO_S_SUFFIX = "_eco_s";

/** Артикул минваты «Шуманет-ЭКО» в расчёте базового шифра (default wool). */
const DEFAULT_ECO_WOOL_ARTICLE_CODES = new Set(["1222.2202"]);

/** Минвата «Шуманет-Eco S» в прайсе (/commerce/price-list). */
const WOOL_ECO_S_ARTICLE = {
  Code: "961747",
  Name: "Плита звукопоглощающая Шуманет-Eco S, 1200х600х50 мм (в упак. 10шт/7,2м2/0,360м3)",
  Units: "уп",
};

export const isEcoSWoolCalcCode = (code) =>
  typeof code === "string" && code.includes(WOOL_ECO_S_SUFFIX);

/** Убирает *_eco_s из шифра (AG.W101_2500P_eco_s → AG.W101_2500P). */
export const ecoSWoolFallbackCalcCode = (code) =>
  String(code ?? "").split(WOOL_ECO_S_SUFFIX).join("");

/**
 * В calc v1 нет *_eco_s: считаем вариант без суффикса (default wool)
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

const FLOOR_SEALANT_ULTRACOUSTIC = "ultracoustic";

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

export const isUltracousticFloorSealant = (sealant) =>
  sealant === FLOOR_SEALANT_ULTRACOUSTIC;

/** Calc v1 всегда отдаёт Вибросил; при выборе «Ультракустик» подменяем артикул. */
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

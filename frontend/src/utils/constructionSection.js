import mainSections from "../data/mainSections";

const SECTION_TITLE_BY_ID = Object.fromEntries(
  mainSections.map((s) => [s.id, s.title])
);

/** Подкатегория расчёта (как в SubCategories.title) по id секции F/C/L/W. */
const SECTION_TYPE_BY_ID = {
  F: "ПОЛ",
  C: "ПОТОЛОК",
  L: "ОБЛИЦОВКА",
  W: "ПЕРЕГОРОДКА",
};

const SECTION_LABEL_BY_TYPE = {
  ПОТОЛОК: "Потолок",
  ПОЛ: "Пол",
  ОБЛИЦОВКА: "Облицовка",
  ПЕРЕГОРОДКА: "Перегородка",
};

const KNOWN_SECTION_LABELS = new Set(Object.values(SECTION_LABEL_BY_TYPE));

/** id секции калькулятора (F/C/L/W) по выбранной подкатегории. */
export function sectionIdFromSubCategory(subCatId) {
  if (subCatId === "F") return "F";
  if (subCatId === "C" || subCatId === 6) return "C";
  if (subCatId === "L" || subCatId === 5) return "L";
  if (subCatId === "W") return "W";
  return null;
}

/** id секции по шифру конструкции (AG.Z не определяется однозначно). */
export function sectionIdFromCode(code) {
  const c = String(code ?? "").trim();
  if (!c) return null;
  if (c.startsWith("AG.W")) return "W";
  if (c.startsWith("AG.C")) return "C";
  if (c.startsWith("AG.F")) return "F";
  if (c.startsWith("AG.L")) return "L";
  return null;
}

export function sectionLabelFromSectionId(sectionId) {
  const id = String(sectionId ?? "").trim();
  return id ? SECTION_TITLE_BY_ID[id] || "" : "";
}

/** Подкатегория расчёта (ПОТОЛОК / Потолок) → заголовок секции. */
export function sectionLabelFromType(type) {
  const key = String(type ?? "").trim().toUpperCase();
  if (key && SECTION_LABEL_BY_TYPE[key]) return SECTION_LABEL_BY_TYPE[key];
  const raw = String(type ?? "").trim();
  if (raw && KNOWN_SECTION_LABELS.has(raw)) return raw;
  return "";
}

export function sectionLabelFromCode(code) {
  return sectionLabelFromSectionId(sectionIdFromCode(code));
}

/**
 * Заголовок секции для карточки конструкции: type → section_id → шифр.
 */
export function sectionLabelForConstruction({ type, section_id, ag_id }) {
  const fromType = sectionLabelFromType(type);
  if (fromType) return fromType;
  const fromSectionId = sectionLabelFromSectionId(section_id);
  if (fromSectionId) return fromSectionId;
  return sectionLabelFromCode(ag_id);
}

/** Для offerMapper: type (ПОТОЛОК / ПОЛ …) из calc_params или по шифру. */
export function constructionTypeFromCalcParams(calcParams) {
  const cp = calcParams || {};
  if (cp.SectionType) return String(cp.SectionType);
  const sid = cp.SectionId || sectionIdFromCode(cp.Code || "");
  if (sid && SECTION_TYPE_BY_ID[sid]) return SECTION_TYPE_BY_ID[sid];
  return "";
}

import mainSections from "../data/mainSections";

const SECTION_TITLE_BY_ID = Object.fromEntries(
  mainSections.map((s) => [s.id, s.title])
);

/** GET /api/v2/constructions/types.code → id/иконка секции калькулятора. */
const SECTION_BY_TYPE_CODE = {
  floor: { id: "F", icon: "icon_floor_white.svg" },
  ceiling: { id: "C", icon: "icon_ceiling_white.svg" },
  cladding: { id: "L", icon: "icon_frame_white.svg" },
  partition: { id: "W", icon: "icon_partition_white.svg" },
};

const SECTION_ORDER = ["F", "C", "L", "W"];

/** id секции калькулятора (F/C/L/W) по construction_types.code. */
export function sectionIdFromTypeCode(typeCode) {
  const code = String(typeCode ?? "")
    .trim()
    .toLowerCase();
  return SECTION_BY_TYPE_CODE[code]?.id ?? null;
}

function capitalizeSectionTitle(name) {
  const s = String(name ?? "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Справочник GET /api/v2/constructions/types → разделы калькулятора.
 * Внутренние id F/C/L/W сохраняются: по ним фильтруются items и подкатегории.
 */
export function sectionsFromConstructionTypes(types) {
  if (!Array.isArray(types) || types.length === 0) return [];
  const seen = new Set();
  const mapped = [];
  for (const row of types) {
    const code = String(row?.code ?? "")
      .trim()
      .toLowerCase();
    const known = SECTION_BY_TYPE_CODE[code];
    if (!known || seen.has(known.id)) continue;
    seen.add(known.id);
    mapped.push({
      id: known.id,
      title: capitalizeSectionTitle(row.name) || SECTION_TITLE_BY_ID[known.id],
      icon: known.icon,
      typeId: row.id,
      typeCode: code,
    });
  }
  mapped.sort(
    (a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id)
  );
  return mapped;
}

/** Подкатегория расчёта (как в SubCategories.title) по id секции F/C/L/W. */
const SECTION_LABEL_BY_TYPE = {
  ПОЛ: "Пол",
  ПОТОЛОК: "Потолок",
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

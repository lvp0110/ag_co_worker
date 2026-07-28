import type { CatalogEntry } from "../services/catalogData.js";
import {
  resolveItemsDisplayMeta,
  resolveDisplayCipherFromItems,
  itemsBaseTableName,
  isZipsItemsBaseConstruction,
  shouldSkipSectionLabelPrefix,
} from "./itemsCatalog.js";

/** Базовый шифр «Акуфлор S20» (template 2.1) — порт frontend AG_F_BASE_CIPHER. */
export const AG_F_BASE_CIPHER = "AG.F";

/** Шуманет-Термо ЭКО — порт frontend AG_CT_ECO_CIPHER. */
export const AG_CT_ECO_CIPHER = "AG.Ct_eco";
/** Ультракустик Супер Мат — порт frontend AG_CS_MAT_CIPHER. */
export const AG_CS_MAT_CIPHER = "AG.Cs_mat";

const isCipherWithSuffix = (agId: string, calcCode: string, cipher: string): boolean => {
  const id = String(agId ?? "").trim();
  const code = String(calcCode ?? "").trim();
  if (id === cipher || code === cipher) return true;
  return id.startsWith(`${cipher}_`) || code.startsWith(`${cipher}_`);
};

export const isAgCtEcoCipher = (agId = "", calcCode = ""): boolean =>
  isCipherWithSuffix(agId, calcCode, AG_CT_ECO_CIPHER);

export const isAgCsMatCipher = (agId = "", calcCode = ""): boolean =>
  isCipherWithSuffix(agId, calcCode, AG_CS_MAT_CIPHER);

export const isSimpleCeilingMatCipher = (agId = "", calcCode = ""): boolean =>
  isAgCtEcoCipher(agId, calcCode) || isAgCsMatCipher(agId, calcCode);

/** Отдельные конструкции на креплениях Ультракустик — шифр в UI/PDF «—». */
export const ULTRACOUSTIC_MOUNT_CIPHERS = ["AG.C501_ul", "AG.L404_ul"] as const;

export const isUltracousticMountCipher = (agId = "", calcCode = ""): boolean =>
  ULTRACOUSTIC_MOUNT_CIPHERS.some((cipher) =>
    isCipherWithSuffix(agId, calcCode, cipher)
  );

/** resolveDisplayCipher режет AG.Ct_eco / AG.Cs_mat — для каталога/PDF берём полный шифр. */
export const normalizeCatalogCipher = (calcCode: string, resolved: string): string => {
  const code = String(calcCode ?? "").trim();
  if (isAgCtEcoCipher("", code)) return AG_CT_ECO_CIPHER;
  if (isAgCsMatCipher("", code)) return AG_CS_MAT_CIPHER;
  return resolved;
};

/**
 * AG.F / AG.F_vibrostek / AG.F_ul_tape — не AG.F601 и т.п.
 * Порт frontend `isAgFConstructionCipher`.
 */
export const isAgFConstructionCipher = (agId = "", calcCode = ""): boolean => {
  const id = String(agId ?? "").trim();
  if (id === AG_F_BASE_CIPHER) return true;
  const code = String(calcCode ?? "").trim();
  if (!code) return false;
  return /^AG\.F(?:_|$)/i.test(code);
};

/** Порт frontend `resolveDisplayCipher` — шифр каталога по calc Code с суффиксами. */
export const resolveDisplayCipher = (
  calcCode: string,
  titleByCode: Map<string, CatalogEntry>
): string => {
  const code = String(calcCode ?? "").trim();
  if (!code) return "";
  const codeWithoutSuffix = code.split("_")[0] || code;
  if (titleByCode.size === 0) return codeWithoutSuffix;
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

/**
 * Шифр в таблице КП, PDF и на /info.
 * Порт frontend `constructionDisplayCipher`.
 */
export const constructionDisplayCipher = ({
  agId = "",
  calcCode = "",
}: {
  agId?: string;
  calcCode?: string;
} = {}): string => {
  if (isAgFConstructionCipher(agId, calcCode)) return "—";

  const id = String(agId ?? "").trim();
  const code = String(calcCode ?? "").trim();
  if (isSimpleCeilingMatCipher(id, code)) return "—";
  if (isUltracousticMountCipher(id, code)) return "—";

  return id || code || "—";
};

/**
 * Блок «Информация о конструкциях» в PDF не выводится для AG.F без цифр.
 */
export const shouldOmitConstructionInfoInPdf = (
  calcParams: Record<string, unknown> | null,
  catalog: Map<string, CatalogEntry>
): boolean => {
  const calcCode = typeof calcParams?.Code === "string" ? calcParams.Code.trim() : "";
  const cipher = resolveDisplayCipher(calcCode, catalog);
  return isAgFConstructionCipher(cipher, calcCode);
};

const SECTION_TYPE_BY_ID: Record<string, string> = {
  F: "ПОЛ",
  C: "ПОТОЛОК",
  L: "ОБЛИЦОВКА",
  W: "ПЕРЕГОРОДКА",
};

const SECTION_LABEL_BY_TYPE: Record<string, string> = {
  ПОТОЛОК: "Потолок",
  ПОЛ: "Пол",
  ОБЛИЦОВКА: "Облицовка",
  ПЕРЕГОРОДКА: "Перегородка",
};

const KNOWN_SECTION_LABELS = new Set(Object.values(SECTION_LABEL_BY_TYPE));

export const sectionIdFromCode = (code: string): string | null => {
  const c = String(code ?? "").trim();
  if (!c) return null;
  if (c.startsWith("AG.W")) return "W";
  if (c.startsWith("AG.C")) return "C";
  if (c.startsWith("AG.F")) return "F";
  if (c.startsWith("AG.L")) return "L";
  return null;
};

const sectionLabelFromSectionId = (sectionId: string): string => {
  const id = String(sectionId ?? "").trim();
  if (!id) return "";
  return SECTION_LABEL_BY_TYPE[SECTION_TYPE_BY_ID[id] ?? ""] ?? "";
};

const sectionLabelFromType = (type: string): string => {
  const key = String(type ?? "").trim().toUpperCase();
  if (key && SECTION_LABEL_BY_TYPE[key]) return SECTION_LABEL_BY_TYPE[key];
  const raw = String(type ?? "").trim();
  if (raw && KNOWN_SECTION_LABELS.has(raw)) return raw;
  return "";
};

const sectionLabelFromCode = (code: string): string =>
  sectionLabelFromSectionId(sectionIdFromCode(code) ?? "");

const sectionLabelForConstruction = ({
  type,
  section_id,
  ag_id,
}: {
  type: string;
  section_id: string | null;
  ag_id: string;
}): string => {
  const fromType = sectionLabelFromType(type);
  if (fromType) return fromType;
  const fromSectionId = sectionLabelFromSectionId(section_id ?? "");
  if (fromSectionId) return fromSectionId;
  return sectionLabelFromCode(ag_id);
};

export const constructionTypeFromCalcParams = (
  calcParams: Record<string, unknown> | null
): string => {
  const cp = calcParams ?? {};
  if (cp.SectionType) return String(cp.SectionType);
  const code = typeof cp.Code === "string" ? cp.Code : "";
  const sid =
    (typeof cp.SectionId === "string" && cp.SectionId) || sectionIdFromCode(code) || "";
  if (sid && SECTION_TYPE_BY_ID[sid]) return SECTION_TYPE_BY_ID[sid];
  return "";
};

const constructionDisplayTitle = ({
  title,
}: {
  title: string;
}): string => String(title ?? "").trim();

/**
 * Заголовок секции PDF = `constructionCardHeading` на странице КП
 * (ConstructionList + mapOfferResponseToKpView).
 */
export const constructionKpCardHeading = (
  calcParams: Record<string, unknown> | null,
  catalog: Map<string, CatalogEntry>
): string => {
  if (!calcParams) return "Конструкция";

  const calcCode = typeof calcParams.Code === "string" ? calcParams.Code.trim() : "";
  const cipher =
    resolveDisplayCipherFromItems(calcCode) ||
    resolveDisplayCipher(calcCode, catalog);
  const sectionId =
    (typeof calcParams.SectionId === "string" && calcParams.SectionId) ||
    sectionIdFromCode(calcCode) ||
    "";
  const { title: itemsShortTitle, description: itemsDescription } =
    resolveItemsDisplayMeta({ calcCode, cipher, sectionId });
  const shortTitle = itemsShortTitle;
  const description = itemsDescription;
  const title = itemsBaseTableName({ title: shortTitle, description }) || cipher || "—";

  const type = constructionTypeFromCalcParams(calcParams);

  const displayTitle = constructionDisplayTitle({ title });
  const normalizedCode = cipher.trim();
  const looksLikeConstructionCode = /^AG\.[A-Z0-9._-]+$/i.test(displayTitle.trim());
  const safeDisplayTitle =
    displayTitle !== "" &&
    displayTitle !== normalizedCode &&
    !looksLikeConstructionCode
      ? displayTitle
      : "";
  const constructionPart = safeDisplayTitle !== "" ? safeDisplayTitle : "Конструкция";
  const sectionLabel = sectionLabelForConstruction({
    type,
    section_id: sectionId,
    ag_id: cipher,
  });
  const zips = isZipsItemsBaseConstruction({ agId: cipher, shortTitle });
  if (
    !sectionLabel ||
    shouldSkipSectionLabelPrefix(sectionLabel, { zips })
  ) {
    return constructionPart;
  }
  const prefix = `${sectionLabel} `;
  if (constructionPart.toLowerCase().startsWith(prefix.toLowerCase())) {
    return constructionPart;
  }
  return `${sectionLabel} ${constructionPart}`;
};

import itemsBaseMeta from "../data/itemsBaseMeta.json" with { type: "json" };

type ItemsMetaRow = {
  ag_id: string;
  c_id: string;
  title: string;
  description: string;
};

const ITEMS = itemsBaseMeta as ItemsMetaRow[];

const itemsAgIdKeyMap = new Map<string, ItemsMetaRow>();
for (const item of ITEMS) {
  if (item.ag_id) itemsAgIdKeyMap.set(item.ag_id, item);
}

const SECTION_ID_FROM_CODE = (code: string): string => {
  const c = code.trim();
  if (c.startsWith("AG.W")) return "W";
  if (c.startsWith("AG.C")) return "C";
  if (c.startsWith("AG.F")) return "F";
  if (c.startsWith("AG.L")) return "L";
  return "";
};

function pickItemByCalcCode(calcCode: string): ItemsMetaRow | null {
  const code = calcCode.trim();
  if (!code) return null;
  let best: ItemsMetaRow | null = null;
  for (const item of ITEMS) {
    const base = item.ag_id.trim();
    if (!base) continue;
    if (code === base || code.startsWith(`${base}_`)) {
      if (!best || base.length > best.ag_id.length) best = item;
    }
  }
  return best;
}

function pickItemByAgIdAndSection(
  agId: string,
  sectionId: string
): ItemsMetaRow | null {
  const id = agId.trim();
  if (!id) return null;
  const sid = sectionId.trim();
  const matches = ITEMS.filter((item) => item.ag_id === id);
  if (matches.length === 0) return null;
  if (matches.length === 1 || !sid) return matches[0];
  return matches.find((item) => item.c_id === sid) ?? matches[0];
}

/** Порт frontend resolveItemsDisplayMeta — подписи из ItemsBase. */
export function resolveItemsDisplayMeta({
  calcCode = "",
  cipher = "",
  sectionId = "",
}: {
  calcCode?: string;
  cipher?: string;
  sectionId?: string;
} = {}): { title: string; description: string } {
  const agId =
    cipher.trim() ||
    resolveDisplayCipherFromItems(calcCode) ||
    "";
  const sid = sectionId.trim() || SECTION_ID_FROM_CODE(calcCode);

  const item =
    pickItemByAgIdAndSection(agId, sid) || pickItemByCalcCode(calcCode);

  if (!item) return { title: "", description: "" };
  return {
    title: item.title.trim(),
    description: item.description.trim(),
  };
}

/** Имя для таблицы/PDF: ItemsBase.description, иначе title. */
export function itemsBaseTableName({
  title = "",
  description = "",
}: {
  title?: string;
  description?: string;
} = {}): string {
  const desc = String(description ?? "").trim();
  if (desc) return desc;
  return String(title ?? "").trim();
}

/** ЗИПС (AG.Z* или короткий title «ЗИПС-…»): без префикса секции Потолок/Облицовка. */
export function isZipsItemsBaseConstruction({
  agId = "",
  shortTitle = "",
}: {
  agId?: string;
  shortTitle?: string;
} = {}): boolean {
  const id = String(agId ?? "").trim();
  if (/^AG\.Z/i.test(id)) return true;
  return String(shortTitle ?? "")
    .trim()
    .toUpperCase()
    .startsWith("ЗИПС");
}

export function shouldSkipSectionLabelPrefix(
  sectionLabel: string,
  { zips = false }: { zips?: boolean } = {}
): boolean {
  const label = String(sectionLabel ?? "").trim();
  if (label === "Потолок" || label === "Пол") return true;
  if (zips && label === "Облицовка") return true;
  return false;
}

/** Базовый шифр по calc Code и ключам ItemsBase (без API-каталога). */
export function resolveDisplayCipherFromItems(calcCode: string): string {
  const code = calcCode.trim();
  if (!code) return "";
  const codeWithoutSuffix = code.split("_")[0] || code;
  if (itemsAgIdKeyMap.size === 0) return codeWithoutSuffix;
  if (itemsAgIdKeyMap.has(code)) return code;

  // Самый длинный префикс (AG.C501_ul_… → AG.C501_ul, не AG.C501).
  let best = "";
  for (const key of itemsAgIdKeyMap.keys()) {
    const base = key.trim();
    if (!base) continue;
    if (code === base || code.startsWith(`${base}_`)) {
      if (base.length > best.length) best = base;
    }
  }
  return best || codeWithoutSuffix;
}

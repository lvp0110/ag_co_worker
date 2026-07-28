import {
  constructionTypeFromCalcParams,
  sectionIdFromCode,
} from "./constructionSection.js";
import { resolveDisplayCipher } from "./calculations.js";
import { calculateAreaAndPerimeter } from "./calculations.js";
import {
  getItemsAgIdKeyMap,
  itemsBaseTableName,
  resolveItemsDisplayMeta,
  syncConstructionsTitlesFromItems,
} from "./itemsCatalog.js";

/** Сохраняет UI-название в calc_params из ItemsBase (не из API-каталога). */
function mergeUiDisplayIntoCalcParams(calcParams, ui) {
  if (!calcParams || typeof calcParams !== "object") return calcParams;
  const cipher = resolveDisplayCipher(calcParams.Code, getItemsAgIdKeyMap());
  const sectionId = ui?.section_id || calcParams.SectionId;
  const fromItems = resolveItemsDisplayMeta({
    calcCode: calcParams.Code,
    cipher,
    sectionId,
    catalogId: ui?.catalog_id ?? ui?.id,
  });
  const title = itemsBaseTableName(fromItems);
  const description = fromItems.description;
  const next = { ...calcParams };
  if (title) next.DisplayTitle = title;
  if (description) next.DisplayDescription = description;
  return next;
}

function resolveConstructionText(cp, { cipher, sectionId, catalogId }) {
  const sid = sectionId || cp?.SectionId || sectionIdFromCode(cp?.Code || "");
  const fromItems = resolveItemsDisplayMeta({
    calcCode: cp?.Code,
    cipher,
    sectionId: sid,
    catalogId,
  });
  return fromItems;
}

/**
 * Маппинг между состоянием Calculator / KpPage и бэкендовым DTO Offer.
 *
 * Поток:
 *   Calculator state → buildCreateOfferPayload() → POST /api/offers → Offer DTO
 *   GET /api/offers/:id → mapOfferResponseToKpView() → KpPage state
 *   KpPage state → buildUpdateOfferPayload() → PATCH /api/offers/:id
 */

// ─── create ─────────────────────────────────────────────────────────────────

/**
 * Собирает тело POST /api/offers из состояния калькулятора.
 * `form` необязателен — пользователь заполнит метаданные КП на /kp/:id.
 */
export function buildCreateOfferPayload({
  constrToCalcToSent,
  constrToCalc,
  form = null,
  services = [],
  kpSettings = null,
}) {
  const constructions = constrToCalcToSent.map((calcParams, index) => ({
    calc_params: mergeUiDisplayIntoCalcParams(
      calcParams,
      (constrToCalc || [])[index],
    ),
    // materials серверная ручка пересчитает сама (POST всегда свежий calc),
    // montage пустой — пользователь заполнит на /kp/:id.
    montage: [],
  }));

  return {
    form: form ? mapFormToApi(form) : undefined,
    offerDraft: {
      constructions,
      services: services.map(mapServiceRowToApi).filter(Boolean),
      // доп. материалы при создании обычно пустые — пользователь добавит их на /kp/:id;
      // но если уже есть — сразу сохраним.
      additional_materials: [],
      ...(kpSettings ? { kp_settings: normalizeKpSettings(kpSettings) } : {}),
    },
  };
}

// ─── load ───────────────────────────────────────────────────────────────────

/** Подставляет title/description из ItemsBase. */
export function enrichConstructionsWithTitles(
  constructions,
  _titleByCode,
  constrToCalcToSent = [],
) {
  return syncConstructionsTitlesFromItems(constructions, constrToCalcToSent);
}

/**
 * Превращает ответ GET /api/offers/:id в объекты, которые потребляет KpPage:
 *   - form          — плоская модель контактной формы (даты/регион/менеджер/...).
 *   - constructions — ConstrToCalc-совместимый массив карточек (key_id === construction.id).
 *   - materialsByConstruction — [{ key_id, data: Material[] }] в той же форме,
 *                               что писал Calculator (KpPricePerM2/KpPricePerUnit
 *                               уже наложены backend'ом как override'ы).
 *   - montageByKeyId — { [key_id]: { price, quantity, unit } }.
 *   - serviceRows   — [{ id, preset, name, price, quantity, unit }].
 *   - materialRows  — дополнительные материалы (хранятся в offer.additional_materials,
 *                     независимо от расчётов — backend их не пересчитывает).
 *
 * `titleByCode` — устаревший параметр (шифр/названия берутся из ItemsBase).
 */
export function mapOfferResponseToKpView(offer, { titleByCode: _titleByCode } = {}) {
  const itemsKeyMap = getItemsAgIdKeyMap();
  const constructions = (offer.constructions || []).map((c) => {
    const cp = c.calc_params || {};
    const code = cp.Code || "";
    const cipher = resolveDisplayCipher(code, itemsKeyMap);
    const sectionId = cp.SectionId || sectionIdFromCode(code);
    const meta = resolveConstructionText(cp, { cipher, sectionId });
    const shortTitle = meta.title;
    const description = meta.description || "";
    const displayTitle =
      itemsBaseTableName({ title: shortTitle, description }) || cipher || "—";
    return {
      key_id: c.id,
      title: displayTitle,
      description,
      short_title: shortTitle,
      catalog_id: meta.catalogId ?? null,
      type: constructionTypeFromCalcParams(cp),
      section_id: sectionId,
      ag_id: meta.ag_id || cipher,
      step: Number(cp.step) || 600,
      weight: null,
      imgBlack: null,
      lenX: Number(cp.LenX) || 0,
      lenY: Number(cp.LenY) || 0,
      lenZ: Number(cp.LenZ) || 0,
      AddCeilShift: Number(cp.AddCeilShift) || 0,
    };
  });

  const materialsByConstruction = (offer.constructions || []).map((c) => ({
    key_id: c.id,
    data: Array.isArray(c.materials) ? c.materials : [],
  }));

  const montageByKeyId = {};
  for (const c of offer.constructions || []) {
    const montageArr = Array.isArray(c.montage) ? c.montage : [];
    // Мы храним на бэке весь массив Service[], но UI в карточке поддерживает
    // одну строку «Монтаж» → берём первую.
    const first = montageArr[0];
    if (first) {
      // price === 0 (или null/undefined) трактуем как «не задано» — на бэк
      // пустое поле уходит как parseNumber("") === 0, и при следующей загрузке
      // мы должны заново подставить ставку из kpSettings, а не показать "0".
      const rawPrice = first.price;
      const price =
        rawPrice == null || Number(rawPrice) === 0 ? "" : String(rawPrice);
      montageByKeyId[c.id] = {
        price,
        quantity:
          first.count !== undefined && first.count !== null ? String(first.count) : "",
        unit: first.unit || "",
      };
    }
  }

  return {
    form: mapApiToForm(offer),
    constructions,
    materialsByConstruction,
    montageByKeyId,
    serviceRows: mapServicesToRows(offer.services),
    materialRowsByKeyId: mapAdditionalMaterialsToRows(offer.additional_materials),
    kpSettings: mapKpSettingsFromApi(offer.kp_settings),
    grandTotalDiscounts: mapGrandTotalDiscountsFromApi(offer.kp_settings),
    grandTotalDiscountAmounts: mapGrandTotalDiscountAmountsFromApi(
      offer.kp_settings,
    ),
  };
}

/**
 * Состояние калькулятора из GET /api/offers/:id (режим редактирования черновика КП).
 */
export function mapOfferToCalculatorState(offer, options) {
  const view = mapOfferResponseToKpView(offer, options);
  const constrToCalcToSent = (offer.constructions || [])
    .map((c) => c.calc_params)
    .filter(Boolean);
  return {
    constrToCalc: view.constructions,
    constrToCalcToSent,
    materialsByConstruction: view.materialsByConstruction,
    tableConstrToCalc: view.constructions.length > 0 ? {} : null,
  };
}

/** Синхронизация zustand-калькулятора из calcTables КП (loadKpEditState). */
export function buildCalculatorSyncFromKp({ calcTables, constrToCalcToSent }) {
  const constrToCalc = calcTables?.ConstrToCalc ?? [];
  const hasConstr = constrToCalc.length > 0;
  return {
    constrToCalc,
    constrToCalcToSent: constrToCalcToSent ?? [],
    materialsByConstruction: calcTables?.materialsByConstruction ?? [],
    tableConstrToCalc: hasConstr ? (calcTables?.tableConstrToCalc ?? {}) : null,
  };
}

// ─── draft sync (калькулятор → черновик КП без финального «Сохранить») ───────

/**
 * PATCH при «Вернуться в КП»: конструкции из калькулятора + форма/услуги/доп. материалы
 * из kpSnapshot (несохранённые правки на странице КП).
 */
export function buildDraftSyncFromCalculator({
  constrToCalcToSent,
  constrToCalc = null,
  materialsByConstruction,
  kpSnapshot = null,
}) {
  const snapshotKpSettings = kpSnapshot?.kpSettings;
  const oldKeyIds = kpSnapshot?.calcTables?.ConstrToCalc?.map((c) => c.key_id) || [];
  const montageByKeyId = kpSnapshot?.montageByKeyId || {};

  const constructions = (constrToCalcToSent || []).map((calcParams, i) => {
    const materials = materialsByConstruction?.[i]?.data || [];
    const legacyKeyId = oldKeyIds[i];
    const montageRow = legacyKeyId ? montageByKeyId[legacyKeyId] : null;
    const montage = montageRow
      ? [
          {
            name: "Монтаж",
            price: parseNumber(montageRow.price),
            count: parseNumber(montageRow.quantity),
            unit: montageRow.unit || "",
          },
        ]
      : [];
    return {
      calc_params: mergeUiDisplayIntoCalcParams(
        calcParams,
        (constrToCalc || [])[i],
      ),
      materials,
      montage,
    };
  });

  const payload = { constructions };

  if (kpSnapshot?.form) {
    payload.form = mapFormToApi(kpSnapshot.form);
  }
  if (kpSnapshot?.serviceRows) {
    payload.services = kpSnapshot.serviceRows.map(mapServiceRowToApi).filter(Boolean);
  }
  if (kpSnapshot?.materialRowsByKeyId) {
    const flat = [];
    for (const [keyId, rows] of Object.entries(kpSnapshot.materialRowsByKeyId)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const mapped = mapMaterialRowToApi(row, keyId);
        if (mapped) flat.push(mapped);
      }
    }
    payload.additional_materials = flat;
  } else if (kpSnapshot?.materialRows) {
    payload.additional_materials = kpSnapshot.materialRows
      .map((r) => mapMaterialRowToApi(r))
      .filter(Boolean);
  }
  if (snapshotKpSettings || kpSnapshot?.grandTotalDiscounts || kpSnapshot?.grandTotalDiscountAmounts) {
    payload.kp_settings = normalizeKpSettings({
      ...(snapshotKpSettings ?? {}),
      grand_total_discounts: kpSnapshot?.grandTotalDiscounts,
      grand_total_discount_amounts: kpSnapshot?.grandTotalDiscountAmounts,
    });
  }

  return payload;
}

// ─── update ─────────────────────────────────────────────────────────────────

/**
 * Собирает тело PATCH /api/offers/:id из текущего состояния KpPage.
 * Отправляем весь снимок (form + services + constructions со всеми материалами и монтажом),
 * backend заменяет конструкции атомарно.
 */
export function buildUpdateOfferPayload({
  form,
  constructions,              // UI-метаданные (ConstrToCalc-shaped)
  materialsByConstruction,    // [{ key_id, data }]
  montageByKeyId,             // { key_id: { price, quantity, unit } }
  serviceRows,                // [{ id, preset, name, price, quantity, unit }]
  materialRowsByKeyId,        // { [key_id]: [{ id, name, price, quantity, unit }] } — доп. материалы по конструкциям
  /** @deprecated Используй materialRowsByKeyId. */
  materialRows,               // [{ id, name, price, quantity, unit }] — доп. материалы (устаревшее, плоский список)
  kpSettings = null,          // { floor, ceiling, cladding, partition } | null
  originalConstructionsFromOffer, // Offer.constructions из getOffer — чтобы достать calc_params
  /** Параллельный массив calc_params (калькулятор / kpSnapshot.constrToCalcToSent). */
  constrToCalcToSent = null,
}) {
  const calcParamsById = new Map(
    (originalConstructionsFromOffer || []).map((c) => [c.id, c.calc_params])
  );
  const sentList = Array.isArray(constrToCalcToSent) ? constrToCalcToSent : [];

  const constructionsPayload = (constructions || []).map((ui, index) => {
    const calcParams = resolveCalcParamsForConstruction(ui, index, {
      calcParamsById,
      sentList,
    });
    const materials =
      materialsByConstruction.find((m) => m.key_id === ui.key_id)?.data || [];
    const montageRow = montageByKeyId?.[ui.key_id];
    const montage = montageRow
      ? [
          {
            name: "Монтаж",
            price: parseNumber(montageRow.price),
            count: parseNumber(montageRow.quantity),
            unit: montageRow.unit || "",
          },
        ]
      : [];
    return {
      calc_params: calcParams,
      materials,
      montage,
    };
  });

  // Разворачиваем materialRowsByKeyId в плоский массив с construction_key_id.
  let additionalMaterialsFlat = [];
  if (materialRowsByKeyId && typeof materialRowsByKeyId === "object") {
    for (const [keyId, rows] of Object.entries(materialRowsByKeyId)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const mapped = mapMaterialRowToApi(row, keyId);
        if (mapped) additionalMaterialsFlat.push(mapped);
      }
    }
  } else if (Array.isArray(materialRows)) {
    // Обратная совместимость: плоский список без привязки к конструкции.
    additionalMaterialsFlat = materialRows.map((r) => mapMaterialRowToApi(r)).filter(Boolean);
  }

  return {
    form: form ? mapFormToApi(form) : undefined,
    services: (serviceRows || []).map(mapServiceRowToApi).filter(Boolean),
    additional_materials: additionalMaterialsFlat,
    kp_settings: kpSettings ? normalizeKpSettings(kpSettings) : null,
    constructions: constructionsPayload,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * calc_params для PATCH: БД по key_id → массив из калькулятора по индексу/Code → UI-карточка.
 */
function resolveCalcParamsForConstruction(ui, index, { calcParamsById, sentList }) {
  const fromDb = calcParamsById.get(ui.key_id);
  if (fromDb) return mergeUiDisplayIntoCalcParams(fromDb, ui);

  if (sentList[index]) {
    return mergeUiDisplayIntoCalcParams(sentList[index], ui);
  }

  const code = String(ui.ag_id ?? "").trim();
  if (code) {
    const fromSent = sentList.find((p) => p && String(p.Code) === code);
    if (fromSent) return mergeUiDisplayIntoCalcParams(fromSent, ui);
  }

  return mergeUiDisplayIntoCalcParams(uiCardToCalcParams(ui), ui);
}

/** Минимальный calc_params из полей карточки KpPage (если нет снимка калькулятора). */
function uiCardToCalcParams(ui) {
  const lenX = Number(ui.lenX) || 0;
  const lenY = Number(ui.lenY) || 0;
  const lenZ = Number(ui.lenZ) || 0;
  const sectionId = ui.section_id || sectionIdFromCode(ui.ag_id) || "F";
  const { area, perimeter } = calculateAreaAndPerimeter(
    lenX,
    lenY,
    lenZ,
    sectionId,
  );
  const params = {
    Code: String(ui.ag_id ?? "").trim(),
    LenX: lenX,
    LenY: lenY,
    LenZ: lenZ,
    AddCeilShift: Number(ui.AddCeilShift) || 0,
    step: Number(ui.step) || 600,
    dframe: false,
    Area: area,
    Perimeter: perimeter,
    Openings: [],
    SectionId: sectionId,
  };
  return mergeUiDisplayIntoCalcParams(params, ui);
}

/** Собирает constrToCalcToSent для save: калькулятор, snapshot, затем ref оффера. */
export function pickConstrToCalcToSentForSave({
  constructions,
  originalConstructionsFromOffer,
  calculatorSent,
  snapshotSent,
}) {
  const list = constructions || [];
  const n = list.length;
  if (n === 0) return [];

  const pick = (sent) =>
    Array.isArray(sent) && sent.length === n ? sent : null;

  const fromCalc = pick(calculatorSent);
  if (fromCalc) return fromCalc;

  const fromSnap = pick(snapshotSent);
  if (fromSnap) return fromSnap;

  const byId = new Map(
    (originalConstructionsFromOffer || []).map((c) => [c.id, c.calc_params]),
  );
  return list.map((ui) => byId.get(ui.key_id) ?? null);
}

function mapFormToApi(form) {
  return {
    manager_name: form.manager || null,
    phone: form.phone || null,
    email: form.email || null,
    office_address: form.officeAddress || null,
    region: form.region || null,
    kp_date: form.date || null,
    object_name: form.object || null,
  };
}

function mapApiToForm(offer) {
  return {
    manager: offer.manager_name || "",
    phone: offer.phone || "",
    email: offer.email || "",
    officeAddress: offer.office_address || "",
    region: offer.region || "",
    date: offer.kp_date || "",
    object: offer.object_name || "",
  };
}

function mapServiceRowToApi(row) {
  if (!row) return null;
  const price = parseNumber(row.price);
  const count = parseNumber(row.quantity);
  // пустые и без названия строки не сохраняем
  if (!row.name && price === 0 && count === 0) return null;
  const id = row.id != null ? String(row.id).trim() : "";
  return {
    // id нужен для ключей скидок итога (`service-${id}`) после reload.
    ...(id ? { id } : {}),
    name: row.name || "",
    price,
    count,
    unit: row.unit || "",
  };
}

/**
 * UI-строка доп. материала → API-формат.
 * Пустые строки (без имени, цены и количества) не сохраняем.
 * @param {object} row
 * @param {string} [constructionKeyId] — key_id конструкции для привязки.
 */
function mapMaterialRowToApi(row, constructionKeyId) {
  if (!row) return null;
  const price = parseNumber(row.price);
  const count = parseNumber(row.quantity);
  if (!row.name && price === 0 && count === 0) return null;
  const article = String(row.sourceArticle ?? "").trim();
  const id = row.id != null ? String(row.id).trim() : "";
  return {
    // id нужен для ключей скидок итога (`addmat-${keyId}-${id}`) после reload.
    ...(id ? { id } : {}),
    name: row.name || "",
    price,
    count,
    unit: row.unit || "",
    ...(article ? { source_article: article } : {}),
    ...(constructionKeyId ? { construction_key_id: constructionKeyId } : {}),
  };
}

/**
 * additional_materials из ответа API → materialRowsByKeyId: { [key_id]: rows[] }.
 * Каждый элемент массива может содержать construction_key_id для привязки к конструкции.
 * Элементы без construction_key_id игнорируются (legacy или сброшенные).
 */
function mapAdditionalMaterialsToRows(additionalMaterials) {
  const arr = Array.isArray(additionalMaterials) ? additionalMaterials : [];
  const result = {};
  arr.forEach((m, i) => {
    const keyId = m.construction_key_id;
    if (!keyId) return;
    if (!result[keyId]) result[keyId] = [];
    result[keyId].push({
      id:
        m.id ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `mat-${i}-${Date.now()}`),
      name: m.name || "",
      price: m.price !== undefined && m.price !== null ? String(m.price) : "",
      quantity: m.count !== undefined && m.count !== null ? String(m.count) : "",
      unit: m.unit || "",
      sourceArticle: m.source_article ? String(m.source_article) : "",
    });
  });
  return result;
}

function mapServicesToRows(services) {
  const rows = (Array.isArray(services) ? services : []).map((s, i) => ({
    id: s.id || `svc-${i}-${Date.now()}`,
    preset: s.name === "Доставка",
    name: s.name || "",
    price: s.price !== undefined && s.price !== null ? String(s.price) : "",
    quantity: s.count !== undefined && s.count !== null ? String(s.count) : "",
    unit: s.unit || "",
  }));
  // всегда должна быть строка Доставка (preset), даже если её нет в ответе
  if (!rows.some((r) => r.preset)) {
    rows.unshift({
      id: "delivery",
      preset: true,
      name: "Доставка",
      price: "",
      quantity: "",
      unit: "",
    });
  }
  return rows;
}

const KP_SETTINGS_KEYS = ["floor", "ceiling", "cladding", "partition"];
const GRAND_TOTAL_DISCOUNT_SECTIONS = [
  "constructions",
  "montage",
  "services",
  "additionalMaterials",
];

export function emptyGrandTotalDiscounts() {
  return {
    constructions: {},
    montage: {},
    services: {},
    additionalMaterials: {},
  };
}

export function emptyGrandTotalDiscountAmounts() {
  return {
    constructions: 0,
    montage: 0,
    services: 0,
    additionalMaterials: 0,
  };
}

/** Нормализация карты скидок % из snapshot / kp_settings. */
export function normalizeGrandTotalDiscounts(raw) {
  const base = emptyGrandTotalDiscounts();
  if (!raw || typeof raw !== "object") return base;
  for (const section of GRAND_TOTAL_DISCOUNT_SECTIONS) {
    const map = raw[section];
    if (!map || typeof map !== "object") continue;
    const next = {};
    for (const [key, value] of Object.entries(map)) {
      if (value == null || value === "") continue;
      next[String(key)] = String(value);
    }
    base[section] = next;
  }
  return base;
}

/** Суммы скидок (₽) по секциям — для PDF и восстановления UI. */
export function normalizeGrandTotalDiscountAmounts(raw) {
  const base = emptyGrandTotalDiscountAmounts();
  if (!raw || typeof raw !== "object") return base;
  for (const section of GRAND_TOTAL_DISCOUNT_SECTIONS) {
    const n = Number(raw[section]);
    base[section] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return base;
}

/**
 * Нормализуем kpSettings перед отправкой: на фронте поля хранятся строками
 * (значение <input type="number">) — кладём их в payload как есть, отсутствующие
 * поля заполняем пустой строкой. Backend хранит JSON «как есть».
 */
function normalizeKpSettings(kpSettings) {
  if (!kpSettings || typeof kpSettings !== "object") return null;
  const out = {};
  for (const key of KP_SETTINGS_KEYS) {
    const value = kpSettings[key];
    out[key] = value === undefined || value === null ? "" : String(value);
  }
  const discounts = normalizeGrandTotalDiscounts(
    kpSettings.grand_total_discounts ?? kpSettings.grandTotalDiscounts,
  );
  const hasAnyDiscount = GRAND_TOTAL_DISCOUNT_SECTIONS.some(
    (section) => Object.keys(discounts[section]).length > 0,
  );
  if (hasAnyDiscount) {
    out.grand_total_discounts = discounts;
  }
  const amounts = normalizeGrandTotalDiscountAmounts(
    kpSettings.grand_total_discount_amounts ??
      kpSettings.grandTotalDiscountAmounts,
  );
  const hasAnyAmount = GRAND_TOTAL_DISCOUNT_SECTIONS.some(
    (section) => amounts[section] > 0,
  );
  if (hasAnyAmount) {
    out.grand_total_discount_amounts = amounts;
  }
  return out;
}

/**
 * kp_settings из ответа API → состояние KpPage (строки для контролируемых
 * input'ов). Если поле отсутствует, ставим "" — чтобы input был controlled.
 */
function mapKpSettingsFromApi(apiKpSettings) {
  const src =
    apiKpSettings && typeof apiKpSettings === "object" ? apiKpSettings : {};
  const out = {};
  for (const key of KP_SETTINGS_KEYS) {
    const value = src[key];
    out[key] = value === undefined || value === null ? "" : String(value);
  }
  return out;
}

/** Скидки итога из kp_settings API. */
export function mapGrandTotalDiscountsFromApi(apiKpSettings) {
  const src =
    apiKpSettings && typeof apiKpSettings === "object" ? apiKpSettings : {};
  return normalizeGrandTotalDiscounts(src.grand_total_discounts);
}

/** Суммы скидок (₽) из kp_settings API. */
export function mapGrandTotalDiscountAmountsFromApi(apiKpSettings) {
  const src =
    apiKpSettings && typeof apiKpSettings === "object" ? apiKpSettings : {};
  return normalizeGrandTotalDiscountAmounts(src.grand_total_discount_amounts);
}

function parseNumber(s) {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const normalized = String(s).replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}


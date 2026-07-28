import { useEffect, useState } from "react";
import {
  convertUnits,
  filterVariable,
  isM2Units,
} from "../../utils/formatters";
import {
  effectiveKpQuantity,
  formatMaterialQuantity,
  isPackPricedMaterial,
  kpQuantityInputValue,
  materialDisplayUnits,
} from "../../utils/materialPackUnits";
import {
  getPriceName,
  getPricePerM2,
  getPricePerUnit,
  usePriceData,
} from "../../services/priceApi";
import { KpNarrowExpandableRow } from "../kp/KpNarrowExpandableRow";
import { useCalcConstructionCardsViewport } from "../../hooks/useCalcConstructionCardsViewport";
import { useKpDiscountMultiSelect } from "../../hooks/useKpDiscountMultiSelect";
import { useKpExpandedRow } from "../../hooks/useKpExpandedRow";
import { useKpNarrowViewport } from "../../hooks/useKpNarrowViewport";
import "./MaterialsList.css";

export const formatRub = (value) => {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Read-only сумма на КП: при отсутствии расчёта — 0,00, не прочерк. */
export const formatKpComputedSum = (value) => formatRub(value ?? 0);

/** Те же правила, что ввод цены/количества на КП (пробелы, запятая). */
export function parseKpDecimal(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Сумма строки «Монтаж» (цена × количество) или null, если данные неполные. */
export function montageLineProductRub(row) {
  if (!row || typeof row !== "object") return null;
  const p = parseKpDecimal(row.price);
  const q = parseKpDecimal(row.quantity);
  if (p === null || q === null) return null;
  return p * q;
}

/** Цены строки: вручную на КП (Kp*) или из прайса по артикулу. */
export function effectiveMaterialPrices(material, pricePerM2, pricePerUnit) {
  const kpM2 = parseKpDecimal(material.KpPricePerM2);
  const kpUnit = parseKpDecimal(material.KpPricePerUnit);
  return {
    effM2: kpM2 !== null ? kpM2 : pricePerM2,
    effUnit: kpUnit !== null ? kpUnit : pricePerUnit,
  };
}

/** Поле override цены на КП в зависимости от ед. изм. строки. */
export function kpPriceFieldForMaterial(material) {
  return isM2Units(material?.Units) ? "KpPricePerM2" : "KpPricePerUnit";
}

/** Цена из прайса для ед. изм. строки. */
export function catalogPriceForMaterial(material, pricePerM2, pricePerUnit) {
  return isM2Units(material?.Units) ? pricePerM2 : pricePerUnit;
}

/** Эффективная цена одной колонкой (Kp* или прайс). */
export function effectiveSingleMaterialPrice(
  material,
  pricePerM2,
  pricePerUnit
) {
  const { effM2, effUnit } = effectiveMaterialPrices(
    material,
    pricePerM2,
    pricePerUnit
  );
  return isM2Units(material?.Units) ? (effM2 ?? effUnit) : effUnit;
}

const lineSumRub = (material, pricePerM2, pricePerUnit, { forKp = false } = {}) => {
  const { effM2, effUnit } = effectiveMaterialPrices(
    material,
    pricePerM2,
    pricePerUnit
  );
  const units = material.Units;
  const qty = effectiveKpQuantity(material, { forKp });
  if (qty == null || !Number.isFinite(qty)) return null;
  if (isM2Units(units)) {
    if (effM2 != null) return qty * effM2;
    if (effUnit != null) return qty * effUnit;
    return null;
  }
  if (forKp && isPackPricedMaterial(material)) {
    if (effUnit != null) return qty * effUnit;
    return null;
  }
  if (effUnit != null) {
    return qty * effUnit;
  }
  return null;
};

/** Сумма в ₽ по списку материалов (те же правила, что колонка «сумма»). */
export function computeTotalRubForMaterialsData(data, { forKp = false } = {}) {
  if (!Array.isArray(data) || data.length === 0) return 0;
  return data.reduce((acc, Material) => {
    const codeRaw = Material.Code != null ? String(Material.Code).trim() : "";
    const pricePerM2 = getPricePerM2(codeRaw);
    const pricePerUnit = getPricePerUnit(codeRaw);
    const sumRub = lineSumRub(Material, pricePerM2, pricePerUnit, { forKp });
    return typeof sumRub === "number" && !Number.isNaN(sumRub)
      ? acc + sumRub
      : acc;
  }, 0);
}

/** Сумма в ₽ по всем конструкциям (материалы по key_id). */
export function computeGrandTotalRubForConstructions(
  constructions,
  materialsByConstruction,
  { forKp = false } = {},
) {
  if (!Array.isArray(constructions) || constructions.length === 0) return 0;
  if (!Array.isArray(materialsByConstruction)) return 0;
  return constructions.reduce((sum, constRItem) => {
    const matEntry = materialsByConstruction.find(
      (m) => m.key_id === constRItem.key_id
    );
    return sum + computeTotalRubForMaterialsData(matEntry?.data ?? [], { forKp });
  }, 0);
}

/** Ключ для сводки: артикул, иначе название + ед.изм. */
export function materialAggregateKey(material) {
  const codeRaw = material?.Code != null ? String(material.Code).trim() : "";
  const displayCode = filterVariable(codeRaw);
  if (displayCode !== "---" && displayCode !== "") {
    return `code:${displayCode}`;
  }
  const name = String(material?.Name ?? material?.name ?? "")
    .trim()
    .toLowerCase();
  const units = String(material?.Units ?? "")
    .trim()
    .toLowerCase();
  return `name:${name}|units:${units}`;
}

/**
 * Все материалы КП по конструкциям: одинаковые позиции суммируются (кол-во).
 * Порядок — первое появление в materialsByConstruction.
 * Позиции без суммы (нет цены/кол-ва или сумма ≤ 0) не включаются.
 */
export function aggregateMaterialsAcrossConstructions(
  materialsByConstruction,
  { forKp = true } = {},
) {
  if (!Array.isArray(materialsByConstruction)) return [];
  const order = [];
  const byKey = new Map();

  for (const entry of materialsByConstruction) {
    const data = entry?.data;
    if (!Array.isArray(data)) continue;
    for (const material of data) {
      if (!material || typeof material !== "object") continue;
      const key = materialAggregateKey(material);
      const qty = effectiveKpQuantity(material, { forKp });
      const qtyNum = qty != null && Number.isFinite(qty) ? qty : 0;
      const rawQty = Number(material.Quantity);
      const rawQtyNum = Number.isFinite(rawQty) ? rawQty : 0;

      if (!byKey.has(key)) {
        order.push(key);
        byKey.set(key, {
          ...material,
          Quantity: rawQtyNum,
          KpQuantity: qtyNum,
        });
        continue;
      }

      const agg = byKey.get(key);
      const prevKp = parseKpDecimal(agg.KpQuantity) ?? 0;
      agg.Quantity = (Number(agg.Quantity) || 0) + rawQtyNum;
      agg.KpQuantity = prevKp + qtyNum;
    }
  }

  return order
    .map((key) => byKey.get(key))
    .filter((material) => {
      const codeRaw =
        material.Code != null ? String(material.Code).trim() : "";
      const sumRub = lineSumRub(
        material,
        getPricePerM2(codeRaw),
        getPricePerUnit(codeRaw),
        { forKp },
      );
      return typeof sumRub === "number" && !Number.isNaN(sumRub) && sumRub > 0;
    });
}

/**
 * Таблица со списком материалов
 * @param {object} [calculatedMaterials] — { data: Material[] } (одна группа, например из КП)
 * @param {Material[]} [data] — строки материалов; если задано, имеет приоритет над calculatedMaterials
 * @param {string} [tableId] — id таблицы (для экспорта; по умолчанию table2 для первой группы)
 * @param {string} [sectionTitle] — заголовок блока (по умолчанию «материалы»)
 * @param {boolean} [collapsible=false] — на КП: таблица свёрнута, раскрытие по клику на заголовок
 * @param {boolean} [editablePriceCells=false] — одна колонка «цена» как поле ввода (блок общестроительных материалов)
 * @param {(rowIndex: number, field: 'KpPricePerM2'|'KpPricePerUnit', value: string) => void} [onKpMaterialPriceChange]
 * @param {(rowIndex: number, value: string) => void} [onKpMaterialQuantityChange]
 * @param {boolean} [compositionOnly=false] — только артикул, название, ед.изм и кол-во (без цен и сумм)
 * @param {boolean} [forKp] — явно включить правила КП (кол-во/суммы); иначе как `collapsible && !compositionOnly`
 * @param {boolean} [summaryMode=false] — сводка КП: без колонок цен, после суммы — скидка и сумма скидки
 * @param {Record<string, string>} [discountByKey] — скидки % по ключу строки (controlled)
 * @param {(rowKey: string, value: string) => void | (patch: Record<string, string>) => void} [onDiscountChange]
 * @param {(totalDiscountRub: number) => void} [onDiscountTotalChange] — итог скидки по сводке
 */
const MaterialsList = ({
  calculatedMaterials,
  data: dataProp,
  tableId = "table2",
  sectionTitle = "Материалы конструкции",
  collapsible = false,
  editablePriceCells = false,
  onKpMaterialPriceChange,
  onKpMaterialQuantityChange,
  compositionOnly = false,
  forKp: forKpProp,
  summaryMode = false,
  discountByKey: discountByKeyProp,
  onDiscountChange,
  onDiscountTotalChange,
}) => {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [internalDiscountByKey, setInternalDiscountByKey] = useState({});
  const isNarrowScreen = useKpNarrowViewport();
  const calcCardsViewport = useCalcConstructionCardsViewport();
  const { expandedKey, toggleRow } = useKpExpandedRow();
  usePriceData();

  const discountControlled = typeof onDiscountChange === "function";
  const discountByKey = discountControlled
    ? (discountByKeyProp ?? {})
    : internalDiscountByKey;

  const data = dataProp ?? calculatedMaterials?.data;
  const hasData = Array.isArray(data) && data.length > 0;
  /** КП: collapsible без compositionOnly — упаковки для материалов «цена за уп». */
  const forKp = forKpProp ?? (collapsible && !compositionOnly);

  /** Одна модель строки: те же sumRub, что в колонке «сумма» — итог = их сумма. */
  const rowModels = hasData
    ? data.map((Material, index) => {
        const codeRaw =
          Material.Code != null ? String(Material.Code).trim() : "";
        const pricePerM2 = getPricePerM2(codeRaw);
        const pricePerUnit = getPricePerUnit(codeRaw);
        const sumRub = lineSumRub(Material, pricePerM2, pricePerUnit, { forKp });
        const rowKey = materialAggregateKey(Material) || `idx:${index}`;
        return { Material, pricePerM2, pricePerUnit, sumRub, rowKey };
      })
    : [];

  const summaryRowKeys = summaryMode ? rowModels.map((row) => row.rowKey) : [];
  const { selectOnPointer, keysForEdit, isSelected } =
    useKpDiscountMultiSelect(summaryRowKeys);

  const totalSumRub = computeTotalRubForMaterialsData(data, { forKp });
  const totalDiscountRub = summaryMode
    ? rowModels.reduce((acc, { sumRub, rowKey }) => {
        const discountPct = parseKpDecimal(discountByKey[rowKey]);
        if (
          discountPct == null ||
          typeof sumRub !== "number" ||
          Number.isNaN(sumRub)
        ) {
          return acc;
        }
        return acc + (sumRub * discountPct) / 100;
      }, 0)
    : 0;

  useEffect(() => {
    if (!summaryMode || typeof onDiscountTotalChange !== "function") return;
    onDiscountTotalChange(totalDiscountRub);
  }, [summaryMode, totalDiscountRub, onDiscountTotalChange]);

  const showBody = !collapsible || sectionOpen;
  /** Состав конструкции в калькуляторе: < 430px без колонки «артикул». */
  const compositionNarrow = compositionOnly && calcCardsViewport;
  /** Калькулятор: на узком экране убираем колонки из DOM. КП (collapsible/forKp): все колонки в DOM, скрытие через CSS. */
  const legacyNarrow = !collapsible && !compositionOnly && !forKp && isNarrowScreen;
  const singlePriceColumn = editablePriceCells && !summaryMode;
  const showPriceColumns = !compositionOnly && !summaryMode;
  const editableQuantityCells = !!onKpMaterialQuantityChange;
  const fullPriceColCount = summaryMode
    ? 8
    : singlePriceColumn
      ? 7
      : 8;
  const colSpan = compositionOnly
    ? compositionNarrow
      ? 3
      : 4
    : legacyNarrow
      ? 4
      : fullPriceColCount;
  const colInDom = compositionOnly || collapsible || forKp || !legacyNarrow;
  const showArticleCol = compositionOnly ? !compositionNarrow : colInDom;
  const hideOnKpNarrow =
    (collapsible || forKp) && !compositionOnly ? " kp-data-col--hide-narrow" : "";
  const kpNarrowDetail = (collapsible || forKp) && isNarrowScreen && !compositionOnly;
  const kpTableChrome = (collapsible || forKp) && !compositionOnly;

  const updateDiscount = (rowKey, value) => {
    const targets = summaryMode ? keysForEdit(rowKey) : [rowKey];
    if (targets.length > 1) {
      const patch = {};
      for (const key of targets) patch[key] = value;
      if (discountControlled) {
        onDiscountChange(patch);
        return;
      }
      setInternalDiscountByKey((prev) => ({ ...prev, ...patch }));
      return;
    }
    if (discountControlled) {
      onDiscountChange(rowKey, value);
      return;
    }
    setInternalDiscountByKey((prev) => ({ ...prev, [rowKey]: value }));
  };

  const collapsibleTitle = collapsible ? (
    <span className="kp-collapsible-title-row">
      <span className="kp-collapsible-title-inner">
        <span
          className={`kp-collapsible-chevron${
            sectionOpen ? " kp-collapsible-chevron--expanded" : ""
          }`}
          aria-hidden
        />
        <span>{sectionTitle}</span>
      </span>
      <span className="kp-collapsible-title-sum" aria-hidden>
        {formatRub(hasData ? totalSumRub : 0)}
      </span>
    </span>
  ) : null;

  return (
    <div className="tbl-in materials-data-table">
      {collapsible && (
        <button
          type="button"
          className="kp-section-collapsible-toggle"
          aria-expanded={sectionOpen}
          onClick={() => setSectionOpen((v) => !v)}
        >
          {collapsibleTitle}
        </button>
      )}
      <table
        className={`data${kpTableChrome ? " kp-data-table--starts-with-column-headers" : ""}`}
        id={tableId}
        data-materials-table="true"
        {...(kpTableChrome
          ? {
              "data-export-section-title": sectionTitle,
              "data-erp-data-start-row": "1",
            }
          : {})}
      >
        {(!collapsible || showBody) && (
          <thead>
            {!collapsible && (
              <tr>
                <th
                  colSpan={colSpan}
                  className="materials-list__section-title-th"
                >
                  {sectionTitle}
                </th>
              </tr>
            )}
            {showBody && (
              <tr>
                {showArticleCol && (
                  <th className={hideOnKpNarrow.trim() || undefined}>артикул</th>
                )}
                <th className={kpTableChrome ? "kp-data-col--name" : undefined}>
                  название
                </th>
                {!compositionOnly && (
                  <th
                    className={`materials-list__col--hidden${hideOnKpNarrow}`}
                  />
                )}
                {colInDom && compositionOnly && (
                  <th className={hideOnKpNarrow.trim() || undefined}>ед.изм</th>
                )}
                {colInDom && (
                  <th className={hideOnKpNarrow.trim() || undefined}>кол-во</th>
                )}
                {colInDom && !compositionOnly && (
                  <th className={hideOnKpNarrow.trim() || undefined}>ед.изм</th>
                )}
                {colInDom && showPriceColumns && singlePriceColumn && (
                  <th className={hideOnKpNarrow.trim() || undefined}>цена</th>
                )}
                {colInDom && showPriceColumns && !singlePriceColumn && (
                  <th className={hideOnKpNarrow.trim() || undefined}>
                    цена, ₽/м²
                  </th>
                )}
                {colInDom && showPriceColumns && !singlePriceColumn && (
                  <th className={hideOnKpNarrow.trim() || undefined}>
                    цена, ₽/ед.
                  </th>
                )}
                {colInDom && !compositionOnly && (
                  <th className={kpTableChrome ? "kp-data-col--sum" : undefined}>
                    сумма, ₽
                  </th>
                )}
                {colInDom && summaryMode && (
                  <th className={hideOnKpNarrow.trim() || undefined}>скидка</th>
                )}
                {colInDom && summaryMode && (
                  <th className={hideOnKpNarrow.trim() || undefined}>
                    сумма скидки
                  </th>
                )}
              </tr>
            )}
          </thead>
        )}
        {showBody && (
          <tbody>
            {hasData ? (
              rowModels.map(({ Material, pricePerM2, pricePerUnit, sumRub, rowKey }, index) => {
                const codeRaw =
                  Material.Code != null ? String(Material.Code).trim() : "";
                const priceName = compositionOnly ? "" : getPriceName(codeRaw);
                const materialName =
                  priceName !== ""
                    ? priceName
                    : Material.Name != null && String(Material.Name).trim() !== ""
                    ? String(Material.Name).trim()
                    : "—";
                const kpPriceField = kpPriceFieldForMaterial(Material);
                const catalogPrice = catalogPriceForMaterial(
                  Material,
                  pricePerM2,
                  pricePerUnit
                );
                const kpPriceRaw = Material[kpPriceField];
                const singlePriceDisplayRub = formatRub(
                  effectiveSingleMaterialPrice(
                    Material,
                    pricePerM2,
                    pricePerUnit
                  )
                );
                const discountRaw = discountByKey[rowKey] ?? "";
                const discountPct = parseKpDecimal(discountRaw);
                const discountSumRub =
                  discountPct != null &&
                  typeof sumRub === "number" &&
                  !Number.isNaN(sumRub)
                    ? (sumRub * discountPct) / 100
                    : null;
                const discountInput = summaryMode ? (
                  <input
                    type="text"
                    className={`kp-page__services-input${
                      isSelected(rowKey)
                        ? " kp-discount-input--selected"
                        : ""
                    }`}
                    value={discountRaw}
                    onMouseDown={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                      }
                    }}
                    onClick={(e) => selectOnPointer(rowKey, e)}
                    onFocus={() => {
                      if (!isSelected(rowKey)) {
                        selectOnPointer(rowKey, {});
                      }
                    }}
                    onChange={(e) => updateDiscount(rowKey, e.target.value)}
                    placeholder="0"
                    aria-label={`Скидка, %, ${materialName}`}
                  />
                ) : null;
                const discountSumDisplay = formatKpComputedSum(discountSumRub);
                const singlePriceEditInput = editablePriceCells ? (
                  <input
                    type="text"
                    className="kp-page__services-input"
                    value={
                      kpPriceRaw != null && kpPriceRaw !== ""
                        ? String(kpPriceRaw)
                        : ""
                    }
                    onChange={(e) =>
                      onKpMaterialPriceChange?.(
                        index,
                        kpPriceField,
                        e.target.value
                      )
                    }
                    placeholder={
                      catalogPrice != null ? formatRub(catalogPrice) : formatRub(0)
                    }
                    aria-label={`Цена, ${materialName}`}
                  />
                ) : null;
                const priceM2Input = editablePriceCells ? (
                  <input
                    type="text"
                    className="kp-page__services-input"
                    value={
                      Material.KpPricePerM2 != null &&
                      Material.KpPricePerM2 !== ""
                        ? String(Material.KpPricePerM2)
                        : ""
                    }
                    onChange={(e) =>
                      onKpMaterialPriceChange?.(
                        index,
                        "KpPricePerM2",
                        e.target.value
                      )
                    }
                    placeholder={
                      pricePerM2 != null ? formatRub(pricePerM2) : formatRub(0)
                    }
                    aria-label={`Цена за м², ${materialName}`}
                  />
                ) : (
                  formatRub(pricePerM2)
                );
                const priceUnitInput = editablePriceCells ? (
                  <input
                    type="text"
                    className="kp-page__services-input"
                    value={
                      Material.KpPricePerUnit != null &&
                      Material.KpPricePerUnit !== ""
                        ? String(Material.KpPricePerUnit)
                        : ""
                    }
                    onChange={(e) =>
                      onKpMaterialPriceChange?.(
                        index,
                        "KpPricePerUnit",
                        e.target.value
                      )
                    }
                    placeholder={
                      pricePerUnit != null ? formatRub(pricePerUnit) : formatRub(0)
                    }
                    aria-label={`Цена за единицу, ${materialName}`}
                  />
                ) : (
                  formatRub(pricePerUnit)
                );
                const sumDisplay = editablePriceCells || editableQuantityCells ? (
                  <input
                    type="text"
                    readOnly
                    className="kp-page__services-input kp-page__services-input--computed"
                    value={formatKpComputedSum(sumRub)}
                    aria-label={`Сумма, ${materialName}`}
                  />
                ) : (
                  formatKpComputedSum(sumRub)
                );
                const quantityDisplay = formatMaterialQuantity(Material, { forKp });
                const quantityEditInput = editableQuantityCells ? (
                  <input
                    type="text"
                    className="kp-page__services-input"
                    value={kpQuantityInputValue(Material, { forKp })}
                    onChange={(e) =>
                      onKpMaterialQuantityChange?.(index, e.target.value)
                    }
                    placeholder={quantityDisplay === "—" ? "" : quantityDisplay}
                    aria-label={`Количество, ${materialName}`}
                  />
                ) : (
                  quantityDisplay
                );
                const showInputsInRow = !kpNarrowDetail;
                const detailFields = kpNarrowDetail
                  ? [
                      {
                        id: "article",
                        label: "Артикул",
                        children: filterVariable(Material.Code),
                      },
                      {
                        id: "units",
                        label: "Ед.изм",
                        children: materialDisplayUnits(Material, { forKp }),
                      },
                      {
                        id: "qty",
                        label: "Кол-во",
                        children: editableQuantityCells
                          ? quantityEditInput
                          : forKp
                            ? formatMaterialQuantity(Material, { forKp })
                            : convertUnits(Material),
                      },
                      ...(summaryMode
                        ? [
                            {
                              id: "sum",
                              label: "Сумма, ₽",
                              children: sumDisplay,
                            },
                            {
                              id: "discount",
                              label: "Скидка",
                              children: discountInput,
                            },
                            {
                              id: "discountSum",
                              label: "Сумма скидки",
                              children: discountSumDisplay,
                            },
                          ]
                        : [
                            ...(singlePriceColumn
                              ? [
                                  {
                                    id: "price",
                                    label: "Цена",
                                    children:
                                      singlePriceEditInput ?? singlePriceDisplayRub,
                                  },
                                ]
                              : [
                                  {
                                    id: "priceM2",
                                    label: "Цена, ₽/м²",
                                    children: priceM2Input,
                                  },
                                  {
                                    id: "priceUnit",
                                    label: "Цена, ₽/ед.",
                                    children: priceUnitInput,
                                  },
                                ]),
                            {
                              id: "sum",
                              label: "Сумма, ₽",
                              children: sumDisplay,
                            },
                          ]),
                    ]
                  : [];
                const rowCells = compositionOnly ? (
                  <>
                    {showArticleCol && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {filterVariable(Material.Code)}
                      </td>
                    )}
                    <td>{materialName}</td>
                    {colInDom && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {materialDisplayUnits(Material, { forKp: false })}
                      </td>
                    )}
                    {colInDom && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {convertUnits(Material)}
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    {colInDom && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {filterVariable(Material.Code)}
                      </td>
                    )}
                    <td
                      className={kpTableChrome ? "kp-data-col--name" : undefined}
                    >
                      {materialName}
                    </td>
                    <td
                      className={`materials-list__col--hidden${hideOnKpNarrow}`}
                    />
                    {colInDom && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {editableQuantityCells ? quantityEditInput : quantityDisplay}
                      </td>
                    )}
                    {colInDom && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {materialDisplayUnits(Material, { forKp })}
                      </td>
                    )}
                    {colInDom && showPriceColumns && singlePriceColumn && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {showInputsInRow && singlePriceEditInput
                          ? singlePriceEditInput
                          : singlePriceDisplayRub}
                      </td>
                    )}
                    {colInDom && showPriceColumns && !singlePriceColumn && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {showInputsInRow && editablePriceCells
                          ? priceM2Input
                          : formatRub(pricePerM2)}
                      </td>
                    )}
                    {colInDom && showPriceColumns && !singlePriceColumn && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {showInputsInRow && editablePriceCells
                          ? priceUnitInput
                          : formatRub(pricePerUnit)}
                      </td>
                    )}
                    {colInDom && (
                      <td
                        className={
                          kpTableChrome ? "kp-data-col--sum" : undefined
                        }
                      >
                        {showInputsInRow && (editablePriceCells || editableQuantityCells)
                          ? sumDisplay
                          : formatKpComputedSum(sumRub)}
                      </td>
                    )}
                    {colInDom && summaryMode && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {showInputsInRow ? discountInput : discountRaw || "—"}
                      </td>
                    )}
                    {colInDom && summaryMode && (
                      <td className={hideOnKpNarrow.trim() || undefined}>
                        {discountSumDisplay}
                      </td>
                    )}
                  </>
                );
                if (kpNarrowDetail) {
                  return (
                    <KpNarrowExpandableRow
                      key={rowKey}
                      rowKey={rowKey}
                      expandedKey={expandedKey}
                      onToggleRow={toggleRow}
                      narrow
                      colSpan={fullPriceColCount}
                      detailFields={detailFields}
                    >
                      {rowCells}
                    </KpNarrowExpandableRow>
                  );
                }
                return <tr key={rowKey}>{rowCells}</tr>;
              })
            ) : (
              <tr>
                <td colSpan={colSpan} className="materials-list__empty-message">
                  {calculatedMaterials != null || dataProp !== undefined
                    ? "Нет данных для отображения"
                    : "Загрузка..."}
                </td>
              </tr>
            )}
          </tbody>
        )}
        {showBody && hasData && !compositionOnly && (
          <tfoot>
            <tr>
              <td colSpan={colSpan} className="materials-list__footer-cell">
                <div className="materials-list__footer-inner">
                  <span>Стоимость</span>
                  <span className="materials-list__footer-sum">
                    {formatRub(totalSumRub)}
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

export default MaterialsList;

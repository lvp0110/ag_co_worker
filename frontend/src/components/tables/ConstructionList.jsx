import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCalcConstructionCardsViewport } from "../../hooks/useCalcConstructionCardsViewport";
import { filterVariable } from "../../utils/formatters";
import {
  isZipsItemsBaseConstruction,
  resolveConstructionTableText,
  shouldSkipSectionLabelPrefix,
} from "../../utils/itemsCatalog.js";
import MaterialsList, {
  aggregateMaterialsAcrossConstructions,
  computeGrandTotalRubForConstructions,
  computeTotalRubForMaterialsData,
  formatRub,
  montageLineProductRub,
  parseKpDecimal,
} from "./MaterialsList";
import KpDiscountSummaryTable from "./KpDiscountSummaryTable";
import { sectionLabelForConstruction } from "../../utils/constructionSection";
import { constructionDisplayCipher } from "../../utils/calcUlTapeFallback";
import { usePriceData } from "../../services/priceApi";
import "./ConstructionList.css";

function positiveLineSum(price, quantity) {
  const p = parseKpDecimal(price);
  const q = parseKpDecimal(quantity);
  if (p === null || q === null) return null;
  const sum = p * q;
  return sum > 0 ? sum : null;
}

function buildMontageSummaryRows(constructions, montageByKeyId) {
  if (!Array.isArray(constructions) || !montageByKeyId) return [];
  const rows = [];
  for (const c of constructions) {
    const row = montageByKeyId[c.key_id];
    if (!row) continue;
    const sumRub = montageLineProductRub(row);
    if (typeof sumRub !== "number" || !(sumRub > 0)) continue;
    const code = c.ag_id != null ? String(c.ag_id).trim() : "";
    rows.push({
      id: `montage-${c.key_id}`,
      name: code ? `Монтаж (${code})` : "Монтаж",
      quantity: row.quantity,
      unit: row.unit,
      sumRub,
    });
  }
  return rows;
}

function buildServicesSummaryRows(serviceRows) {
  if (!Array.isArray(serviceRows)) return [];
  return serviceRows
    .map((row) => {
      const sumRub = positiveLineSum(row.price, row.quantity);
      if (sumRub == null) return null;
      return {
        id: `service-${row.id}`,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        sumRub,
      };
    })
    .filter(Boolean);
}

function buildAdditionalMaterialsSummaryRows(materialRowsByKeyId) {
  if (!materialRowsByKeyId || typeof materialRowsByKeyId !== "object") {
    return [];
  }
  const rows = [];
  for (const [keyId, list] of Object.entries(materialRowsByKeyId)) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const sumRub = positiveLineSum(row.price, row.quantity);
      if (sumRub == null) continue;
      rows.push({
        id: `addmat-${keyId}-${row.id}`,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        sumRub,
      });
    }
  }
  return rows;
}

function GrandTotalLineLabel({
  label,
  expandable,
  expanded,
  controlsId,
  onToggle,
  buttonClassName = "construction-grand-total__line-label-button",
}) {
  if (!expandable) return label;
  return (
    <button
      type="button"
      className={buttonClassName}
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
    >
      <span
        className={`construction-grand-total__line-label-chevron${
          expanded
            ? " construction-grand-total__line-label-chevron--expanded"
            : ""
        }`}
        aria-hidden
      />
      <span>{label}</span>
    </button>
  );
}

function GrandTotalDiscountRow({
  label,
  amountRub,
  titleColSpan,
  lineLabelClass,
  lineAmountClass,
}) {
  if (!(amountRub > 0)) return null;
  return (
    <tr className="construction-grand-total__line construction-grand-total__line--next construction-grand-total__line--discount">
      <th colSpan={Math.max(1, titleColSpan - 1)} className={lineLabelClass}>
        {label}
      </th>
      <th className={lineAmountClass}>{formatRub(amountRub)}</th>
    </tr>
  );
}

function GrandTotalSummaryRow({
  open,
  titleColSpan,
  wrapId,
  children,
}) {
  return (
    <tr
      className="construction-grand-total__materials-summary-row"
      hidden={!open}
    >
      <td
        colSpan={titleColSpan}
        className="construction-grand-total__materials-summary-cell"
      >
        <div
          id={wrapId}
          className="construction-grand-total__materials-summary"
        >
          {children}
        </div>
      </td>
    </tr>
  );
}

/** Строка итога «Стоимость конструкций» (экспорт для КП: итог после блока «Услуги»). */
export function ConstructionGrandTotalBlock({
  readOnly,
  grandTotalRub,
  /** Итог монтажа по КП (передаётся только на странице КП). */
  montageGrandTotalRub,
  /** Итог блока доп. материалов по КП. */
  additionalMaterialsGrandTotalRub,
  /** Итог доп. услуг по КП (блок «Услуги»). */
  additionalServicesGrandTotalRub,
  /** Материалы по конструкциям — на КП клик по «Стоимость конструкций» открывает сводку. */
  materialsByConstruction,
  /** Конструкции + монтаж по key_id — сводка скидок по монтажу. */
  constructions,
  montageByKeyId,
  /** Строки блока «Услуги». */
  serviceRows,
  /** Доп. материалы по key_id. */
  materialRowsByKeyId,
  /** Скидки % по секциям итога: { constructions, montage, services, additionalMaterials }. */
  grandTotalDiscounts,
  /** (section, rowKey, value) — правка скидки в сводке. */
  onGrandTotalDiscountChange,
  /** Суммы скидок ₽ по секциям — для сохранения в kp_settings / PDF. */
  onGrandTotalDiscountAmountsChange,
  wrapClassName = "",
}) {
  const [openSections, setOpenSections] = useState({});
  const [constructionsDiscountRub, setConstructionsDiscountRub] = useState(0);
  const [montageDiscountRub, setMontageDiscountRub] = useState(0);
  const [servicesDiscountRub, setServicesDiscountRub] = useState(0);
  const [additionalMaterialsDiscountRub, setAdditionalMaterialsDiscountRub] =
    useState(0);

  const titleColSpan = readOnly ? 3 : 4;
  const grandTotalCardClass = readOnly ? " kp-table-card" : "";
  const showMontageRow = montageGrandTotalRub !== undefined;
  const showAdditionalMaterialsRow = additionalMaterialsGrandTotalRub !== undefined;
  const showServicesRow = additionalServicesGrandTotalRub !== undefined;
  const montagePart =
    typeof montageGrandTotalRub === "number" && !Number.isNaN(montageGrandTotalRub)
      ? montageGrandTotalRub
      : 0;
  const servicesPart =
    typeof additionalServicesGrandTotalRub === "number" &&
    !Number.isNaN(additionalServicesGrandTotalRub)
      ? additionalServicesGrandTotalRub
      : 0;
  const additionalMaterialsPart =
    typeof additionalMaterialsGrandTotalRub === "number" &&
    !Number.isNaN(additionalMaterialsGrandTotalRub)
      ? additionalMaterialsGrandTotalRub
      : 0;
  const constructionsGrossRub =
    typeof grandTotalRub === "number" && !Number.isNaN(grandTotalRub)
      ? grandTotalRub
      : 0;

  const normDiscount = (value) =>
    typeof value === "number" && !Number.isNaN(value) && value > 0 ? value : 0;

  const constructionsDiscount = normDiscount(constructionsDiscountRub);
  const montageDiscount = normDiscount(montageDiscountRub);
  const servicesDiscount = normDiscount(servicesDiscountRub);
  const additionalMaterialsDiscount = normDiscount(
    additionalMaterialsDiscountRub,
  );

  const overallTotalRub =
    constructionsGrossRub -
    constructionsDiscount +
    (showMontageRow ? montagePart - montageDiscount : 0) +
    (showAdditionalMaterialsRow
      ? additionalMaterialsPart - additionalMaterialsDiscount
      : 0) +
    (showServicesRow ? servicesPart - servicesDiscount : 0);

  // Не пушим нули при маунте: до отчёта дочерних сводок это затирало
  // суммы из API/snapshot и ломало PDF после сохранения.
  const discountAmountsReadyRef = useRef(false);
  useEffect(() => {
    if (typeof onGrandTotalDiscountAmountsChange !== "function") return;
    const anyPositive =
      constructionsDiscount > 0 ||
      montageDiscount > 0 ||
      servicesDiscount > 0 ||
      additionalMaterialsDiscount > 0;
    if (!discountAmountsReadyRef.current && !anyPositive) return;
    discountAmountsReadyRef.current = true;
    onGrandTotalDiscountAmountsChange({
      constructions: constructionsDiscount,
      montage: montageDiscount,
      services: servicesDiscount,
      additionalMaterials: additionalMaterialsDiscount,
    });
  }, [
    constructionsDiscount,
    montageDiscount,
    servicesDiscount,
    additionalMaterialsDiscount,
    onGrandTotalDiscountAmountsChange,
  ]);

  const { loaded: priceLoaded, selectedRegion } = usePriceData();

  const aggregatedMaterials = useMemo(
    () =>
      readOnly
        ? aggregateMaterialsAcrossConstructions(materialsByConstruction, {
            forKp: true,
          })
        : [],
    // Прайс грузится асинхронно: без priceLoaded/selectedRegion сводка остаётся пустой
    // после первого расчёта (фильтр «сумма > 0» отсекает строки без цены).
    [readOnly, materialsByConstruction, priceLoaded, selectedRegion],
  );
  const montageSummaryRows = useMemo(
    () =>
      readOnly ? buildMontageSummaryRows(constructions, montageByKeyId) : [],
    [readOnly, constructions, montageByKeyId],
  );
  const servicesSummaryRows = useMemo(
    () => (readOnly ? buildServicesSummaryRows(serviceRows) : []),
    [readOnly, serviceRows],
  );
  const additionalMaterialsSummaryRows = useMemo(
    () =>
      readOnly
        ? buildAdditionalMaterialsSummaryRows(materialRowsByKeyId)
        : [],
    [readOnly, materialRowsByKeyId],
  );

  const canToggleSummaries = readOnly;
  const toggleSection = useCallback((section) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);
  const isSectionOpen = (section) => !!openSections[section];

  const handleConstructionsDiscount = useCallback((total) => {
    setConstructionsDiscountRub(
      typeof total === "number" && !Number.isNaN(total) ? total : 0,
    );
  }, []);
  const handleMontageDiscount = useCallback((total) => {
    setMontageDiscountRub(
      typeof total === "number" && !Number.isNaN(total) ? total : 0,
    );
  }, []);
  const handleServicesDiscount = useCallback((total) => {
    setServicesDiscountRub(
      typeof total === "number" && !Number.isNaN(total) ? total : 0,
    );
  }, []);
  const handleAdditionalMaterialsDiscount = useCallback((total) => {
    setAdditionalMaterialsDiscountRub(
      typeof total === "number" && !Number.isNaN(total) ? total : 0,
    );
  }, []);

  const discounts = grandTotalDiscounts ?? {};
  const constructionsDiscountByKey = discounts.constructions ?? {};
  const montageDiscountByKey = discounts.montage ?? {};
  const servicesDiscountByKey = discounts.services ?? {};
  const additionalMaterialsDiscountByKey = discounts.additionalMaterials ?? {};

  const changeSectionDiscount = useCallback(
    (section) => (rowKey, value) => {
      onGrandTotalDiscountChange?.(section, rowKey, value);
    },
    [onGrandTotalDiscountChange],
  );

  const lineLabelClass = readOnly
    ? "construction-grand-total__line-label"
    : "construction-grand-total__line-label construction-grand-total__line-label--calc";
  const lineAmountClass = readOnly
    ? "construction-grand-total__line-amount"
    : "construction-grand-total__line-amount construction-grand-total__line-amount--calc";

  return (
    <div
      className={`tbl-in construction-grand-total-wrap${grandTotalCardClass}${
        wrapClassName ? ` ${wrapClassName}` : ""
      }`}
    >
      <table
        className="data"
        id="table-grand-total"
        data-export-all-rows="true"
      >
        <tbody>
          <tr className="construction-grand-total__line construction-grand-total__line--first">
            <th
              colSpan={Math.max(1, titleColSpan - 1)}
              className={lineLabelClass}
            >
              <GrandTotalLineLabel
                label="Стоимость конструкций"
                expandable={canToggleSummaries}
                expanded={isSectionOpen("constructions")}
                controlsId="table-kp-materials-summary-wrap"
                onToggle={() => toggleSection("constructions")}
              />
            </th>
            <th className={lineAmountClass}>
              {formatRub(constructionsGrossRub)}
            </th>
          </tr>
          <GrandTotalDiscountRow
            label="Скидка на конструкции"
            amountRub={constructionsDiscount}
            titleColSpan={titleColSpan}
            lineLabelClass={lineLabelClass}
            lineAmountClass={lineAmountClass}
          />
          {canToggleSummaries && (
            <GrandTotalSummaryRow
              open={isSectionOpen("constructions")}
              titleColSpan={titleColSpan}
              wrapId="table-kp-materials-summary-wrap"
            >
              <MaterialsList
                data={aggregatedMaterials}
                tableId="table-kp-materials-summary"
                sectionTitle="Все материалы"
                forKp
                summaryMode
                discountByKey={
                  onGrandTotalDiscountChange
                    ? constructionsDiscountByKey
                    : undefined
                }
                onDiscountChange={
                  onGrandTotalDiscountChange
                    ? changeSectionDiscount("constructions")
                    : undefined
                }
                onDiscountTotalChange={handleConstructionsDiscount}
              />
            </GrandTotalSummaryRow>
          )}

          {showMontageRow && (
            <>
              <tr className="construction-grand-total__line construction-grand-total__line--next">
                <th
                  colSpan={Math.max(1, titleColSpan - 1)}
                  className={lineLabelClass}
                >
                  <GrandTotalLineLabel
                    label="Стоимость монтажа"
                    expandable={canToggleSummaries}
                    expanded={isSectionOpen("montage")}
                    controlsId="table-kp-montage-summary-wrap"
                    onToggle={() => toggleSection("montage")}
                  />
                </th>
                <th className={lineAmountClass}>
                  {formatRub(montageGrandTotalRub)}
                </th>
              </tr>
              <GrandTotalDiscountRow
                label="Скидка на монтаж"
                amountRub={montageDiscount}
                titleColSpan={titleColSpan}
                lineLabelClass={lineLabelClass}
                lineAmountClass={lineAmountClass}
              />
              {canToggleSummaries && (
                <GrandTotalSummaryRow
                  open={isSectionOpen("montage")}
                  titleColSpan={titleColSpan}
                  wrapId="table-kp-montage-summary-wrap"
                >
                  <KpDiscountSummaryTable
                    rows={montageSummaryRows}
                    tableId="table-kp-montage-summary"
                    sectionTitle="Монтаж"
                    discountByKey={
                      onGrandTotalDiscountChange
                        ? montageDiscountByKey
                        : undefined
                    }
                    onDiscountChange={
                      onGrandTotalDiscountChange
                        ? changeSectionDiscount("montage")
                        : undefined
                    }
                    onDiscountTotalChange={handleMontageDiscount}
                  />
                </GrandTotalSummaryRow>
              )}
            </>
          )}

          {showServicesRow && (
            <>
              <tr className="construction-grand-total__line construction-grand-total__line--next">
                <th
                  colSpan={Math.max(1, titleColSpan - 1)}
                  className={lineLabelClass}
                >
                  <GrandTotalLineLabel
                    label="Стоимость дополнительных услуг"
                    expandable={canToggleSummaries}
                    expanded={isSectionOpen("services")}
                    controlsId="table-kp-services-summary-wrap"
                    onToggle={() => toggleSection("services")}
                  />
                </th>
                <th className={lineAmountClass}>
                  {formatRub(additionalServicesGrandTotalRub)}
                </th>
              </tr>
              <GrandTotalDiscountRow
                label="Скидка на дополнительные услуги"
                amountRub={servicesDiscount}
                titleColSpan={titleColSpan}
                lineLabelClass={lineLabelClass}
                lineAmountClass={lineAmountClass}
              />
              {canToggleSummaries && (
                <GrandTotalSummaryRow
                  open={isSectionOpen("services")}
                  titleColSpan={titleColSpan}
                  wrapId="table-kp-services-summary-wrap"
                >
                  <KpDiscountSummaryTable
                    rows={servicesSummaryRows}
                    tableId="table-kp-services-summary"
                    sectionTitle="Дополнительные услуги"
                    discountByKey={
                      onGrandTotalDiscountChange
                        ? servicesDiscountByKey
                        : undefined
                    }
                    onDiscountChange={
                      onGrandTotalDiscountChange
                        ? changeSectionDiscount("services")
                        : undefined
                    }
                    onDiscountTotalChange={handleServicesDiscount}
                  />
                </GrandTotalSummaryRow>
              )}
            </>
          )}

          {showAdditionalMaterialsRow && (
            <>
              <tr className="construction-grand-total__line construction-grand-total__line--next">
                <th
                  colSpan={Math.max(1, titleColSpan - 1)}
                  className={lineLabelClass}
                >
                  <GrandTotalLineLabel
                    label="Стоимость дополнительных материалов"
                    expandable={canToggleSummaries}
                    expanded={isSectionOpen("additionalMaterials")}
                    controlsId="table-kp-additional-materials-summary-wrap"
                    onToggle={() => toggleSection("additionalMaterials")}
                  />
                </th>
                <th className={lineAmountClass}>
                  {formatRub(additionalMaterialsGrandTotalRub)}
                </th>
              </tr>
              <GrandTotalDiscountRow
                label="Скидка на дополнительные материалы"
                amountRub={additionalMaterialsDiscount}
                titleColSpan={titleColSpan}
                lineLabelClass={lineLabelClass}
                lineAmountClass={lineAmountClass}
              />
              {canToggleSummaries && (
                <GrandTotalSummaryRow
                  open={isSectionOpen("additionalMaterials")}
                  titleColSpan={titleColSpan}
                  wrapId="table-kp-additional-materials-summary-wrap"
                >
                  <KpDiscountSummaryTable
                    rows={additionalMaterialsSummaryRows}
                    tableId="table-kp-additional-materials-summary"
                    sectionTitle="Дополнительные материалы"
                    discountByKey={
                      onGrandTotalDiscountChange
                        ? additionalMaterialsDiscountByKey
                        : undefined
                    }
                    onDiscountChange={
                      onGrandTotalDiscountChange
                        ? changeSectionDiscount("additionalMaterials")
                        : undefined
                    }
                    onDiscountTotalChange={handleAdditionalMaterialsDiscount}
                  />
                </GrandTotalSummaryRow>
              )}
            </>
          )}

          <tr className="construction-grand-total__total-row">
            <th
              colSpan={Math.max(1, titleColSpan - 1)}
              className={
                readOnly
                  ? "construction-grand-total__total-label"
                  : "construction-grand-total__total-label construction-grand-total__total-label--calc"
              }
            >
              Общий итог
            </th>
            <th
              className={
                readOnly
                  ? "construction-grand-total__total-amount"
                  : "construction-grand-total__total-amount construction-grand-total__total-amount--calc"
              }
            >
              {formatRub(overallTotalRub)}
            </th>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Размер в мм для ячейки таблицы */
function formatConstructionMm(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return String(n);
}

/**
 * Вторая величина: для стен/перегородок — высота (lenZ), для пола/потолка — длина (lenY).
 */
function constructionHeightMm({ lenY, lenZ }) {
  const z = lenZ != null && lenZ !== "" ? Number(lenZ) : NaN;
  if (!Number.isNaN(z) && z > 0) return lenZ;
  return lenY;
}

function constructionDimensionsMm(item) {
  const width = formatConstructionMm(item.lenX);
  const height = formatConstructionMm(constructionHeightMm(item));
  return `${width} x ${height}`;
}

function parseConstructionNumber(value) {
  if (value == null || value === "") return NaN;
  const normalized = String(value).replace(",", ".").trim();
  const numericMatch = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!numericMatch) return NaN;
  const parsed = Number(numericMatch[0]);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function constructionAreaM2(item) {
  const widthMm = parseConstructionNumber(item.lenX);
  const heightMm = parseConstructionNumber(constructionHeightMm(item));
  if (Number.isNaN(widthMm) || Number.isNaN(heightMm)) return NaN;
  if (widthMm <= 0 || heightMm <= 0) return NaN;
  return (widthMm * heightMm) / 1000000;
}

function formatConstructionAreaM2(item) {
  const area = constructionAreaM2(item);
  if (Number.isNaN(area)) return "—";
  return area.toFixed(1);
}

/** Имя в таблице — ItemsBase.description (без префиксов ЗИПС). */
function constructionDisplayTitle({ title }) {
  return title != null ? String(title).trim() : "";
}

/** Заголовок карточки: секция расчёта + название конструкции. */
function constructionCardHeading(item, calcParams) {
  const { ag_id: code } = item;
  const { title, shortTitle } = resolveConstructionTableText(item, calcParams);
  const displayTitle = constructionDisplayTitle({ title });
  const normalizedCode = code != null ? String(code).trim() : "";
  const looksLikeConstructionCode = /^AG\.[A-Z0-9._-]+$/i.test(
    String(displayTitle || "").trim()
  );
  const safeDisplayTitle =
    displayTitle !== "" &&
    displayTitle !== normalizedCode &&
    !looksLikeConstructionCode
      ? displayTitle
      : "";
  const constructionPart =
    safeDisplayTitle !== "" ? safeDisplayTitle : "Конструкция";
  const sectionLabel = sectionLabelForConstruction(item);
  const zips = isZipsItemsBaseConstruction({
    agId: code,
    shortTitle: shortTitle || item.short_title,
  });
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
}

/** Колонка «название» в legacy-таблице: не дублируем шифр, если title = ag_id. */
function constructionLegacyTitle(item, calcParams) {
  const { title } = resolveConstructionTableText(item, calcParams);
  const display = constructionDisplayTitle({ title });
  const code = String(item.ag_id ?? "").trim();
  if (code !== "" && display === code) return "";
  return display;
}

function resolveCalcParamsForItem(constructions, constrToCalcToSent, item, index) {
  if (!Array.isArray(constrToCalcToSent) || constrToCalcToSent.length === 0) {
    return null;
  }
  const byIndex = constrToCalcToSent[index];
  if (byIndex) return byIndex;
  const idx = constructions.findIndex((c) => c.key_id === item.key_id);
  if (idx < 0) return null;
  return constrToCalcToSent[idx] ?? null;
}

function resolveCalcCodeForItem(constructions, constrToCalcToSent, item, index) {
  const cp = resolveCalcParamsForItem(
    constructions,
    constrToCalcToSent,
    item,
    index,
  );
  return cp?.Code != null ? String(cp.Code) : "";
}

function constructionTableCipher(
  item,
  { constructions, constrToCalcToSent, index },
) {
  return constructionDisplayCipher({
    agId: item.ag_id,
    calcCode: resolveCalcCodeForItem(
      constructions,
      constrToCalcToSent,
      item,
      index,
    ),
  });
}

function constructionDisplayNameOrCode(
  item,
  { constructions, constrToCalcToSent, index } = {},
) {
  const calcParams = resolveCalcParamsForItem(
    constructions,
    constrToCalcToSent,
    item,
    index,
  );
  const title = constructionLegacyTitle(item, calcParams);
  if (title) return title;
  return constructionTableCipher(item, {
    constructions,
    constrToCalcToSent,
    index,
  });
}

/** Как в колонке «артикул»: без цифры в начале кода показывается «---». */
function splitMaterialsByArticleDisplay(materials) {
  if (!Array.isArray(materials)) return { withArticle: [], noArticle: [] };
  const withArticle = [];
  const noArticle = [];
  for (const m of materials) {
    if (filterVariable(m.Code) === "---") noArticle.push(m);
    else withArticle.push(m);
  }
  return { withArticle, noArticle };
}

/** Индексы строк без артикула в исходном `data` карточки (для сопоставления с `noArticle`). */
function noArticleIndicesInMaterialsData(materials) {
  if (!Array.isArray(materials)) return [];
  const idx = [];
  for (let i = 0; i < materials.length; i += 1) {
    if (filterVariable(materials[i].Code) === "---") idx.push(i);
  }
  return idx;
}

/** Индексы строк с артикулом в исходном `data` карточки (для сопоставления с `withArticle`). */
function withArticleIndicesInMaterialsData(materials) {
  if (!Array.isArray(materials)) return [];
  const idx = [];
  for (let i = 0; i < materials.length; i += 1) {
    if (filterVariable(materials[i].Code) !== "---") idx.push(i);
  }
  return idx;
}

function LegacyConstructionMaterialsPanels({
  withArticle,
  noArticle,
  baseTableId,
  showGeneralConstructionMaterials,
}) {
  return (
    <>
      {withArticle.length === 0 && noArticle.length === 0 && (
        <MaterialsList data={[]} tableId={baseTableId} compositionOnly />
      )}
      {withArticle.length > 0 && (
        <MaterialsList
          data={withArticle}
          tableId={baseTableId}
          compositionOnly
        />
      )}
      {showGeneralConstructionMaterials && noArticle.length > 0 && (
        <MaterialsList
          data={noArticle}
          tableId={
            withArticle.length > 0 ? `${baseTableId}-misc` : baseTableId
          }
          sectionTitle="Общестроительные материалы"
          compositionOnly
        />
      )}
    </>
  );
}

/**
 * Таблица со списком конструкций
 * @param {boolean} [readOnly] — без колонки удаления (например, страница КП)
 * @param {Array<{ key_id: number, data: unknown[] }>} [materialsByConstruction] — если задано, под каждой конструкцией выводится свой список материалов (без суммирования между конструкциями)
 * @param {boolean} [showGeneralConstructionMaterials=true] — блок «Общестроительные материалы» (без артикула)
 * @param {(ctx: { key_id: number, cardIndex: number }) => import("react").ReactNode} [renderKpMontageSlot] — раздел «Монтаж» в каждой карточке конструкции на КП (не в «Услугах» и не в строке итога)
 * @param {boolean} [defaultCardsCollapsed] — карточки свёрнуты при первом показе; на КП передаётся `true`
 * @param {Record<number, boolean>} [cardCollapseOverrides] — явное состояние свёрнутости (КП, из kpSnapshot)
 * @param {(key_id: number) => void} [onToggleCardCollapsed] — переключение карточки (controlled mode)
 * @param {Record<number, { price?: string, quantity?: string, unit?: string }>} [montageByKeyId] — монтаж по карточке (КП); для итога под карточкой
 * @param {(key_id: number, indexInFullMaterialsData: number, field: 'KpPricePerM2'|'KpPricePerUnit'|'KpQuantity', value: string) => void} [onMaterialKpFieldChange] — правка цен/количества материалов на КП
 * @param {boolean} [legacyTableWithMaterials] — таблица-список: по клику на название под строкой показываются материалы (калькулятор)
 * @param {Array<{ Code?: string }>} [constrToCalcToSent] — calc_params параллельно constructions (для колонки «шифр»)
 */
const ConstructionList = ({
  constructions,
  constrToCalcToSent,
  onDelete = () => {},
  readOnly = false,
  showHeadingDeleteButton = false,
  materialsByConstruction,
  legacyTableWithMaterials = false,
  showGeneralConstructionMaterials = true,
  renderKpMontageSlot,
  renderKpAdditionalMaterialsSlot,
  /** { [key_id]: number } — суммы доп. материалов по конструкциям для итоговой строки карточки. */
  additionalMaterialsRubByKeyId,
  montageByKeyId,
  /** На КП итог выводится отдельным блоком ниже «Услуги». */
  showGrandTotalInline = true,
  onMaterialKpFieldChange,
  /** На странице КП — свёрнуты при открытии; в калькуляторе по умолчанию тоже свёрнуты. */
  defaultCardsCollapsed,
  cardCollapseOverrides: controlledCardCollapseOverrides,
  onToggleCardCollapsed,
}) => {
  const [internalCollapseOverrides, setInternalCollapseOverrides] = useState({});
  const [expandedLegacyKeyId, setExpandedLegacyKeyId] = useState(null);
  const legacyCardsLayout = useCalcConstructionCardsViewport();

  const isCardCollapseControlled = onToggleCardCollapsed != null;
  const collapseOverrides = isCardCollapseControlled
    ? (controlledCardCollapseOverrides ?? {})
    : internalCollapseOverrides;

  const defaultCollapsed =
    defaultCardsCollapsed ?? !renderKpAdditionalMaterialsSlot;

  const collapsedCardsByKeyId = useMemo(() => {
    if (!Array.isArray(constructions) || constructions.length === 0) return {};
    const next = {};
    for (const item of constructions) {
      next[item.key_id] = collapseOverrides[item.key_id] ?? defaultCollapsed;
    }
    return next;
  }, [constructions, collapseOverrides, defaultCollapsed]);

  const expandedLegacyKeyIdActive = useMemo(() => {
    if (expandedLegacyKeyId == null) return null;
    return constructions.some((c) => c.key_id === expandedLegacyKeyId)
      ? expandedLegacyKeyId
      : null;
  }, [constructions, expandedLegacyKeyId]);

  const toggleCardCollapsedInternal = useCallback((key_id) => {
    setInternalCollapseOverrides((prev) => ({
      ...prev,
      [key_id]: !(prev[key_id] ?? defaultCollapsed),
    }));
  }, [defaultCollapsed]);

  const toggleCardCollapsed = isCardCollapseControlled
    ? onToggleCardCollapsed
    : toggleCardCollapsedInternal;

  const toggleLegacyMaterials = useCallback((key_id) => {
    setExpandedLegacyKeyId((prev) => (prev === key_id ? null : key_id));
  }, []);

  if (!constructions || constructions.length === 0) {
    return null;
  }

  const cipherCtx = { constructions, constrToCalcToSent };

  /** Карточки КП: конструкция и материалы в одном блоке (не legacy-таблица калькулятора). */
  const interleaved =
    materialsByConstruction != null && !legacyTableWithMaterials;

  if (interleaved) {
    return (
      <div className="construction-materials-blocks">
        {constructions.map((constRItem, index) => {
          const calcParams = resolveCalcParamsForItem(
            constructions,
            constrToCalcToSent,
            constRItem,
            index,
          );
          const cardCollapsed = collapsedCardsByKeyId[constRItem.key_id] ?? true;
          const matEntry = materialsByConstruction.find(
            (m) => m.key_id === constRItem.key_id
          );
          const materialsData = matEntry?.data ?? [];
          const { withArticle, noArticle } =
            splitMaterialsByArticleDisplay(materialsData);
          const miscRowToFullIndex = noArticleIndicesInMaterialsData(
            materialsData
          );
          const withArticleRowToFullIndex = withArticleIndicesInMaterialsData(
            materialsData
          );
          const materialsRubTotal =
            computeTotalRubForMaterialsData(materialsData, { forKp: readOnly });
          const montageRubCard = montageLineProductRub(
            montageByKeyId?.[constRItem.key_id]
          );
          const additionalMaterialsRubCard =
            additionalMaterialsRubByKeyId?.[constRItem.key_id] ?? 0;
          const cardSectionsTotalRub =
            materialsRubTotal + (montageRubCard ?? 0) + additionalMaterialsRubCard;
          const baseTableId = index === 0 ? "table2" : `table2-${index}`;
          const groupBody = (
            <>
              <div className="tbl-in">
                <table className="data" id={index === 0 ? "table1" : undefined}>
                  <thead>
                    <tr>
                      <th
                        colSpan={readOnly ? 3 : 4}
                        className="construction-card__heading-th"
                      >
                        <div className="construction-card__heading-content">
                          <button
                            type="button"
                            className="construction-card__heading-toggle"
                            aria-expanded={!cardCollapsed}
                            onClick={() => toggleCardCollapsed(constRItem.key_id)}
                          >
                            <span
                              className={`construction-card__heading-chevron${
                                cardCollapsed
                                  ? ""
                                  : " construction-card__heading-chevron--expanded"
                              }`}
                              aria-hidden
                            />
                            <span className="construction-card__heading-title">
                              {constructionCardHeading(constRItem, calcParams)}
                            </span>
                          </button>
                          {showHeadingDeleteButton && (
                            <button
                              type="button"
                              className="construction-card__heading-delete-button"
                              onClick={() => onDelete(constRItem.key_id)}
                              aria-label={`Удалить конструкцию ${constructionCardHeading(constRItem, calcParams)}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </th>
                    </tr>
                    {!cardCollapsed && (
                      <tr>
                        {!readOnly && <th className="construction-card__delete-col" />}
                        <th className="tbl-in__cipher-col">
                          {readOnly ? "название" : "шифр"}
                        </th>
                        <th className="construction-card__dim-th">размеры, мм</th>
                        <th>площадь, м2</th>
                      </tr>
                    )}
                  </thead>
                  {!cardCollapsed && (
                    <tbody>
                      <tr>
                        {!readOnly && (
                          <td className="construction-card__delete-col">
                            <input
                              type="button"
                              className="counter__button_minus"
                              onClick={() => onDelete(constRItem.key_id)}
                            />
                            <img
                              src={`${import.meta.env.BASE_URL}delete-icon.jpg`}
                              alt=""
                              className="construction-card__delete-icon"
                              loading="lazy"
                              decoding="async"
                              onClick={() => onDelete(constRItem.key_id)}
                            />
                          </td>
                        )}
                        <td className="tbl-in__cipher-col">
                          {readOnly
                            ? constructionDisplayNameOrCode(constRItem, {
                                ...cipherCtx,
                                index,
                              })
                            : constructionTableCipher(constRItem, {
                                ...cipherCtx,
                                index,
                              })}
                        </td>
                        <td className="construction-card__dim-td">
                          {constructionDimensionsMm(constRItem)}
                        </td>
                        <td>{formatConstructionAreaM2(constRItem)}</td>
                      </tr>
                    </tbody>
                  )}
                </table>
              </div>
              {!cardCollapsed && withArticle.length === 0 && noArticle.length === 0 && (
                <MaterialsList
                  data={[]}
                  tableId={baseTableId}
                  collapsible={readOnly}
                />
              )}
              {!cardCollapsed && withArticle.length > 0 && (
                <MaterialsList
                  data={withArticle}
                  tableId={baseTableId}
                  collapsible={readOnly}
                  onKpMaterialQuantityChange={
                    readOnly && onMaterialKpFieldChange
                      ? (rowIndex, value) => {
                          const fullIdx = withArticleRowToFullIndex[rowIndex];
                          if (fullIdx === undefined) return;
                          onMaterialKpFieldChange(
                            constRItem.key_id,
                            fullIdx,
                            "KpQuantity",
                            value,
                          );
                        }
                      : undefined
                  }
                />
              )}
              {!cardCollapsed && showGeneralConstructionMaterials && noArticle.length > 0 && (
                <MaterialsList
                  data={noArticle}
                  tableId={
                    withArticle.length > 0 ? `${baseTableId}-misc` : baseTableId
                  }
                  sectionTitle="Общестроительные материалы"
                  collapsible={readOnly}
                  editablePriceCells={readOnly && !!onMaterialKpFieldChange}
                  onKpMaterialPriceChange={(rowIndex, field, value) => {
                    const fullIdx = miscRowToFullIndex[rowIndex];
                    if (fullIdx === undefined) return;
                    onMaterialKpFieldChange?.(
                      constRItem.key_id,
                      fullIdx,
                      field,
                      value
                    );
                  }}
                  onKpMaterialQuantityChange={
                    readOnly && onMaterialKpFieldChange
                      ? (rowIndex, value) => {
                          const fullIdx = miscRowToFullIndex[rowIndex];
                          if (fullIdx === undefined) return;
                          onMaterialKpFieldChange(
                            constRItem.key_id,
                            fullIdx,
                            "KpQuantity",
                            value,
                          );
                        }
                      : undefined
                  }
                />
              )}
            </>
          );

          return (
            <div
              key={constRItem.key_id}
              className="construction-materials-block"
            >
              {readOnly ? (
                <div className="kp-table-card kp-table-card--group">
                  {groupBody}
                  {!cardCollapsed && typeof renderKpMontageSlot === "function"
                    ? renderKpMontageSlot({
                        key_id: constRItem.key_id,
                        cardIndex: index,
                      })
                    : null}
                  {!cardCollapsed && typeof renderKpAdditionalMaterialsSlot === "function"
                    ? renderKpAdditionalMaterialsSlot({
                        key_id: constRItem.key_id,
                        cardIndex: index,
                      })
                    : null}
                  <div className="tbl-in kp-card-sections-total-wrap">
                    <table
                      className="data kp-card-sections-total-table"
                      id={`kp-card-sections-total-${constRItem.key_id}`}
                      aria-label={`Итого, карточка ${index + 1}`}
                    >
                      <tbody>
                        <tr>
                          <td className="kp-card-sections-total__cell">
                            <div className="kp-card-sections-total__inner">
                              <span className="kp-card-sections-total__label">
                                Итого
                              </span>
                              <span className="kp-card-sections-total__amount">
                                {formatRub(cardSectionsTotalRub)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                groupBody
              )}
            </div>
          );
        })}
        {showGrandTotalInline && (
          <ConstructionGrandTotalBlock
            readOnly={readOnly}
            grandTotalRub={computeGrandTotalRubForConstructions(
              constructions,
              materialsByConstruction,
              { forKp: readOnly },
            )}
          />
        )}
      </div>
    );
  }

  const legacyColSpan = readOnly ? 3 : 4;
  const useLegacyCards =
    legacyTableWithMaterials && legacyCardsLayout;

  if (useLegacyCards) {
    return (
      <div className="tbl-in construction-list-legacy-cards-wrap">
        <div
          className="construction-list-legacy-cards"
          role="list"
          aria-label="Список конструкций"
        >
          {constructions.map((constRItem, index) => {
            const calcParams = resolveCalcParamsForItem(
              constructions,
              constrToCalcToSent,
              constRItem,
              index,
            );
            const legacyExpanded = expandedLegacyKeyIdActive === constRItem.key_id;
            const matEntry = materialsByConstruction?.find(
              (m) => m.key_id === constRItem.key_id,
            );
            const materialsData = matEntry?.data ?? [];
            const { withArticle, noArticle } =
              splitMaterialsByArticleDisplay(materialsData);
            const baseTableId = index === 0 ? "table2" : `table2-${index}`;
            const legacyTitle =
              constructionLegacyTitle(constRItem, calcParams) ||
              constRItem.ag_id ||
              "";
            const materialsPanelId = `construction-legacy-materials-${constRItem.key_id}`;

            return (
              <article
                key={constRItem.key_id}
                role="listitem"
                className={`construction-list-legacy-card${
                  legacyExpanded
                    ? " construction-list-legacy-card--expanded"
                    : ""
                }`}
              >
                <div className="construction-list-legacy-card__header">
                  <button
                    type="button"
                    className="construction-list-legacy-card__toggle"
                    onClick={() => toggleLegacyMaterials(constRItem.key_id)}
                    aria-expanded={legacyExpanded}
                    aria-controls={materialsPanelId}
                    title={
                      legacyExpanded ? "Скрыть материалы" : "Показать материалы"
                    }
                  >
                    <span
                      className={`construction-list-legacy__title-chevron${
                        legacyExpanded
                          ? " construction-list-legacy__title-chevron--expanded"
                          : ""
                      }`}
                      aria-hidden
                    />
                    <span className="construction-list-legacy-card__body">
                      <span className="construction-list-legacy-card__title">
                        {legacyTitle}
                      </span>
                      <span className="construction-list-legacy-card__meta">
                        <span className="construction-list-legacy-card__meta-item">
                          <span className="construction-list-legacy-card__meta-label">
                            шифр
                          </span>
                          <span className="construction-list-legacy-card__meta-value">
                            {constructionTableCipher(constRItem, {
                              ...cipherCtx,
                              index,
                            })}
                          </span>
                        </span>
                        <span className="construction-list-legacy-card__meta-item">
                          <span className="construction-list-legacy-card__meta-label">
                            размеры, мм
                          </span>
                          <span className="construction-list-legacy-card__meta-value">
                            {constructionDimensionsMm(constRItem)}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      className="construction-list-legacy-card__delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(constRItem.key_id);
                      }}
                      aria-label={`Удалить конструкцию ${legacyTitle}`}
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}delete-icon.jpg`}
                        alt=""
                        className="construction-card__delete-icon"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  )}
                </div>
                {legacyExpanded && (
                  <div
                    id={materialsPanelId}
                    className="construction-list-legacy-card__materials"
                  >
                    <LegacyConstructionMaterialsPanels
                      withArticle={withArticle}
                      noArticle={noArticle}
                      baseTableId={baseTableId}
                      showGeneralConstructionMaterials={
                        showGeneralConstructionMaterials
                      }
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        readOnly
          ? "tbl-in kp-table-card"
          : "tbl-in"
      }
    >
      <table className="data" id="table1">
        <thead>
          <tr>
            {!readOnly && <th className="construction-card__delete-col" />}
            <th className="tbl-in__cipher-col">шифр</th>
            <th>название</th>
            <th className="construction-list-legacy__dim-th">размеры, мм</th>
          </tr>
        </thead>
        <tbody>
          {constructions.map((constRItem, index) => {
            const calcParams = resolveCalcParamsForItem(
              constructions,
              constrToCalcToSent,
              constRItem,
              index,
            );
            const legacyExpanded =
              legacyTableWithMaterials &&
              expandedLegacyKeyIdActive === constRItem.key_id;
            const matEntry = legacyTableWithMaterials
              ? materialsByConstruction?.find(
                  (m) => m.key_id === constRItem.key_id,
                )
              : null;
            const materialsData = matEntry?.data ?? [];
            const { withArticle, noArticle } =
              splitMaterialsByArticleDisplay(materialsData);
            const baseTableId = index === 0 ? "table2" : `table2-${index}`;
            const legacyTitle =
              constructionLegacyTitle(constRItem, calcParams) ||
              constRItem.ag_id ||
              "";
            const titleExpandable = legacyTableWithMaterials && legacyTitle !== "";

            return (
              <Fragment key={constRItem.key_id}>
                <tr>
                  {!readOnly && (
                    <td className="construction-card__delete-col">
                      <input
                        type="button"
                        className="counter__button_minus"
                        onClick={() => onDelete(constRItem.key_id)}
                      />
                      <img
                        src={`${import.meta.env.BASE_URL}delete-icon.jpg`}
                        alt=""
                        className="construction-card__delete-icon"
                        loading="lazy"
                        decoding="async"
                        onClick={() => onDelete(constRItem.key_id)}
                      />
                    </td>
                  )}
                  <td className="construction-list-legacy__code-td tbl-in__cipher-col">
                    {constructionTableCipher(constRItem, {
                      ...cipherCtx,
                      index,
                    })}
                  </td>
                  <td className="construction-list-legacy__title-td">
                    {titleExpandable ? (
                      <button
                        type="button"
                        className="construction-list-legacy__title-button"
                        onClick={() => toggleLegacyMaterials(constRItem.key_id)}
                        aria-expanded={legacyExpanded}
                        aria-controls={`construction-legacy-materials-${constRItem.key_id}`}
                        title={legacyExpanded ? "Скрыть материалы" : "Показать материалы"}
                      >
                        <span
                          className={`construction-list-legacy__title-chevron${
                            legacyExpanded
                              ? " construction-list-legacy__title-chevron--expanded"
                              : ""
                          }`}
                          aria-hidden
                        />
                        {legacyTitle}
                      </button>
                    ) : (
                      constructionLegacyTitle(constRItem, calcParams)
                    )}
                  </td>
                  <td className="construction-list-legacy__dim-td">
                    {constructionDimensionsMm(constRItem)}
                  </td>
                </tr>
                {legacyExpanded && (
                  <tr
                    id={`construction-legacy-materials-${constRItem.key_id}`}
                    className="construction-list-legacy__materials-row"
                  >
                    <td
                      colSpan={legacyColSpan}
                      className="construction-list-legacy__materials-cell"
                    >
                      <LegacyConstructionMaterialsPanels
                        withArticle={withArticle}
                        noArticle={noArticle}
                        baseTableId={baseTableId}
                        showGeneralConstructionMaterials={
                          showGeneralConstructionMaterials
                        }
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ConstructionList;

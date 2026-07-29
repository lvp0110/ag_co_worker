import { Fragment, useCallback, useMemo, useState } from "react";
import { useCalcConstructionCardsViewport } from "../../hooks/useCalcConstructionCardsViewport";
import { filterVariable } from "../../utils/formatters";
import {
  resolveConstructionTableText,
} from "../../utils/itemsCatalog.js";
import MaterialsList, { formatRub } from "./MaterialsList";
import { constructionDisplayCipher } from "../../utils/calcUlTapeFallback";
import "./ConstructionList.css";

/** Строка итога «Стоимость конструкций» (калькулятор). */
export function ConstructionGrandTotalBlock({
  grandTotalRub,
  wrapClassName = "",
}) {
  const titleColSpan = 4;
  const constructionsGrossRub =
    typeof grandTotalRub === "number" && !Number.isNaN(grandTotalRub)
      ? grandTotalRub
      : 0;

  return (
    <div
      className={`tbl-in construction-grand-total-wrap${
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
              className="construction-grand-total__line-label construction-grand-total__line-label--calc"
            >
              Стоимость конструкций
            </th>
            <th className="construction-grand-total__line-amount construction-grand-total__line-amount--calc">
              {formatRub(constructionsGrossRub)}
            </th>
          </tr>
          <tr className="construction-grand-total__total-row">
            <th
              colSpan={Math.max(1, titleColSpan - 1)}
              className="construction-grand-total__total-label construction-grand-total__total-label--calc"
            >
              Общий итог
            </th>
            <th className="construction-grand-total__total-amount construction-grand-total__total-amount--calc">
              {formatRub(constructionsGrossRub)}
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

/** Имя в таблице — ItemsBase.description (без префиксов ЗИПС). */
function constructionDisplayTitle({ title }) {
  return title != null ? String(title).trim() : "";
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
 * Таблица со списком конструкций (калькулятор).
 * @param {Array<{ Code?: string }>} [constrToCalcToSent] — calc_params параллельно constructions (для колонки «шифр»)
 * @param {Array<{ key_id: number, data: unknown[] }>} [materialsByConstruction] — материалы по key_id
 * @param {boolean} [legacyTableWithMaterials] — по клику на название под строкой показываются материалы
 * @param {boolean} [showGeneralConstructionMaterials=true] — блок «Общестроительные материалы» (без артикула)
 */
const ConstructionList = ({
  constructions,
  constrToCalcToSent,
  onDelete = () => {},
  materialsByConstruction,
  legacyTableWithMaterials = false,
  showGeneralConstructionMaterials = true,
}) => {
  const [expandedLegacyKeyId, setExpandedLegacyKeyId] = useState(null);
  const legacyCardsLayout = useCalcConstructionCardsViewport();

  const expandedLegacyKeyIdActive = useMemo(() => {
    if (expandedLegacyKeyId == null) return null;
    return constructions.some((c) => c.key_id === expandedLegacyKeyId)
      ? expandedLegacyKeyId
      : null;
  }, [constructions, expandedLegacyKeyId]);

  const toggleLegacyMaterials = useCallback((key_id) => {
    setExpandedLegacyKeyId((prev) => (prev === key_id ? null : key_id));
  }, []);

  if (!constructions || constructions.length === 0) {
    return null;
  }

  const cipherCtx = { constructions, constrToCalcToSent };
  const legacyColSpan = 4;
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
            const legacyExpanded =
              expandedLegacyKeyIdActive === constRItem.key_id;
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
                      legacyExpanded
                        ? "Скрыть материалы"
                        : "Показать материалы"
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
    <div className="tbl-in">
      <table className="data" id="table1">
        <thead>
          <tr>
            <th className="construction-card__delete-col" />
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
            const titleExpandable =
              legacyTableWithMaterials && legacyTitle !== "";

            return (
              <Fragment key={constRItem.key_id}>
                <tr>
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
                        onClick={() =>
                          toggleLegacyMaterials(constRItem.key_id)
                        }
                        aria-expanded={legacyExpanded}
                        aria-controls={`construction-legacy-materials-${constRItem.key_id}`}
                        title={
                          legacyExpanded
                            ? "Скрыть материалы"
                            : "Показать материалы"
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

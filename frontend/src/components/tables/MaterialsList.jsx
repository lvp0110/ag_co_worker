import {
  convertUnits,
  filterVariable,
  isM2Units,
} from "../../utils/formatters";
import {
  effectiveKpQuantity,
  formatMaterialQuantity,
  materialDisplayUnits,
} from "../../utils/materialPackUnits";
import {
  getPriceName,
  getPricePerM2,
  getPricePerUnit,
  usePriceData,
} from "../../services/priceApi";
import { useCalcConstructionCardsViewport } from "../../hooks/useCalcConstructionCardsViewport";
import { useKpNarrowViewport } from "../../hooks/useKpNarrowViewport";
import {
  materialOptionLabel,
  replacementGroupForProductCode,
} from "../../utils/isolationCalcV2";
import "./MaterialsList.css";

export const formatRub = (value) => {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Read-only сумма: при отсутствии расчёта — 0,00, не прочерк. */
export const formatKpComputedSum = (value) => formatRub(value ?? 0);

/** Те же правила, что ввод цены/количества (пробелы, запятая). */
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

/** Цены строки: override (Kp*) или из прайса по артикулу. */
export function effectiveMaterialPrices(material, pricePerM2, pricePerUnit) {
  const kpM2 = parseKpDecimal(material.KpPricePerM2);
  const kpUnit = parseKpDecimal(material.KpPricePerUnit);
  return {
    effM2: kpM2 !== null ? kpM2 : pricePerM2,
    effUnit: kpUnit !== null ? kpUnit : pricePerUnit,
  };
}

/** Поле override цены в зависимости от ед. изм. строки. */
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

const lineSumRub = (material, pricePerM2, pricePerUnit) => {
  const { effM2, effUnit } = effectiveMaterialPrices(
    material,
    pricePerM2,
    pricePerUnit
  );
  const units = material.Units;
  const qty = effectiveKpQuantity(material, { forKp: false });
  if (qty == null || !Number.isFinite(qty)) return null;
  if (isM2Units(units)) {
    if (effM2 != null) return qty * effM2;
    if (effUnit != null) return qty * effUnit;
    return null;
  }
  if (effUnit != null) {
    return qty * effUnit;
  }
  return null;
};

/** Сумма в ₽ по списку материалов (те же правила, что колонка «сумма»). */
export function computeTotalRubForMaterialsData(data) {
  if (!Array.isArray(data) || data.length === 0) return 0;
  return data.reduce((acc, Material) => {
    const codeRaw = Material.Code != null ? String(Material.Code).trim() : "";
    const pricePerM2 = getPricePerM2(codeRaw);
    const pricePerUnit = getPricePerUnit(codeRaw);
    const sumRub = lineSumRub(Material, pricePerM2, pricePerUnit);
    return typeof sumRub === "number" && !Number.isNaN(sumRub)
      ? acc + sumRub
      : acc;
  }, 0);
}

function ReplacementMaterialSelect({
  group,
  selected,
  disabled,
  onChange,
}) {
  return (
    <select
      className="materials-list__replacement-select"
      value={selected}
      disabled={disabled}
      aria-label={group.typeName || "замена материала"}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        const nextCode = e.target.value;
        if (nextCode === selected) return;
        onChange(group.group, nextCode);
      }}
    >
      {group.materials.map((mat) => (
        <option key={mat.code} value={mat.code}>
          {materialOptionLabel(mat, group.materials)}
        </option>
      ))}
    </select>
  );
}

/** Сумма в ₽ по всем конструкциям (материалы по key_id). */
export function computeGrandTotalRubForConstructions(
  constructions,
  materialsByConstruction,
) {
  if (!Array.isArray(constructions) || constructions.length === 0) return 0;
  if (!Array.isArray(materialsByConstruction)) return 0;
  return constructions.reduce((sum, constRItem) => {
    const matEntry = materialsByConstruction.find(
      (m) => m.key_id === constRItem.key_id
    );
    return sum + computeTotalRubForMaterialsData(matEntry?.data ?? []);
  }, 0);
}

/**
 * Таблица со списком материалов (калькулятор / состав конструкции).
 * @param {object} [calculatedMaterials] — { data: Material[] }
 * @param {Material[]} [data] — строки материалов; если задано, имеет приоритет над calculatedMaterials
 * @param {string} [tableId] — id таблицы (для экспорта; по умолчанию table2)
 * @param {string} [sectionTitle] — заголовок блока (по умолчанию «Материалы конструкции»)
 * @param {boolean} [compositionOnly=false] — только артикул, название, ед.изм и кол-во (без цен и сумм)
 */
const MaterialsList = ({
  calculatedMaterials,
  data: dataProp,
  tableId = "table2",
  sectionTitle = "Материалы конструкции",
  compositionOnly = false,
  replacementGroups,
  selectedReplacements,
  onReplacementChange,
  replacementBusy = false,
}) => {
  const isNarrowScreen = useKpNarrowViewport();
  const calcCardsViewport = useCalcConstructionCardsViewport();
  usePriceData();

  const data = dataProp ?? calculatedMaterials?.data;
  const hasData = Array.isArray(data) && data.length > 0;

  const rowModels = hasData
    ? data.map((Material, index) => {
        const codeRaw =
          Material.Code != null ? String(Material.Code).trim() : "";
        const pricePerM2 = getPricePerM2(codeRaw);
        const pricePerUnit = getPricePerUnit(codeRaw);
        const sumRub = lineSumRub(Material, pricePerM2, pricePerUnit);
        const rowKey =
          (codeRaw !== "" ? `code:${codeRaw}` : "") || `idx:${index}`;
        return { Material, pricePerM2, pricePerUnit, sumRub, rowKey };
      })
    : [];

  const totalSumRub = computeTotalRubForMaterialsData(data);

  /** Состав конструкции в калькуляторе: < 430px без колонки «артикул». */
  const compositionNarrow = compositionOnly && calcCardsViewport;
  /** Калькулятор: на узком экране убираем колонки из DOM. */
  const legacyNarrow = !compositionOnly && isNarrowScreen;
  const colSpan = compositionOnly
    ? compositionNarrow
      ? 3
      : 4
    : legacyNarrow
      ? 4
      : 8;
  const colInDom = compositionOnly || !legacyNarrow;
  const showArticleCol = compositionOnly ? !compositionNarrow : colInDom;

  return (
    <div className="tbl-in materials-data-table">
      <table className="data" id={tableId} data-materials-table="true">
        <thead>
          <tr>
            <th colSpan={colSpan} className="materials-list__section-title-th">
              {sectionTitle}
            </th>
          </tr>
          <tr>
            {showArticleCol && <th>артикул</th>}
            <th>название</th>
            {!compositionOnly && (
              <th className="materials-list__col--hidden" />
            )}
            {colInDom && compositionOnly && <th>ед.изм</th>}
            {colInDom && <th>кол-во</th>}
            {colInDom && !compositionOnly && <th>ед.изм</th>}
            {colInDom && !compositionOnly && <th>цена, ₽/м²</th>}
            {colInDom && !compositionOnly && <th>цена, ₽/ед.</th>}
            {colInDom && !compositionOnly && <th>сумма, ₽</th>}
          </tr>
        </thead>
        <tbody>
          {hasData ? (
            rowModels.map(
              ({ Material, pricePerM2, pricePerUnit, sumRub, rowKey }) => {
                const codeRaw =
                  Material.Code != null ? String(Material.Code).trim() : "";
                const priceName = compositionOnly ? "" : getPriceName(codeRaw);
                const materialName =
                  priceName !== ""
                    ? priceName
                    : Material.Name != null &&
                        String(Material.Name).trim() !== ""
                      ? String(Material.Name).trim()
                      : "—";

                const rowCells = compositionOnly ? (
                  <>
                    {showArticleCol && (
                      <td>{filterVariable(Material.Code)}</td>
                    )}
                    <td>
                      {(() => {
                        const group = replacementGroupForProductCode(
                          replacementGroups,
                          Material.Code
                        );
                        if (!group || !onReplacementChange) return materialName;
                        return (
                          <ReplacementMaterialSelect
                            group={group}
                            selected={
                              selectedReplacements?.[group.group] ||
                              String(Material.Code ?? "").trim()
                            }
                            disabled={replacementBusy}
                            onChange={onReplacementChange}
                          />
                        );
                      })()}
                    </td>
                    {colInDom && (
                      <td>
                        {materialDisplayUnits(Material, { forKp: false })}
                      </td>
                    )}
                    {colInDom && <td>{convertUnits(Material)}</td>}
                  </>
                ) : (
                  <>
                    {colInDom && <td>{filterVariable(Material.Code)}</td>}
                    <td>{materialName}</td>
                    <td className="materials-list__col--hidden" />
                    {colInDom && (
                      <td>
                        {formatMaterialQuantity(Material, { forKp: false })}
                      </td>
                    )}
                    {colInDom && (
                      <td>
                        {materialDisplayUnits(Material, { forKp: false })}
                      </td>
                    )}
                    {colInDom && <td>{formatRub(pricePerM2)}</td>}
                    {colInDom && <td>{formatRub(pricePerUnit)}</td>}
                    {colInDom && <td>{formatKpComputedSum(sumRub)}</td>}
                  </>
                );
                return <tr key={rowKey}>{rowCells}</tr>;
              }
            )
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
        {hasData && !compositionOnly && (
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

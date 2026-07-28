import { useEffect, useState } from "react";
import { useKpDiscountMultiSelect } from "../../hooks/useKpDiscountMultiSelect";
import {
  formatKpComputedSum,
  formatRub,
  parseKpDecimal,
} from "./MaterialsList";
import "./KpDiscountSummaryTable.css";

/**
 * Сводка строк КП со скидкой: название, кол-во, ед.изм, сумма, скидка %, сумма скидки.
 * @param {Array<{ id: string, name: string, quantity?: string|number, unit?: string, sumRub: number|null }>} rows
 * @param {Record<string, string>} [discountByKey]
 * @param {(rowKey: string, value: string) => void | (patch: Record<string, string>) => void} [onDiscountChange]
 * @param {(totalDiscountRub: number) => void} [onDiscountTotalChange]
 */
export default function KpDiscountSummaryTable({
  rows,
  tableId,
  sectionTitle = "Сводка",
  discountByKey: discountByKeyProp,
  onDiscountChange,
  onDiscountTotalChange,
}) {
  const [internalDiscountByKey, setInternalDiscountByKey] = useState({});
  const discountControlled = typeof onDiscountChange === "function";
  const discountByKey = discountControlled
    ? (discountByKeyProp ?? {})
    : internalDiscountByKey;
  const list = Array.isArray(rows) ? rows : [];
  const rowKeys = list.map((row) => row.id);
  const { selectOnPointer, keysForEdit, isSelected } =
    useKpDiscountMultiSelect(rowKeys);

  const totalSumRub = list.reduce((acc, row) => {
    const sum = row?.sumRub;
    return typeof sum === "number" && !Number.isNaN(sum) ? acc + sum : acc;
  }, 0);

  const totalDiscountRub = list.reduce((acc, row) => {
    const discountPct = parseKpDecimal(discountByKey[row.id]);
    const sum = row?.sumRub;
    if (
      discountPct == null ||
      typeof sum !== "number" ||
      Number.isNaN(sum)
    ) {
      return acc;
    }
    return acc + (sum * discountPct) / 100;
  }, 0);

  useEffect(() => {
    if (typeof onDiscountTotalChange !== "function") return;
    onDiscountTotalChange(totalDiscountRub);
  }, [totalDiscountRub, onDiscountTotalChange]);

  const updateDiscount = (rowKey, value) => {
    const targets = keysForEdit(rowKey);
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

  return (
    <div className="tbl-in kp-discount-summary">
      <table
        className="data kp-data-table--starts-with-column-headers"
        id={tableId}
        data-export-section-title={sectionTitle}
        data-erp-data-start-row="1"
      >
        <thead>
          <tr>
            <th colSpan={6} className="materials-list__section-title-th">
              {sectionTitle}
            </th>
          </tr>
          <tr>
            <th className="kp-data-col--name">название</th>
            <th className="kp-data-col--hide-narrow">кол-во</th>
            <th className="kp-data-col--hide-narrow">ед.изм</th>
            <th className="kp-data-col--sum">сумма, ₽</th>
            <th className="kp-data-col--hide-narrow">скидка</th>
            <th className="kp-data-col--hide-narrow">сумма скидки</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={6} className="materials-list__empty-message">
                Нет данных для отображения
              </td>
            </tr>
          ) : (
            list.map((row) => {
              const discountRaw = discountByKey[row.id] ?? "";
              const discountPct = parseKpDecimal(discountRaw);
              const sumRub =
                typeof row.sumRub === "number" && !Number.isNaN(row.sumRub)
                  ? row.sumRub
                  : null;
              const discountSumRub =
                discountPct != null && sumRub != null
                  ? (sumRub * discountPct) / 100
                  : null;
              const qtyDisplay =
                row.quantity != null && String(row.quantity).trim() !== ""
                  ? String(row.quantity)
                  : "—";
              const unitDisplay =
                row.unit != null && String(row.unit).trim() !== ""
                  ? String(row.unit)
                  : "—";
              const nameDisplay =
                row.name != null && String(row.name).trim() !== ""
                  ? String(row.name).trim()
                  : "—";

              return (
                <tr key={row.id}>
                  <td className="kp-data-col--name">{nameDisplay}</td>
                  <td className="kp-data-col--hide-narrow">{qtyDisplay}</td>
                  <td className="kp-data-col--hide-narrow">{unitDisplay}</td>
                  <td className="kp-data-col--sum">
                    {formatKpComputedSum(sumRub)}
                  </td>
                  <td className="kp-data-col--hide-narrow">
                    <input
                      type="text"
                      className={`kp-page__services-input${
                        isSelected(row.id)
                          ? " kp-discount-input--selected"
                          : ""
                      }`}
                      value={discountRaw}
                      onMouseDown={(e) => {
                        if (e.shiftKey || e.metaKey || e.ctrlKey) {
                          e.preventDefault();
                        }
                      }}
                      onClick={(e) => selectOnPointer(row.id, e)}
                      onFocus={() => {
                        if (!isSelected(row.id)) {
                          selectOnPointer(row.id, {});
                        }
                      }}
                      onChange={(e) => updateDiscount(row.id, e.target.value)}
                      placeholder="0"
                      aria-label={`Скидка, %, ${nameDisplay}`}
                    />
                  </td>
                  <td className="kp-data-col--hide-narrow">
                    {formatKpComputedSum(discountSumRub)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {list.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={6} className="materials-list__footer-cell">
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
}

import { useState } from "react";
import {
  addCeilShiftDefaultMm,
  clampAddCeilShiftMm,
  isAddCeilShiftEnabled,
  isAddCeilShiftParam,
} from "../utils/isolationCalcV2";
import { getMaxLenZFromSizeLimits } from "../utils/validation";

const optionKey = (opt, index) =>
  `${opt.value_int ?? ""}-${opt.value_bool ?? ""}-${opt.label ?? index}`;

const CeilShiftOption = ({ param, current, itemId, setParam }) => {
  const defaultMm = addCeilShiftDefaultMm(param);
  const enabled = isAddCeilShiftEnabled(current);
  const label = param.options?.[0]?.label || param.name;
  const id = `${param.code}_${itemId}`;
  const [draft, setDraft] = useState(null);
  const displayValue = draft ?? current.value_int ?? defaultMm;

  const commit = (raw) => {
    const next = clampAddCeilShiftMm(raw, param);
    setDraft(null);
    setParam(param.code, { value_int: next, enabled: true });
  };

  return (
    <div>
      <div className="radio-option">
        <input
          className="checkbox"
          type="checkbox"
          id={id}
          checked={enabled}
          onChange={(e) => {
            setDraft(null);
            setParam(param.code, {
              value_int: defaultMm,
              enabled: e.target.checked,
            });
          }}
        />
        <label className="label" htmlFor={id}>
          {label}
        </label>
      </div>
      {enabled && (
        <input
          type="number"
          placeholder="размер,мм"
          min={defaultMm}
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            const n = Number(raw);
            if (!Number.isFinite(n) || n < defaultMm) return;
            setParam(param.code, { value_int: n, enabled: true });
          }}
          onBlur={(e) => commit(e.target.value)}
        />
      )}
    </div>
  );
};

const CalcApiOptions = ({
  spec,
  values = {},
  onChange,
  itemId,
  regionCode = "",
  regionOptions = [],
  onRegionChange,
  regionLoading = false,
}) => {
  const params = spec?.params || [];
  const optionals = spec?.optionalMaterials || [];
  const showRegion = typeof onRegionChange === "function";
  if (!params.length && !optionals.length && !showRegion) return null;

  const setParam = (code, next) => {
    if (typeof onChange !== "function") return;
    onChange({
      ...values,
      paramValues: { ...values.paramValues, [code]: next },
    });
  };

  const toggleOptional = (code, checked) => {
    if (typeof onChange !== "function") return;
    const current = values.selectedOptionals || [];
    onChange({
      ...values,
      selectedOptionals: checked
        ? [...current, code]
        : current.filter((item) => item !== code),
    });
  };

  return (
    <div className="selected-item-forms__stack">
      {showRegion && (
        <div>
          <h4 className="selected-item-forms__group-heading">регион</h4>
          <select
            id={`calc_region_${itemId || "new"}`}
            className="selected-item-forms__region-select"
            value={regionCode}
            disabled={regionLoading || regionOptions.length === 0}
            onChange={(e) => onRegionChange(e.target.value)}
          >
            {regionLoading && regionOptions.length === 0 ? (
              <option value="">Загрузка регионов...</option>
            ) : regionOptions.length === 0 ? (
              <option value="">Регионы не найдены</option>
            ) : (
              regionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            )}
          </select>
        </div>
      )}
      {params.map((param) => {
        const current = values.paramValues?.[param.code] || {};
        const isBool = param.value_type === "bool";
        const options = param.options || [];
        if (isAddCeilShiftParam(param)) {
          return (
            <CeilShiftOption
              key={param.code}
              param={param}
              current={current}
              itemId={itemId}
              setParam={setParam}
            />
          );
        }
        return (
          <div key={param.code}>
            <h4 className="selected-item-forms__group-heading">{param.name}</h4>
            {options.length > 0 ? (
              options.map((opt, index) => {
                const id = `${param.code}_${itemId}_${index}`;
                const checked = isBool
                  ? Boolean(current.value_bool) === Boolean(opt.value_bool)
                  : Number(current.value_int) === Number(opt.value_int);
                return (
                  <div className="radio-option" key={optionKey(opt, index)}>
                    <input
                      className="radio"
                      type="radio"
                      id={id}
                      name={`${param.code}_${itemId}`}
                      checked={checked}
                      onChange={() =>
                        setParam(
                          param.code,
                          isBool
                            ? { value_bool: Boolean(opt.value_bool) }
                            : { value_int: Number(opt.value_int) }
                        )
                      }
                    />
                    <label className="label" htmlFor={id}>
                      {opt.label ||
                        (isBool
                          ? opt.value_bool
                            ? "Да"
                            : "Нет"
                          : String(opt.value_int))}
                      {param.code === "step"
                        ? (() => {
                            const maxHeight = getMaxLenZFromSizeLimits(
                              spec.sizeLimits,
                              opt.value_int,
                              spec.params
                            );
                            return maxHeight
                              ? ` (макс.высота конструкции ${maxHeight} м)`
                              : "";
                          })()
                        : ""}
                    </label>
                  </div>
                );
              })
            ) : (
              <input
                type={isBool ? "checkbox" : "number"}
                className={isBool ? "checkbox" : undefined}
                checked={isBool ? Boolean(current.value_bool) : undefined}
                value={isBool ? undefined : current.value_int ?? ""}
                onChange={(e) =>
                  setParam(
                    param.code,
                    isBool
                      ? { value_bool: e.target.checked }
                      : { value_int: Number(e.target.value) || 0 }
                  )
                }
              />
            )}
          </div>
        );
      })}

      {optionals.length > 0 && (
        <div>
          <h4 className="selected-item-forms__group-heading">
            дополнительные материалы
          </h4>
          {optionals.map((mat) => {
            const id = `opt_${itemId}_${mat.code}`;
            const checked = (values.selectedOptionals || []).includes(mat.code);
            return (
              <div className="radio-option" key={mat.code}>
                <input
                  className="checkbox"
                  type="checkbox"
                  id={id}
                  checked={checked}
                  onChange={(e) => toggleOptional(mat.code, e.target.checked)}
                />
                <label className="label" htmlFor={id}>
                  {mat.name}
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CalcApiOptions;

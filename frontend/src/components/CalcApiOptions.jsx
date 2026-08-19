import { useState } from "react";
import {
  addCeilShiftDefaultMm,
  clampAddCeilShiftMm,
  isAddCeilShiftEnabled,
  isAddCeilShiftParam,
} from "../utils/isolationCalcV2";

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

const CalcApiOptions = ({ spec, values, onChange, itemId }) => {
  if (!spec) return null;

  const setParam = (code, next) => {
    onChange({
      ...values,
      paramValues: { ...values.paramValues, [code]: next },
    });
  };

  const toggleOptional = (code, checked) => {
    const current = values.selectedOptionals || [];
    onChange({
      ...values,
      selectedOptionals: checked
        ? [...current, code]
        : current.filter((item) => item !== code),
    });
  };

  const params = spec.params || [];
  const optionals = spec.optionalMaterials || [];
  if (!params.length && !optionals.length) return null;

  return (
    <div className="selected-item-forms__stack">
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
                      {opt.label || (isBool ? (opt.value_bool ? "Да" : "Нет") : String(opt.value_int))}
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

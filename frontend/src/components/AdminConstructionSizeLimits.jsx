import { useEffect, useMemo, useState } from "react";
import {
  SIZE_LIMIT_DIMENSIONS,
  SIZE_LIMIT_MODES,
  createAdminConstructionSizeLimit,
  deleteAdminConstructionSizeLimit,
  isUuid,
  listAdminConstructionCalculationParams,
  listAdminConstructionSizeLimits,
  listAdminWarningContents,
  sizeLimitDimensionLabel,
  sizeLimitModeLabel,
  updateAdminConstructionSizeLimit,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import AdminCollapsibleSection from "./AdminCollapsibleSection.jsx";

const mmField = (value) =>
  value == null || value === "" ? "" : String(value);

const parseMm = (raw) => {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const stepFromLimit = (limit) => {
  const cond = (limit?.conditions || []).find(
    (row) => row.value_int != null || row.code === "step"
  );
  return cond?.value_int ?? "";
};

const draftFromLimit = (limit) => ({
  dimension: limit.dimension || "len_x",
  mode: limit.mode || "common",
  min_value: mmField(limit.min_value),
  max_value: mmField(limit.max_value),
  warning_content_id: limit.warning_content_id || "",
  step_value: mmField(stepFromLimit(limit)),
  sort_order: Number(limit.sort_order) || 0,
});

const warningOptionLabel = (item) => {
  const name = String(item?.name || "").trim();
  const code = String(item?.code || "").trim();
  const id = String(item?.id || "").trim();
  if (name && code) return `${name} (${code})`;
  return name || code || id;
};

const findStepParam = (params) =>
  (params || []).find((row) => String(row.code || "").trim() === "step") ||
  null;

const stepOptionsFromParam = (param) => {
  const fromOptions = (Array.isArray(param?.options) ? param.options : [])
    .map((opt) => Number(opt.value_int))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (fromOptions.length) return [...new Set(fromOptions)];
  const fallback = Number(param?.default_value_int);
  return Number.isFinite(fallback) && fallback > 0 ? [fallback] : [];
};

const buildPayload = (draft, stepParam) => {
  const mode = draft.mode === "parametric" ? "parametric" : "common";
  const conditions =
    mode === "parametric" && stepParam?.id
      ? [
          {
            construction_system_param_id: stepParam.id,
            value_int: Number(draft.step_value) || 0,
          },
        ]
      : [];
  return {
    dimension: draft.dimension,
    mode,
    min_value: parseMm(draft.min_value),
    max_value: parseMm(draft.max_value),
    warning_content_id: String(draft.warning_content_id || "").trim(),
    sort_order: Number(draft.sort_order) || 0,
    conditions,
  };
};

const validateDraft = (draft, stepParam) => {
  if (draft.dimension !== "len_x" && draft.dimension !== "len_z") {
    return "Выберите измерение: ширина или высота.";
  }
  if (!parseMm(draft.min_value) && !parseMm(draft.max_value)) {
    return "Укажите минимум и/или максимум в мм.";
  }
  if (!isUuid(draft.warning_content_id)) {
    return "Нужен UUID warning-блока из CMS (поле warning_content_id).";
  }
  if (draft.mode === "parametric") {
    if (!stepParam?.id) {
      return "Сначала добавьте параметр расчёта «step» у конструкции.";
    }
    if (!Number(draft.step_value)) {
      return "Для ограничения по шагу выберите значение шага профиля.";
    }
  }
  return null;
};

export default function AdminConstructionSizeLimits({ constructionId }) {
  const [rows, setRows] = useState([]);
  const [calcParams, setCalcParams] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addDraft, setAddDraft] = useState({
    dimension: "len_x",
    mode: "common",
    min_value: "",
    max_value: "",
    warning_content_id: "",
    step_value: "",
    sort_order: 0,
  });

  useEffect(() => {
    if (constructionId == null) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setAddError(null);
      setActionError(null);
      try {
        const [limits, params, cmsWarnings] = await Promise.all([
          listAdminConstructionSizeLimits(constructionId),
          listAdminConstructionCalculationParams(constructionId).catch(() => []),
          listAdminWarningContents().catch(() => []),
        ]);
        if (cancelled) return;
        setRows(limits);
        setCalcParams(params);
        setWarnings(cmsWarnings);
        setDrafts(
          Object.fromEntries(limits.map((row) => [row.id, draftFromLimit(row)]))
        );
        setAddDraft((prev) => ({
          ...prev,
          sort_order: limits.length,
          warning_content_id:
            prev.warning_content_id ||
            limits[0]?.warning_content_id ||
            cmsWarnings[0]?.id ||
            "",
          step_value:
            prev.step_value ||
            String(findStepParam(params)?.default_value_int || "") ||
            "",
        }));
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setCalcParams([]);
          setDrafts({});
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [constructionId, reloadToken]);

  const stepParam = useMemo(() => findStepParam(calcParams), [calcParams]);
  const stepOptions = useMemo(
    () => stepOptionsFromParam(stepParam),
    [stepParam]
  );

  const warningChoices = useMemo(() => {
    const byId = new Map();
    for (const item of warnings) {
      if (item?.id) byId.set(item.id, item);
    }
    for (const row of rows) {
      const item = row.warning_content;
      if (item?.id) byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [warnings, rows]);

  const patchDraft = (id, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const handleSave = async (row) => {
    const limitId = Number(row.id);
    if (!Number.isFinite(limitId) || limitId <= 0) return;
    const draft = drafts[limitId] || draftFromLimit(row);
    const invalid = validateDraft(draft, stepParam);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    setSavingId(limitId);
    setActionError(null);
    try {
      await updateAdminConstructionSizeLimit(
        constructionId,
        limitId,
        buildPayload(draft, stepParam)
      );
      setReloadToken((n) => n + 1);
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row) => {
    const limitId = Number(row.id);
    if (!Number.isFinite(limitId) || limitId <= 0) return;
    const label = `${sizeLimitDimensionLabel(row.dimension)} / ${sizeLimitModeLabel(row.mode)}`;
    if (!window.confirm(`Удалить ограничение «${label}»?`)) return;
    setDeletingId(limitId);
    setActionError(null);
    try {
      await deleteAdminConstructionSizeLimit(constructionId, limitId);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const invalid = validateDraft(addDraft, stepParam);
    if (invalid) {
      setAddError(invalid);
      return;
    }
    setAdding(true);
    setAddError(null);
    setActionError(null);
    try {
      await createAdminConstructionSizeLimit(
        constructionId,
        buildPayload({ ...addDraft, sort_order: rows.length }, stepParam)
      );
      setAddDraft((prev) => ({
        ...prev,
        min_value: "",
        max_value: "",
        step_value: stepOptions[0] ? String(stepOptions[0]) : prev.step_value,
        sort_order: rows.length + 1,
      }));
      setReloadToken((n) => n + 1);
    } catch (err) {
      setAddError(formatRequestError(err));
    } finally {
      setAdding(false);
    }
  };

  const renderWarningField = (draft, onChange, disabled) => {
    const selectedId = String(draft.warning_content_id || "").trim();
    const selected = warningChoices.find((item) => item.id === selectedId);
    const known = warningChoices.some((item) => item.id === selectedId);
    return (
      <>
        {warningChoices.length ? (
          <label className="admin-page__field">
            <span className="admin-page__field-label">Warning-блок</span>
            <select
              className="admin-page__select admin-page__select--full"
              value={known ? selectedId : ""}
              disabled={disabled}
              onChange={(e) => onChange({ warning_content_id: e.target.value })}
            >
              <option value="">Указать UUID вручную…</option>
              {warningChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {warningOptionLabel(item)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="admin-page__field">
          <span className="admin-page__field-label">UUID warning-блока</span>
          <input
            className="admin-page__input"
            value={draft.warning_content_id}
            disabled={disabled}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={(e) => onChange({ warning_content_id: e.target.value })}
          />
        </label>
        {selected?.text || selected?.name ? (
          <p className="admin-page__empty admin-page__empty--inline">
            {selected.name ? <strong>{selected.name}. </strong> : null}
            {selected.text}
          </p>
        ) : null}
      </>
    );
  };

  const renderLimitFields = (draft, onChange, disabled) => (
    <>
      <label className="admin-page__field">
        <span className="admin-page__field-label">Измерение</span>
        <select
          className="admin-page__select admin-page__select--full"
          value={draft.dimension}
          disabled={disabled}
          onChange={(e) => onChange({ dimension: e.target.value })}
        >
          {SIZE_LIMIT_DIMENSIONS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-page__field">
        <span className="admin-page__field-label">Режим</span>
        <select
          className="admin-page__select admin-page__select--full"
          value={draft.mode}
          disabled={disabled}
          onChange={(e) => onChange({ mode: e.target.value })}
        >
          {SIZE_LIMIT_MODES.map((item) => (
            <option
              key={item.code}
              value={item.code}
              disabled={item.code === "parametric" && !stepParam}
            >
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {draft.mode === "parametric" ? (
        <label className="admin-page__field">
          <span className="admin-page__field-label">Шаг профиля, мм</span>
          {stepOptions.length ? (
            <select
              className="admin-page__select admin-page__select--full"
              value={String(draft.step_value || "")}
              disabled={disabled || !stepParam}
              onChange={(e) => onChange({ step_value: e.target.value })}
            >
              <option value="">Выберите шаг…</option>
              {stepOptions.map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="admin-page__input"
              type="number"
              min="1"
              value={draft.step_value}
              disabled={disabled || !stepParam}
              onChange={(e) => onChange({ step_value: e.target.value })}
            />
          )}
        </label>
      ) : null}
      <label className="admin-page__field">
        <span className="admin-page__field-label">Минимум, мм</span>
        <input
          className="admin-page__input"
          type="number"
          min="1"
          value={draft.min_value}
          disabled={disabled}
          placeholder="не задан"
          onChange={(e) => onChange({ min_value: e.target.value })}
        />
      </label>
      <label className="admin-page__field">
        <span className="admin-page__field-label">Максимум, мм</span>
        <input
          className="admin-page__input"
          type="number"
          min="1"
          value={draft.max_value}
          disabled={disabled}
          placeholder="не задан"
          onChange={(e) => onChange({ max_value: e.target.value })}
        />
      </label>
      {renderWarningField(draft, onChange, disabled)}
    </>
  );

  return (
    <AdminCollapsibleSection
      title="Ограничения размеров"
      count={loading ? "…" : `${rows.length}`}
    >
      <p className="admin-page__empty admin-page__empty--inline">
        Попадают в калькулятор через публичные calculation-params. Пока список
        пуст, калькулятор берёт старые локальные лимиты. Для пола вторая сторона
        проверяется как высота (len_z). Обычный и параметрический режим нельзя
        смешивать на одном измерении.
      </p>

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить ограничения размеров
          </p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {actionError && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Ошибка ограничения</p>
          <pre className="admin-page__error-body">{actionError}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка ограничений…
        </p>
      ) : (
        <>
          {rows.length ? (
            <div className="admin-page__replacements">
              {rows.map((row) => {
                const draft = drafts[row.id] || draftFromLimit(row);
                const busy = savingId === row.id || deletingId === row.id;
                const stepHint =
                  row.mode === "parametric" ? stepFromLimit(row) : null;
                return (
                  <div
                    key={row.id}
                    className="admin-page__replacement-block"
                  >
                    <div className="admin-page__composition-head">
                      <h4 className="admin-page__composition-title">
                        {sizeLimitDimensionLabel(row.dimension)}
                        <span className="admin-page__count">
                          {sizeLimitModeLabel(row.mode)}
                          {stepHint ? ` · ${stepHint} мм` : ""}
                        </span>
                      </h4>
                    </div>
                    {renderLimitFields(draft, (patch) => patchDraft(row.id, patch), busy)}
                    <div className="admin-page__meta-actions">
                      <button
                        type="button"
                        className="admin-page__btn admin-page__btn--inline"
                        disabled={busy}
                        onClick={() => handleSave(row)}
                      >
                        {savingId === row.id ? "Сохранение…" : "Сохранить"}
                      </button>
                      <button
                        type="button"
                        className="admin-page__btn admin-page__btn--icon admin-page__btn--danger"
                        disabled={busy}
                        aria-label={`Удалить ограничение ${row.id}`}
                        title="Удалить"
                        onClick={() => handleDelete(row)}
                      >
                        {deletingId === row.id ? "…" : "×"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="admin-page__empty admin-page__empty--inline">
              К конструкции ещё не привязано ни одно ограничение размеров.
            </p>
          )}

          <form
            className="admin-page__create-form"
            onSubmit={handleAdd}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="admin-page__create-title">Добавить ограничение</h3>
            <div className="admin-page__create-fields admin-page__create-fields--wide">
              {renderLimitFields(
                addDraft,
                (patch) => setAddDraft((prev) => ({ ...prev, ...patch })),
                adding
              )}
              <button
                type="submit"
                className="admin-page__btn admin-page__btn--inline admin-page__create-submit"
                disabled={adding}
              >
                {adding ? "Добавление…" : "Добавить ограничение"}
              </button>
            </div>
            {addError && (
              <div className="admin-page__error" role="alert">
                <p className="admin-page__error-title">
                  Не удалось добавить ограничение
                </p>
                <pre className="admin-page__error-body">{addError}</pre>
              </div>
            )}
          </form>
        </>
      )}
    </AdminCollapsibleSection>
  );
}

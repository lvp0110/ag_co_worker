import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  deleteKpDocument,
  fetchKpDocumentDetail,
  loadKpDocumentIntoCalculator,
} from "../services/offersApi.js";
import { formatRequestError } from "../services/apiClient.js";
import { useCalculatorStore } from "../stores/calculatorStore.js";
import {
  getKpDocument,
  upsertKpDocumentFromOnec,
} from "../stores/kpOnecDocumentsStore.js";
import "./KpPage.css";

function resolveDocFromNav(documentId, navOnec, userEmail) {
  if (navOnec?.data) {
    const saved = upsertKpDocumentFromOnec(navOnec);
    if (saved) return saved;
    if (navOnec.data.id || navOnec.data.document_id) {
      return {
        id: navOnec.data.id,
        document_id: navOnec.data.document_id || navOnec.data.id,
        document_number: navOnec.data.document_number || "",
        status: navOnec.data.status || "",
        user_email: navOnec.data.user_email || "",
        user_name: navOnec.data.user_name || "",
        created_at: navOnec.data.created_at || null,
      };
    }
  }
  const fromStore = getKpDocument(documentId);
  if (fromStore) return fromStore;
  return {
    id: documentId,
    document_id: documentId,
    user_email: userEmail || "",
    created_at: null,
  };
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return String(iso);
  }
}

/**
 * Карточка КП: GET detail (конструкции/материалы), редактирование в калькуляторе,
 * удаление (если ещё не в 1С). «К списку» закрывает сессию КП.
 */
const KpPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthed, status: authStatus, user } = useAuth();

  const documentId = String(id || "").trim();
  const navOnec = location.state?.onec;
  const shouldLoadCalc = location.state?.loadCalc === true;

  const baseDoc = useMemo(() => {
    if (!documentId) return null;
    return resolveDocFromNav(documentId, navOnec, user?.email);
  }, [documentId, navOnec, user?.email]);

  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const doc = detail || baseDoc;

  useEffect(() => {
    if (authStatus === "loading" || !isAuthed || !documentId) return;

    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadingDetail(true);
      setLoadError("");
      useCalculatorStore.getState().setField("activeKpId", documentId);
      try {
        const fetched = await fetchKpDocumentDetail(documentId);
        if (cancelled) return;
        setDetail(fetched);
        upsertKpDocumentFromOnec({ data: fetched });

        if (shouldLoadCalc) {
          setLoadingCalc(true);
          await loadKpDocumentIntoCalculator(documentId, fetched);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[kp] detail/load failed:", err);
        setLoadError(err?.message || "Не удалось загрузить КП");
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
          setLoadingCalc(false);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [documentId, isAuthed, authStatus, shouldLoadCalc]);

  const displayEmail = useMemo(() => {
    if (doc?.user_email) return doc.user_email;
    return user?.email || "—";
  }, [doc?.user_email, user?.email]);

  const constructions = detail?.constructions || [];
  const materials = detail?.materials || [];

  const handleExit = () => {
    useCalculatorStore.getState().reset();
    navigate("/kp/list");
  };

  const goToCalc = async () => {
    setActionError("");
    // Если в калькуляторе уже есть данные этого КП — просто перейти.
    const store = useCalculatorStore.getState();
    if (
      store.activeKpId === documentId &&
      Array.isArray(store.ConstrToCalcToSent) &&
      store.ConstrToCalcToSent.length > 0
    ) {
      navigate("/calc");
      return;
    }
    setLoadingCalc(true);
    try {
      await loadKpDocumentIntoCalculator(documentId, detail || undefined);
      navigate("/calc");
    } catch (err) {
      setActionError(err?.message || "Не удалось открыть в калькуляторе");
    } finally {
      setLoadingCalc(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Удалить это КП? По swagger удаление возможно только если документ ещё не успешно сохранён в 1С."
      )
    ) {
      return;
    }
    setDeleting(true);
    setActionError("");
    try {
      await deleteKpDocument(documentId);
      useCalculatorStore.getState().reset();
      navigate("/kp/list");
    } catch (err) {
      console.error("[kp] delete failed:", err);
      setActionError(formatRequestError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (authStatus === "loading") {
    return (
      <div className="kp-page">
        <p className="kp-page__status">Загрузка...</p>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="kp-page">
        <p className="kp-page__status">Войдите, чтобы открыть КП.</p>
      </div>
    );
  }

  if (!documentId || !doc) {
    return (
      <div className="kp-page">
        <p className="kp-page__status">КП не найдено.</p>
        <button type="button" className="kp-page__exit-btn" onClick={handleExit}>
          К списку
        </button>
      </div>
    );
  }

  return (
    <div className="kp-page">
      <div className="kp-page__main">
        <div className="kp-page__toolbar">
          <h1 className="kp-page__title">Коммерческое предложение</h1>
          <div className="kp-page__toolbar-actions">
            <button
              type="button"
              className="kp-page__exit-btn kp-page__exit-btn--secondary"
              onClick={goToCalc}
              disabled={loadingCalc || loadingDetail}
            >
              {loadingCalc ? "Загрузка…" : "Редактировать"}
            </button>
            <button
              type="button"
              className="kp-page__exit-btn kp-page__exit-btn--danger"
              onClick={handleDelete}
              disabled={deleting || loadingDetail}
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
            <button
              type="button"
              className="kp-page__exit-btn"
              onClick={handleExit}
            >
              К списку
            </button>
          </div>
        </div>

        {loadingDetail ? (
          <p className="kp-page__status">Загрузка данных КП…</p>
        ) : null}
        {loadError ? <p className="kp-page__error">{loadError}</p> : null}
        {actionError ? (
          <pre className="kp-page__error kp-page__error--pre">{actionError}</pre>
        ) : null}

        <section className="kp-page__contact" aria-label="Данные документа">
          {doc.document_number ? (
            <div className="kp-page__field">
              <span className="kp-page__label">Номер</span>
              <p className="kp-page__value">{doc.document_number}</p>
            </div>
          ) : null}
          <div className="kp-page__field">
            <span className="kp-page__label">id</span>
            <p className="kp-page__value">{doc.id}</p>
          </div>
          <div className="kp-page__field">
            <span className="kp-page__label">document_id (1С)</span>
            <p className="kp-page__value">{doc.document_id || "—"}</p>
          </div>
          <div className="kp-page__field">
            <span className="kp-page__label">Статус</span>
            <p className="kp-page__value">{doc.status || "—"}</p>
          </div>
          <div className="kp-page__field">
            <span className="kp-page__label">user_email</span>
            <p className="kp-page__value">{displayEmail}</p>
          </div>
          {doc.user_name ? (
            <div className="kp-page__field">
              <span className="kp-page__label">user_name</span>
              <p className="kp-page__value">{doc.user_name}</p>
            </div>
          ) : null}
          <div className="kp-page__field">
            <span className="kp-page__label">Создано</span>
            <p className="kp-page__value">{formatDate(doc.created_at)}</p>
          </div>
          <div className="kp-page__field">
            <span className="kp-page__label">Обновлено</span>
            <p className="kp-page__value">{formatDate(doc.updated_at)}</p>
          </div>
          <div className="kp-page__field">
            <span className="kp-page__label">Синхронизация</span>
            <p className="kp-page__value">{formatDate(doc.synced_at)}</p>
          </div>
          {doc.last_error_message ? (
            <div className="kp-page__field">
              <span className="kp-page__label">Ошибка 1С</span>
              <p className="kp-page__value">
                {[doc.last_error_code, doc.last_error_message]
                  .filter(Boolean)
                  .join(": ")}
              </p>
            </div>
          ) : null}
        </section>

        <section className="kp-page__block" aria-label="Конструкции">
          <h2 className="kp-page__subtitle">
            Конструкции ({constructions.length})
          </h2>
          {constructions.length === 0 ? (
            <p className="kp-page__muted">Нет конструкций в ответе detail.</p>
          ) : (
            <div className="kp-page__table-wrap">
              <table className="kp-page__table">
                <thead>
                  <tr>
                    <th>code</th>
                    <th>len_x</th>
                    <th>len_y</th>
                    <th>len_z</th>
                    <th>area</th>
                    <th>perimeter</th>
                    <th>step</th>
                    <th>d_frame</th>
                    <th>проёмы</th>
                  </tr>
                </thead>
                <tbody>
                  {constructions.map((c, i) => (
                    <tr key={c.id || `${c.code}-${i}`}>
                      <td>{c.code || "—"}</td>
                      <td>{c.len_x ?? "—"}</td>
                      <td>{c.len_y ?? "—"}</td>
                      <td>{c.len_z ?? "—"}</td>
                      <td>{c.area ?? "—"}</td>
                      <td>{c.perimeter ?? "—"}</td>
                      <td>{c.step ?? "—"}</td>
                      <td>{c.d_frame ? "да" : "нет"}</td>
                      <td>
                        {Array.isArray(c.openings) ? c.openings.length : 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="kp-page__block" aria-label="Материалы">
          <h2 className="kp-page__subtitle">
            Материалы ({materials.length})
          </h2>
          {materials.length === 0 ? (
            <p className="kp-page__muted">Нет материалов в ответе detail.</p>
          ) : (
            <div className="kp-page__table-wrap">
              <table className="kp-page__table">
                <thead>
                  <tr>
                    <th>code</th>
                    <th>quantity</th>
                    <th>units</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={`${m.code}-${i}`}>
                      <td>{m.code || "—"}</td>
                      <td>{m.quantity ?? "—"}</td>
                      <td>{m.units || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default KpPage;

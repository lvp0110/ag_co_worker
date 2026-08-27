import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchMyKpDocuments } from "../services/offersApi.js";
import {
  listKpDocuments,
  replaceKpDocumentsFromList,
  wasKpListFetched,
} from "../stores/kpOnecDocumentsStore.js";
import "./KpList.css";

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function displayTitle(d) {
  return (
    d.document_number ||
    d.document_id ||
    d.id ||
    "(без номера)"
  );
}

/**
 * Список КП = GET /integration/onec/isolation/documents.
 * GET только при первом заходе / после create / по «Обновить» —
 * открытие карточки и «К списку» не перезапрашивают (кэш sessionStorage).
 */
export default function KpList() {
  const navigate = useNavigate();
  const { isAuthed, status } = useAuth();
  const [docs, setDocs] = useState(() => listKpDocuments());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchMyKpDocuments();
      replaceKpDocumentsFromList(list);
      setDocs(list);
    } catch (err) {
      console.error("[kp] list failed:", err?.url, err?.status, err?.body, err);
      setError(err?.message || "Не удалось загрузить список КП");
      setDocs(listKpDocuments());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthed) return;
    // Уже грузили в этой вкладке — только показать кэш (возврат с /kp/:id).
    if (wasKpListFetched()) {
      setDocs(listKpDocuments());
      return;
    }
    refresh();
  }, [isAuthed, status, refresh]);

  const openDoc = (d) => {
    const routeId = d.id || d.document_id;
    if (!routeId) return;
    navigate(`/kp/${routeId}`, { state: { onec: { data: d } } });
  };

  if (status === "loading") {
    return (
      <div className="kp-list">
        <p className="kp-list__empty">Загрузка...</p>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="kp-list">
        <p className="kp-list__empty">Войдите, чтобы увидеть свои КП.</p>
      </div>
    );
  }

  return (
    <div className="kp-list">
      <div className="kp-list__header">
        <h1 className="kp-list__title">Мои КП</h1>
        <div className="kp-list__header-actions">
          <button
            type="button"
            className="kp-list__new-btn kp-list__new-btn--ghost"
            onClick={() => refresh()}
            disabled={loading}
          >
            {loading ? "Обновление…" : "Обновить"}
          </button>
          <button
            type="button"
            className="kp-list__new-btn"
            onClick={() => navigate("/calc")}
          >
            В калькулятор
          </button>
        </div>
      </div>

      {error ? <p className="kp-list__error">{error}</p> : null}

      {loading && docs.length === 0 ? (
        <p className="kp-list__empty">Загрузка списка КП…</p>
      ) : docs.length === 0 ? (
        <p className="kp-list__empty">
          Пока нет КП. Создайте через «Сделать КП» в калькуляторе.
        </p>
      ) : (
        <div
          className={
            loading
              ? "kp-list__results kp-list__results--refreshing"
              : "kp-list__results"
          }
        >
          <div className="kp-list__cards" role="list">
            {docs.map((d) => (
              <article key={d.id} className="kp-list__card" role="listitem">
                <div className="kp-list__card-header">
                  <span
                    className="kp-list__card-num"
                    title={d.document_id || d.id}
                  >
                    {displayTitle(d)}
                  </span>
                  <button
                    type="button"
                    className="kp-list__link kp-list__card-title"
                    onClick={() => openDoc(d)}
                  >
                    {d.user_email || d.user_name || "(без email)"}
                  </button>
                </div>
                <dl className="kp-list__card-meta">
                  <div className="kp-list__card-row">
                    <dt>Статус</dt>
                    <dd>{d.status || "—"}</dd>
                  </div>
                  <div className="kp-list__card-row">
                    <dt>Email</dt>
                    <dd>{d.user_email || "—"}</dd>
                  </div>
                  <div className="kp-list__card-row">
                    <dt>Создано</dt>
                    <dd>{formatDate(d.created_at) || "—"}</dd>
                  </div>
                  {d.last_error_message ? (
                    <div className="kp-list__card-row">
                      <dt>Ошибка</dt>
                      <dd>{d.last_error_message}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="kp-list__card-actions">
                  <button
                    type="button"
                    className="kp-list__action-btn"
                    onClick={() => openDoc(d)}
                  >
                    Открыть
                  </button>
                </div>
              </article>
            ))}
          </div>

          <table className="kp-list__table">
            <thead>
              <tr>
                <th className="kp-list__num-col">Номер / id</th>
                <th>Статус</th>
                <th>user_email</th>
                <th>Создано</th>
                <th className="kp-list__actions-col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="kp-list__num-cell" title={d.document_id || d.id}>
                    <button
                      type="button"
                      className="kp-list__link"
                      onClick={() => openDoc(d)}
                    >
                      {displayTitle(d)}
                    </button>
                  </td>
                  <td>{d.status || "—"}</td>
                  <td>{d.user_email || "—"}</td>
                  <td>{formatDate(d.created_at) || "—"}</td>
                  <td className="kp-list__actions">
                    <button
                      type="button"
                      className="kp-list__action-btn"
                      onClick={() => openDoc(d)}
                    >
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listKpDocuments,
  removeKpDocument,
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

/**
 * Список КП = только документы из ответов 1С (sessionStorage).
 */
export default function KpList() {
  const navigate = useNavigate();
  const { isAuthed, status } = useAuth();
  const [docs, setDocs] = useState([]);

  const refresh = useCallback(() => {
    setDocs(listKpDocuments());
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAuthed) return;
    refresh();
  }, [isAuthed, status, refresh]);

  const openDoc = (documentId) => {
    navigate(`/kp/${documentId}`);
  };

  const handleRemoveLocal = (documentId) => {
    if (
      !window.confirm(
        "Убрать КП из списка этой вкладки? Документ в 1С не удаляется.",
      )
    ) {
      return;
    }
    removeKpDocument(documentId);
    refresh();
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
        <button
          type="button"
          className="kp-list__new-btn"
          onClick={() => navigate("/calc")}
        >
          В калькулятор
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="kp-list__empty">
          Пока нет КП в этой сессии. Создайте через «Сделать КП» в калькуляторе.
        </p>
      ) : (
        <div className="kp-list__results">
          <div className="kp-list__cards" role="list">
            {docs.map((d) => (
              <article
                key={d.document_id}
                className="kp-list__card"
                role="listitem"
              >
                <div className="kp-list__card-header">
                  <span className="kp-list__card-num" title={d.document_id}>
                    {d.document_id}
                  </span>
                  <button
                    type="button"
                    className="kp-list__link kp-list__card-title"
                    onClick={() => openDoc(d.document_id)}
                  >
                    {d.user_email || "(без email)"}
                  </button>
                </div>
                <dl className="kp-list__card-meta">
                  <div className="kp-list__card-row">
                    <dt>Email</dt>
                    <dd>{d.user_email || "—"}</dd>
                  </div>
                  <div className="kp-list__card-row">
                    <dt>Создано</dt>
                    <dd>{formatDate(d.created_at)}</dd>
                  </div>
                </dl>
                <div className="kp-list__card-actions">
                  <button
                    type="button"
                    className="kp-list__action-btn kp-list__action-btn--danger"
                    onClick={() => handleRemoveLocal(d.document_id)}
                  >
                    Убрать из списка
                  </button>
                </div>
              </article>
            ))}
          </div>

          <table className="kp-list__table">
            <thead>
              <tr>
                <th className="kp-list__num-col">document_id</th>
                <th>user_email</th>
                <th>Создано</th>
                <th className="kp-list__actions-col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.document_id}>
                  <td className="kp-list__num-cell" title={d.document_id}>
                    <button
                      type="button"
                      className="kp-list__link"
                      onClick={() => openDoc(d.document_id)}
                    >
                      {d.document_id}
                    </button>
                  </td>
                  <td>{d.user_email || "—"}</td>
                  <td>{formatDate(d.created_at)}</td>
                  <td className="kp-list__actions">
                    <button
                      type="button"
                      className="kp-list__action-btn kp-list__action-btn--danger"
                      onClick={() => handleRemoveLocal(d.document_id)}
                    >
                      Убрать из списка
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

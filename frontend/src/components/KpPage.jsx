import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  getKpDocument,
  upsertKpDocumentFromOnec,
} from "../stores/kpOnecDocumentsStore.js";
import "./KpPage.css";

/**
 * Карточка КП — только данные из ответа 1С (document_id, user_email).
 */
const KpPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthed, status: authStatus, user } = useAuth();

  const [doc, setDoc] = useState(null);
  const [missing, setMissing] = useState(false);

  const navOnec = location.state?.onec;

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthed) return;

    const documentId = String(id || "").trim();
    if (!documentId) {
      setMissing(true);
      return;
    }

    if (navOnec?.data?.document_id) {
      const saved = upsertKpDocumentFromOnec(navOnec);
      if (saved) {
        setDoc(saved);
        setMissing(false);
        return;
      }
    }

    const fromStore = getKpDocument(documentId);
    if (fromStore) {
      setDoc(fromStore);
      setMissing(false);
      return;
    }

    setDoc({
      document_id: documentId,
      user_email: user?.email || "",
      created_at: null,
    });
    setMissing(false);
  }, [id, isAuthed, authStatus, navOnec, user?.email]);

  const displayEmail = useMemo(() => {
    if (doc?.user_email) return doc.user_email;
    return user?.email || "—";
  }, [doc?.user_email, user?.email]);

  const handleExit = () => {
    navigate("/kp/list");
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

  if (missing || !doc) {
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
          <button type="button" className="kp-page__exit-btn" onClick={handleExit}>
            К списку
          </button>
        </div>

        <section className="kp-page__contact" aria-label="Данные 1С">
          <div className="kp-page__field">
            <span className="kp-page__label">document_id</span>
            <p className="kp-page__value">{doc.document_id}</p>
          </div>
          <div className="kp-page__field">
            <span className="kp-page__label">user_email</span>
            <p className="kp-page__value">{displayEmail}</p>
          </div>
          {user?.full_name ? (
            <div className="kp-page__field">
              <span className="kp-page__label">Менеджер (сессия)</span>
              <p className="kp-page__value">{user.full_name}</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default KpPage;

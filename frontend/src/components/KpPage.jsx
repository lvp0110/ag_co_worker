import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { loadKpDocumentIntoCalculator } from "../services/offersApi.js";
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

/**
 * Карточка КП.
 * Из списка (loadCalc=true) — подгружает конструкции в калькулятор.
 * «К списку» — сбрасывает калькулятор.
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

  const [detailDoc, setDetailDoc] = useState(null);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [loadError, setLoadError] = useState("");

  const doc = detailDoc || baseDoc;

  useEffect(() => {
    if (authStatus === "loading" || !isAuthed || !documentId) return;

    // После create / возврат с калькулятора — только activeKpId, без reload.
    if (!shouldLoadCalc) {
      useCalculatorStore.getState().setField("activeKpId", documentId);
      return;
    }

    let cancelled = false;
    const run = async () => {
      // отложить setState за микротаск — не sync внутри effect body
      await Promise.resolve();
      if (cancelled) return;
      setLoadingCalc(true);
      setLoadError("");
      try {
        const detail = await loadKpDocumentIntoCalculator(documentId);
        if (cancelled) return;
        setDetailDoc({
          id: detail.id,
          document_id: detail.document_id,
          document_number: detail.document_number,
          status: detail.status,
          user_email: detail.user_email,
          user_name: detail.user_name,
          created_at: detail.created_at,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[kp] load into calc failed:", err);
        setLoadError(err?.message || "Не удалось загрузить конструкции КП");
        useCalculatorStore.getState().setField("activeKpId", documentId);
      } finally {
        if (!cancelled) setLoadingCalc(false);
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

  const handleExit = () => {
    useCalculatorStore.getState().reset();
    navigate("/kp/list");
  };

  const goToCalc = () => {
    navigate("/calc");
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
              disabled={loadingCalc}
            >
              В калькулятор
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

        {loadingCalc ? (
          <p className="kp-page__status">Загрузка конструкций в калькулятор…</p>
        ) : null}
        {loadError ? <p className="kp-page__error">{loadError}</p> : null}

        <section className="kp-page__contact" aria-label="Данные 1С">
          {doc.document_number ? (
            <div className="kp-page__field">
              <span className="kp-page__label">Номер</span>
              <p className="kp-page__value">{doc.document_number}</p>
            </div>
          ) : null}
          <div className="kp-page__field">
            <span className="kp-page__label">document_id</span>
            <p className="kp-page__value">{doc.document_id || doc.id}</p>
          </div>
          {doc.status ? (
            <div className="kp-page__field">
              <span className="kp-page__label">Статус</span>
              <p className="kp-page__value">{doc.status}</p>
            </div>
          ) : null}
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

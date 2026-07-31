import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  getKpDocument,
  upsertKpDocumentFromOnec,
} from "../stores/kpOnecDocumentsStore.js";
import "./KpPage.css";

const fmtMm = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${Math.round(n)} мм`;
};

const fmtArea = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  // Area в calc_params хранится в мм²
  const m2 = n / 1_000_000;
  return `${m2.toFixed(2)} м²`;
};

const constructionTitle = (p) => {
  const title = String(p?.DisplayTitle || "").trim();
  if (title) return title;
  const code = String(p?.Code || p?.code || "").trim();
  return code || "Конструкция";
};

/**
 * Карточка КП — ответ 1С (document_id, user_email) + список отправленных конструкций.
 */
const KpPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthed, status: authStatus, user } = useAuth();

  const [doc, setDoc] = useState(null);
  const [missing, setMissing] = useState(false);

  const navOnec = location.state?.onec;
  const navConstructions = location.state?.constructions;

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthed) return;

    const documentId = String(id || "").trim();
    if (!documentId) {
      setMissing(true);
      return;
    }

    if (navOnec?.data?.document_id) {
      const saved = upsertKpDocumentFromOnec(navOnec, {
        constructions: navConstructions,
      });
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
      constructions: [],
      created_at: null,
    });
    setMissing(false);
  }, [id, isAuthed, authStatus, navOnec, navConstructions, user?.email]);

  const displayEmail = useMemo(() => {
    if (doc?.user_email) return doc.user_email;
    return user?.email || "—";
  }, [doc?.user_email, user?.email]);

  const constructions = Array.isArray(doc?.constructions)
    ? doc.constructions
    : [];

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

        <section className="kp-page__constructions" aria-label="Конструкции">
          <h2 className="kp-page__section-title">
            Конструкции ({constructions.length})
          </h2>
          {constructions.length === 0 ? (
            <p className="kp-page__empty">
              Список конструкций для этого КП в этой вкладке не сохранён.
              Откройте КП сразу после создания или создайте заново.
            </p>
          ) : (
            <ol className="kp-page__constr-list">
              {constructions.map((c, index) => {
                const p = c?.calc_params || {};
                const code = String(p.Code || p.code || "").trim();
                const desc = String(p.DisplayDescription || "").trim();
                return (
                  <li key={`${code}-${index}`} className="kp-page__constr-item">
                    <div className="kp-page__constr-head">
                      <span className="kp-page__constr-index">{index + 1}.</span>
                      <span className="kp-page__constr-name">
                        {constructionTitle(p)}
                      </span>
                      {code ? (
                        <span className="kp-page__constr-code">{code}</span>
                      ) : null}
                    </div>
                    {desc ? (
                      <p className="kp-page__constr-desc">{desc}</p>
                    ) : null}
                    <dl className="kp-page__constr-meta">
                      <div>
                        <dt>Длина</dt>
                        <dd>{fmtMm(p.LenX ?? p.lenX)}</dd>
                      </div>
                      <div>
                        <dt>Ширина</dt>
                        <dd>{fmtMm(p.LenY ?? p.lenY)}</dd>
                      </div>
                      <div>
                        <dt>Высота</dt>
                        <dd>{fmtMm(p.LenZ ?? p.lenZ)}</dd>
                      </div>
                      <div>
                        <dt>Площадь</dt>
                        <dd>{fmtArea(p.Area ?? p.area)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

export default KpPage;
